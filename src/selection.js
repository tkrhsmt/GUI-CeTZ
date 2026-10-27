'use strict';

function withSelectionMarker(xml, index, token) {
  return withSelectionMarkers(xml, [index], token);
}

function withSelectionMarkers(xml, indices, token) {
  if (!indices.length || indices.some(index => !Number.isSafeInteger(index) || index < 0) || !/^[\w-]+$/.test(token))
    throw new Error('Invalid CeTZ selection marker');
  const withoutOld = xml.replace(/<mxCell id="cetz-select-[\w-]+"[^>]*><mxGeometry[^>]*\/><\/mxCell>/g, '');
  const marker = `<mxCell id="cetz-select-${token}" value="" style="opacity=0;strokeColor=none;fillColor=none;cetzSelect=${indices.join(',')};" vertex="1" parent="1"><mxGeometry x="-1000" y="-1000" width="1" height="1" as="geometry"/></mxCell>`;
  return withoutOld.replace('</root>', marker + '</root>');
}

async function selectSourceCalls(vscode, source, calls, indices) {
  const selected = indices.map(index => calls[index]);
  if (!selected.length || selected.some(call => !call)) return;
  const editor = vscode.window.visibleTextEditors.find(editor =>
    editor.document.uri.toString() === source.uri.toString()) ||
    await vscode.window.showTextDocument(source, {
      viewColumn: vscode.ViewColumn.One, preserveFocus: true
    });
  editor.selections = selected.map(call => new vscode.Selection(
    source.positionAt(call.start), source.positionAt(call.end)));
  editor.revealRange(new vscode.Range(editor.selections[0].start, editor.selections[0].end));
}

module.exports = { withSelectionMarker, withSelectionMarkers, selectSourceCalls };
