'use strict';
const vscode = require('vscode');
const path = require('path');
const { locateCanvases } = require('./scanner');
const { parseCanvas } = require('./diagram');
const { xmlForDiagram, patchesFromXml } = require('./drawio');
const { renderCanvas, imageDiagram } = require('./preview');

const sessions = new Map();
function key(uri) { return uri.toString(); }
function documentForSession(session) { return vscode.workspace.openTextDocument(session.sourceUri); }
function diagramUri(sourceUri, index) {
  const parsed = path.parse(sourceUri.fsPath);
  return vscode.Uri.file(path.join(parsed.dir, parsed.name + '.cetz-' + (index + 1) + '.drawio'));
}
function pickCanvas(text, offset) {
  const all = locateCanvases(text);
  if (!all.length) throw new Error('No cetz.canvas({ ... }) found in this file.');
  const selected = all.findIndex(c => offset >= c.start && offset <= c.end);
  return selected >= 0 ? selected : 0;
}
function usableDiagram(text, index) {
  const diagram = parseCanvas(text, index);
  if (!diagram) throw new Error('The selected CeTZ canvas no longer exists.');
  // An empty canvas can still be populated from Draw.io.
  return diagram;
}
async function updateDiagramDocument(session, xml) {
  let doc;
  try { doc = await vscode.workspace.openTextDocument(session.diagramUri); }
  catch { await vscode.workspace.fs.writeFile(session.diagramUri, Buffer.from(xml, 'utf8')); doc = await vscode.workspace.openTextDocument(session.diagramUri); }
  if (doc.getText() === xml) { session.lastXml = xml; return; }
  session.writingDiagram = true;
  try {
    const edit = new vscode.WorkspaceEdit();
    edit.replace(session.diagramUri, new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), xml);
    if (!await vscode.workspace.applyEdit(edit)) throw new Error('Could not update the Draw.io document.');
    session.lastXml = xml;
  } finally { session.writingDiagram = false; }
}
async function syncFromSource(session) {
  const generation = session.syncGeneration = (session.syncGeneration || 0) + 1;
  const doc = await documentForSession(session);
  const text = doc.getText();
  const diagram = usableDiagram(text, session.index);
  const preview = diagram.unsupported.length > 0;
  const xml = preview ? imageDiagram(await renderCanvas(text, diagram.canvas, session.sourceUri.fsPath)) : xmlForDiagram(text, diagram);
  if (generation !== session.syncGeneration || (await documentForSession(session)).version !== doc.version) return;
  await updateDiagramDocument(session, xml);
  session.sourceVersion = doc.version;
  session.diagram = diagram;
  session.preview = preview;
}
async function syncToSource(session) {
  if (session.writingDiagram || session.writingSource) return;
  const gui = await vscode.workspace.openTextDocument(session.diagramUri);
  const xml = gui.getText();
  if (xml === session.lastXml) return;
  if (session.preview) {
    await syncFromSource(session);
    return;
  }
  const source = await documentForSession(session);
  if (source.version !== session.sourceVersion) {
    await syncFromSource(session);
    throw new Error('Typst changed while the GUI was being edited. The GUI was refreshed from Typst; retry your change.');
  }
  const patches = patchesFromXml(source.getText(), session.diagram, xml);
  if (patches.length) {
    const edit = new vscode.WorkspaceEdit();
    for (const p of patches) edit.replace(session.sourceUri,
      new vscode.Range(source.positionAt(p.start), source.positionAt(p.end)), p.text);
    session.writingSource = true;
    try {
      if (!await vscode.workspace.applyEdit(edit)) throw new Error('Could not apply the CeTZ source edit.');
      const updated = await documentForSession(session);
      session.sourceVersion = updated.version;
      session.diagram = usableDiagram(updated.getText(), session.index);
    } finally { session.writingSource = false; }
  }
  if (patches.needsRefresh) await syncFromSource(session);
  else session.lastXml = xml;
}
async function openGui() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'typst' && !editor.document.fileName.endsWith('.typ'))
    throw new Error('Open a .typ file and place the cursor in a CeTZ canvas first.');
  const doc = editor.document;
  const index = pickCanvas(doc.getText(), doc.offsetAt(editor.selection.active));
  const uri = diagramUri(doc.uri, index);
  let session = sessions.get(key(uri));
  if (!session) {
    session = { sourceUri: doc.uri, diagramUri: uri, index, sourceVersion: -1,
      diagram: null, lastXml: '', writingDiagram: false, writingSource: false, timer: null };
    sessions.set(key(uri), session);
  }
  await syncFromSource(session);
  await vscode.commands.executeCommand('vscode.openWith', uri, 'hediet.vscode-drawio-text', vscode.ViewColumn.Beside);
  if (session.preview)
    vscode.window.showInformationMessage('CeTZ: This canvas is shown as a Typst-rendered preview because it contains operations that cannot be safely edited as Draw.io shapes. Edit it in Typst.');
}
function report(error) { vscode.window.showErrorMessage('CeTZ: ' + (error instanceof Error ? error.message : String(error))); }
function activate(context) {
  context.subscriptions.push(vscode.commands.registerCommand('cetzEditor.open', () => openGui().catch(report)));
  context.subscriptions.push(vscode.commands.registerCommand('cetzEditor.syncFromSource', async () => {
    const uri = vscode.window.activeTextEditor?.document.uri;
    const candidates = [...sessions.values()].filter(s => !uri || key(s.sourceUri) === key(uri) || key(s.diagramUri) === key(uri));
    for (const session of candidates) await syncFromSource(session).catch(report);
  }));
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
    for (const session of sessions.values()) {
      if (key(event.document.uri) === key(session.sourceUri) && !session.writingSource) {
        if (session.timer) clearTimeout(session.timer);
        session.timer = setTimeout(() => syncFromSource(session).catch(report), 180);
      } else if (key(event.document.uri) === key(session.diagramUri) && !session.writingDiagram) {
        if (session.timer) clearTimeout(session.timer);
        session.timer = setTimeout(() => syncToSource(session).catch(async error => {
          report(error);
          await syncFromSource(session).catch(report);
        }), 180);
      }
    }
  }));
  context.subscriptions.push({ dispose: () => { for (const s of sessions.values()) if (s.timer) clearTimeout(s.timer); sessions.clear(); } });
}
module.exports = { activate, deactivate() {}, pickCanvas, diagramUri };
