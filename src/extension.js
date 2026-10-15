'use strict';
const vscode = require('vscode');
const path = require('path');
const { locateCanvases } = require('./scanner');
const { parseCanvas } = require('./diagram');
const { readAllCells } = require('./drawio');
const { patchesFromEditable } = require('./advanced');
const { renderDiagram } = require('./render-diagram');
const { SHAPES, insertionFor, templateInsertions } = require('./templates');
const { EditHistory, historyAction } = require('./history');
const { withDiagramStatus } = require('./diagram-status');
const { launchHints } = require('./launch-hints');

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
async function refreshGuiView(session) {
  const doc = await vscode.workspace.openTextDocument(session.diagramUri);
  await doc.save();
  // Editable previews replace the SVG cell during Draw.io's live document merge.
  // Keep the full reload for locked previews, which have no editable image cell.
  if (!session.editable)
    await vscode.commands.executeCommand('workbench.action.webview.reloadWebviewAction');
}
async function applySourcePatches(session, source, patches) {
  if (!patches.length) return;
  const before = source.getText();
  let expected = before;
  for (const patch of [...patches].sort((a, b) => b.start - a.start))
    expected = expected.slice(0, patch.start) + patch.text + expected.slice(patch.end);
  session.expectedSourceText = expected;
  const edit = new vscode.WorkspaceEdit();
  for (const patch of patches) edit.replace(session.sourceUri,
    new vscode.Range(source.positionAt(patch.start), source.positionAt(patch.end)), patch.text);
  session.writingSource = true;
  try {
    if (!await vscode.workspace.applyEdit(edit)) throw new Error('Could not apply the CeTZ edit.');
    const updated = await documentForSession(session);
    session.history.record(before, updated.getText());
  } finally { session.writingSource = false; }
}
async function applyHistoryAction(session, action) {
  const source = await documentForSession(session);
  const replacement = session.history.step(action, source.getText());
  session.expectedSourceText = replacement;
  const edit = new vscode.WorkspaceEdit();
  edit.replace(session.sourceUri,
    new vscode.Range(source.positionAt(0), source.positionAt(source.getText().length)), replacement);
  session.writingSource = true;
  try { if (!await vscode.workspace.applyEdit(edit)) throw new Error(`Could not ${action} the CeTZ edit.`); }
  finally { session.writingSource = false; }
  await syncFromSource(session);
  await refreshGuiView(session);
}
async function syncFromSource(session) {
  const generation = session.syncGeneration = (session.syncGeneration || 0) + 1;
  const doc = await documentForSession(session);
  const text = doc.getText();
  const diagram = usableDiagram(text, session.index);
  const { xml, editable } = await renderDiagram(text, diagram.canvas, session.sourceUri.fsPath);
  if (generation !== session.syncGeneration || (await documentForSession(session)).version !== doc.version) return;
  await updateDiagramDocument(session, xml);
  session.sourceVersion = doc.version;
  session.diagram = diagram;
  session.editable = editable;
}
async function syncToSource(session) {
  if (session.writingDiagram || session.writingSource) return;
  const gui = await vscode.workspace.openTextDocument(session.diagramUri);
  const xml = gui.getText();
  if (xml === session.lastXml) return;
  const command = historyAction(readAllCells(xml), readAllCells(session.lastXml), session.handledHistoryActions);
  if (command) session.handledHistoryActions.add(command.key);
  if (command && session.history.canStep(command.action)) {
    try { await applyHistoryAction(session, command.action); }
    catch (error) { await syncFromSource(session); await refreshGuiView(session); throw error; }
    return;
  }
  if (session.editable) {
    const source = await documentForSession(session);
    if (source.version !== session.sourceVersion) {
      await syncFromSource(session);
      throw new Error('Typst changed while the GUI was being edited. The GUI was refreshed from Typst.');
    }
    const patches = patchesFromEditable(source.getText(), session.editable, xml, readAllCells);
    await applySourcePatches(session, source, patches);
    await syncFromSource(session);
    if (patches.length) await refreshGuiView(session);
    return;
  }
  const source = await documentForSession(session);
  if (source.version !== session.sourceVersion) {
    await syncFromSource(session);
    throw new Error('Typst changed while the GUI was being edited. The GUI was refreshed from Typst.');
  }
  const patches = templateInsertions(source.getText(), session.diagram.canvas,
    readAllCells(xml), readAllCells(session.lastXml));
  await applySourcePatches(session, source, patches);
  await syncFromSource(session);
  if (patches.length) await refreshGuiView(session);
}
async function openGui(sourceUri, canvasIndex) {
  const editor = vscode.window.activeTextEditor;
  const doc = sourceUri ? await vscode.workspace.openTextDocument(sourceUri) : editor?.document;
  if (!doc || doc.languageId !== 'typst' && !doc.fileName.endsWith('.typ'))
    throw new Error('Open a .typ file and place the cursor in a CeTZ canvas first.');
  const index = Number.isInteger(canvasIndex) ? canvasIndex :
    pickCanvas(doc.getText(), doc.offsetAt(editor.selection.active));
  if (!locateCanvases(doc.getText())[index]) throw new Error('The selected CeTZ canvas no longer exists.');
  const uri = diagramUri(doc.uri, index);
  let session = sessions.get(key(uri));
  if (!session) {
    session = { sourceUri: doc.uri, diagramUri: uri, index, sourceVersion: -1,
      diagram: null, lastXml: '', writingDiagram: false, writingSource: false, timer: null,
      history: new EditHistory(), handledHistoryActions: new Set() };
    sessions.set(key(uri), session);
  }
  await syncFromSource(session);
  await vscode.commands.executeCommand('vscode.openWith', uri, 'hediet.vscode-drawio-text', vscode.ViewColumn.Beside);
  if (!session.editable || !session.editable.calls.length)
    vscode.window.showInformationMessage('CeTZ: This canvas has no directly editable literal shapes. The Typst preview is available; add shapes from the CeTZ palette or edit the source.');
}
async function insertShape() {
  const editor = vscode.window.activeTextEditor;
  const tabUri = vscode.window.tabGroups.activeTabGroup.activeTab?.input?.uri;
  const session = tabUri && sessions.get(key(tabUri));
  const document = session ? await documentForSession(session) :
    editor?.document.fileName.endsWith('.typ') ? editor.document : null;
  if (!document) throw new Error('Open a .typ canvas or its CeTZ Draw.io tab first.');
  const source = document.getText();
  const canvases = locateCanvases(source);
  const offset = editor?.document === document ? document.offsetAt(editor.selection.active) : -1;
  const canvas = session ? canvases[session.index] :
    canvases.find(item => offset >= item.start && offset <= item.end);
  if (!canvas) throw new Error('Place the cursor in a CeTZ canvas before inserting a shape.');
  const selected = await vscode.window.showQuickPick(SHAPES.map(shape => shape.label), {
    title: 'CeTZ: Insert Shape', placeHolder: 'Choose a CeTZ draw function'
  });
  if (!selected) return;
  const shape = SHAPES.find(item => item.label === selected);
  const insertion = insertionFor(source, canvas, shape.call);
  const edit = new vscode.WorkspaceEdit();
  edit.insert(document.uri, document.positionAt(insertion.offset), insertion.text);
  if (!await vscode.workspace.applyEdit(edit)) throw new Error('Could not insert the CeTZ call.');
}
function report(error) { vscode.window.showErrorMessage('CeTZ: ' + (error instanceof Error ? error.message : String(error))); }
async function showSyncError(session, error) {
  if (!session.lastXml) return report(error);
  const message = error instanceof Error ? error.message : String(error);
  await updateDiagramDocument(session, withDiagramStatus(session.lastXml, message));
  await refreshGuiView(session);
}
function activate(context) {
  context.subscriptions.push(vscode.commands.registerCommand('cetzEditor.open', (uri, index) => openGui(uri, index).catch(report)));
  context.subscriptions.push(vscode.languages.registerInlayHintsProvider(
    [{ pattern: '**/*.typ' }, { language: 'typst' }],
    { provideInlayHints: (document, range) => launchHints(vscode, document, range) }
  ));
  context.subscriptions.push(vscode.commands.registerCommand('cetzEditor.insertShape', () => insertShape().catch(report)));
  context.subscriptions.push(vscode.commands.registerCommand('cetzEditor.syncFromSource', async () => {
    const uri = vscode.window.activeTextEditor?.document.uri;
    const candidates = [...sessions.values()].filter(s => !uri || key(s.sourceUri) === key(uri) || key(s.diagramUri) === key(uri));
    for (const session of candidates) await syncFromSource(session).catch(report);
  }));
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
    for (const session of sessions.values()) {
      if (key(event.document.uri) === key(session.sourceUri) && !session.writingSource) {
        if (event.document.getText() === session.expectedSourceText) {
          session.expectedSourceText = null;
          continue;
        }
        session.expectedSourceText = null;
        session.history.clear();
        if (session.timer) clearTimeout(session.timer);
        const version = event.document.version;
        session.timer = setTimeout(async () => {
          try { await syncFromSource(session); await refreshGuiView(session); }
          catch (error) {
            if ((await documentForSession(session)).version === version)
              await showSyncError(session, error).catch(report);
          }
        }, 180);
      } else if (key(event.document.uri) === key(session.diagramUri) && !session.writingDiagram) {
        if (session.timer) clearTimeout(session.timer);
        session.timer = setTimeout(() => syncToSource(session).catch(async error => {
          await syncFromSource(session).catch(() => {});
          await showSyncError(session, error).catch(report);
        }), 180);
      }
    }
  }));
  context.subscriptions.push({ dispose: () => { for (const s of sessions.values()) if (s.timer) clearTimeout(s.timer); sessions.clear(); } });
}
module.exports = { activate, deactivate() {}, pickCanvas, diagramUri };
