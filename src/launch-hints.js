'use strict';
const { locateCanvases } = require('./scanner');

function launchHints(vscode, document, range) {
  if (!document.fileName.endsWith('.typ')) return [];
  const text = document.getText();
  return locateCanvases(text).flatMap((canvas, index) => {
    const offset = text[canvas.start - 1] === '#' ? canvas.start - 1 : canvas.start;
    const position = document.positionAt(offset);
    if (!range.contains(position)) return [];
    const label = new vscode.InlayHintLabelPart('▶ GUI CeTZ');
    label.tooltip = 'Open this CeTZ canvas in the GUI editor';
    label.command = { title: 'CeTZ: Open GUI Editor', command: 'cetzEditor.open', arguments: [document.uri, index] };
    const hint = new vscode.InlayHint(position, [label], vscode.InlayHintKind.Type);
    hint.paddingRight = true;
    return [hint];
  });
}

module.exports = { launchHints };
