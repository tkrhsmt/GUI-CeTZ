'use strict';
const vscode = require('vscode');
const { locateCanvases } = require('./scanner');
const { parseCanvas } = require('./diagram');
const { readAllCells } = require('./drawio');
const { patchesFromEditable, renderEditable } = require('./advanced');
const { renderDiagram } = require('./render-diagram');
const { PLACEMENT_SHAPES, insertionFor, templateInsertions } = require('./templates');
const { EditHistory, historyAction } = require('./history');
const { sourceAction, sourceActionPatches } = require('./source-actions');
const { ACTIONS: PATH_ACTIONS } = require('./path-operations');
const { exportTypst } = require('./export');
const { withSelectionMarker, withSelectionMarkers, selectSourceCalls } = require('./selection');
const { bindScene, sceneRevision, sourceIndices } = require('./scene');
const { copyShapes, pasteShapes } = require('./clipboard');
const { withDiagramStatus } = require('./diagram-status');
const { launchCodeLenses } = require('./launch-code-lenses');
const { ensureDrawioPlugin } = require('./plugin-settings');
const { SCHEME, diagramUri: virtualDiagramUri, sourceForDiagramUri, DiagramFiles } = require('./diagram-files');

const sessions = new Map();
function key(uri) { return uri.toString(); }
function documentForSession(session) { return vscode.workspace.openTextDocument(session.sourceUri); }
function diagramUri(sourceUri, index) {
  return virtualDiagramUri(vscode, sourceUri, index);
}
function sessionFor(sourceUri, uri, index, diagramFiles) {
  let session = sessions.get(key(uri));
  if (!session) {
    session = { sourceUri, diagramUri: uri, index, sourceVersion: -1,
      diagram: null, lastXml: '', writingDiagram: false, writingSource: false, timer: null,
      diagramFiles,
      history: new EditHistory(), handledHistoryActions: new Set() };
    sessions.set(key(uri), session);
  }
  return session;
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
async function updateDiagramDocument(session, xml, diagramFiles) {
  diagramFiles.initialize(session.diagramUri, Buffer.from(xml, 'utf8'));
  const doc = await vscode.workspace.openTextDocument(session.diagramUri);
  if (doc.getText() === xml) { session.lastXml = xml; return; }
  session.writingDiagram = true;
  try {
    const edit = new vscode.WorkspaceEdit();
    edit.replace(session.diagramUri, new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), xml);
    if (!await vscode.workspace.applyEdit(edit)) throw new Error('Could not update the Draw.io document.');
    session.lastXml = xml;
  } finally { session.writingDiagram = false; }
}
async function refreshGuiView(session, force = false) {
  // Editable previews replace the SVG cell during Draw.io's live document merge.
  // Keep the full reload for locked previews, which have no editable image cell.
  if (force || !session.editable)
    await vscode.commands.executeCommand('workbench.action.webview.reloadWebviewAction');
}
function sourceWithPatches(text, patches) {
  return [...patches].sort((a, b) => b.start - a.start)
    .reduce((value, patch) => value.slice(0, patch.start) + patch.text + value.slice(patch.end), text);
}
function planeScopedDiagram(text,session) {
  const diagram=usableDiagram(text,session.index);
  if(session.workspaceMode==='2d'&&session.activePlaneKey){
    const plane=require('./plane-editor').resolvePlane(text,diagram.canvas,session.activePlaneKey);
    if(plane)return {...diagram,canvas:{...diagram.canvas,bodyStart:plane.bodyStart,bodyEnd:plane.bodyEnd},planeContext:{key:plane.key}};
  }
  return diagram;
}
function decorateWorkspace(editable,state) {
  if(!editable?.workspace)return;
  const planes=editable.workspace.planes||[];
  const active=planes.some(plane=>plane.key===state.activePlaneKey)?state.activePlaneKey:planes[0]?.key||null;
  editable.workspace.activePlaneKey=active;state.activePlaneKey=active;
  editable.xml=editable.xml.replace(/cetzWorkspace=[^;]*;/,`cetzWorkspace=${encodeURIComponent(JSON.stringify(editable.workspace))};`);
}
async function sessionRender(session,text,strict=false,requestedKey=session.activePlaneKey) {
  const canvas=usableDiagram(text,session.index).canvas;
  const full=strict?{editable:await renderEditable(text,canvas,session.sourceUri.fsPath)}:
    await renderDiagram(text,canvas,session.sourceUri.fsPath);
  const state={workspaceMode:session.workspaceMode,activePlaneKey:requestedKey};
  decorateWorkspace(full.editable,state);
  if(state.workspaceMode==='2d'&&full.editable?.mode==='3d'){
    if(!requestedKey||!require('./plane-editor').resolvePlane(text,canvas,requestedKey)){
      if(strict)throw new Error('The drawing plane changed. Return to 3D and choose a plane.');
      state.workspaceMode='3d';
      return {editable:full.editable,xml:withDiagramStatus(full.editable.xml,'The selected plane no longer exists. Choose a drawing plane in 3D.'),state};
    }
    const editable=await require('./plane-editor').renderPlane2D(text,canvas,requestedKey,session.sourceUri.fsPath,full.editable);
    return {editable,xml:editable.xml,state};
  }
  return {editable:full.editable,xml:full.editable?.xml||full.xml,state};
}
async function applySourcePatches(session, source, patches, deferInvalid = false, historyGroup) {
  if (!patches.length) return;
  const sourceVersion = source.version;
  const before = source.getText();
  if (session.sceneSource !== undefined && before !== session.sceneSource)
    throw new Error('Typst changed while the GUI was being edited.');
  if(session.editable?.planeContext && patches.some(patch=>patch.start<session.editable.planeContext.bodyStart||patch.end>session.editable.planeContext.bodyEnd))
    throw new Error('This edit would affect another drawing plane. Edit it in the 3D view.');
  const expected = sourceWithPatches(before, patches);
  const nextKey=Object.hasOwn(patches,'activePlaneKey')?patches.activePlaneKey:require('./plane-editor').rebasePlaneKey(session.activePlaneKey,before,expected);
  // A GUI edit must preserve an editable preview. Otherwise renderDiagram's
  // fallback would replace all handles with a locked image after the write.
  let prepared;
  try {
    prepared = session.editable?await sessionRender(session,expected,true,nextKey):null;
  } catch (error) {
    // Automatic inspector input is a draft until Typst accepts it. Keep the
    // last valid source and artwork while an expression is still incomplete.
    if (deferInvalid) return false;
    throw error;
  }
  if ((await documentForSession(session)).version !== sourceVersion)
    throw new Error('Typst changed while the GUI was being edited.');
  session.expectedSourceText = expected;
  const edit = new vscode.WorkspaceEdit();
  for (const patch of patches) edit.replace(session.sourceUri,
    new vscode.Range(source.positionAt(patch.start), source.positionAt(patch.end)), patch.text);
  session.writingSource = true;
  let applied = false;
  try {
    if (!await vscode.workspace.applyEdit(edit)) throw new Error('Could not apply the CeTZ edit.');
    applied = true;
    const updated = await documentForSession(session);
    if (prepared && updated.getText() === expected) {
      Object.assign(session,prepared.state);
      session.preparedRender = { text: expected, editable: prepared.editable, xml:prepared.xml,state:prepared.state };
    }
    session.history.record(before, updated.getText(), historyGroup);
  } finally {
    if (!applied) session.expectedSourceText = null;
    session.writingSource = false;
  }
}
async function applyHistoryAction(session, action) {
  const source = await documentForSession(session);
  const replacement = session.history.step(action, source.getText());
  session.expectedSourceText = replacement;
  const edit = new vscode.WorkspaceEdit();
  edit.replace(session.sourceUri,
    new vscode.Range(source.positionAt(0), source.positionAt(source.getText().length)), replacement);
  session.writingSource = true;
  let applied = false;
  try {
    if (!await vscode.workspace.applyEdit(edit)) throw new Error(`Could not ${action} the CeTZ edit.`);
    applied = true;
  } finally {
    if (!applied) {
      session.expectedSourceText = null;
      session.history.step(action === 'undo' ? 'redo' : 'undo', replacement);
    }
    session.writingSource = false;
  }
  await syncFromSource(session);
  await refreshGuiView(session);
}
async function syncFromSource(session) {
  const generation = session.syncGeneration = (session.syncGeneration || 0) + 1;
  const doc = await documentForSession(session);
  const sourceVersion = doc.version;
  const text = doc.getText();
  const diagram = usableDiagram(text, session.index);
  const prepared = session.preparedRender;
  session.preparedRender = null;
  const requestedKey=require('./plane-editor').rebasePlaneKey(session.activePlaneKey,session.sceneSource||text,text);
  const result=prepared&&prepared.text===text?prepared:await sessionRender(session,text,false,requestedKey);
  const {xml:renderedXml,editable}=result;
  if (generation !== session.syncGeneration || (await documentForSession(session)).version !== sourceVersion) return;
  const scene = Object.fromEntries(['sceneBase', 'sceneSpan', 'sceneSignature', 'sceneRevision', 'sceneSource']
    .map(name => [name, session[name]]));
  const xml = bindScene(scene, text, renderedXml, editable);
  await updateDiagramDocument(session, xml, session.diagramFiles);
  Object.assign(session, scene);
  Object.assign(session,result.state);
  session.sourceVersion = sourceVersion;
  session.diagram = diagram;
  session.editable = editable;
}
async function acceptDiagramSnapshot(session, xml) {
  const clean = withDiagramStatus(xml, null);
  if (clean !== xml) await updateDiagramDocument(session, clean, session.diagramFiles);
  else session.lastXml = xml;
}
async function syncToSource(session) {
  if (session.writingDiagram || session.writingSource) return;
  const gui = await vscode.workspace.openTextDocument(session.diagramUri);
  const xml = gui.getText();
  if (xml === session.lastXml) return;
  const stale = session.sceneRevision !== undefined && sceneRevision(xml) !== session.sceneRevision;
  const command = historyAction(readAllCells(xml), readAllCells(session.lastXml), session.handledHistoryActions);
  if (stale && !command) {
    await updateDiagramDocument(session, session.lastXml, session.diagramFiles);
    return;
  }
  if (command) {
    session.handledHistoryActions.add(command.key);
    try {
      // Draw.io debounces saves. A deletion and Cmd+Z can share a snapshot,
      // so record the pending GUI edit before undoing the most recent edit.
      const source = await documentForSession(session);
      const pending = !stale && session.editable && source.version === session.sourceVersion
        ? patchesFromEditable(source.getText(), session.editable, xml, readAllCells) : [];
      await applySourcePatches(session, source, pending);
      if (session.history.canStep(command.action)) await applyHistoryAction(session, command.action);
      else if (pending.length) {
        await syncFromSource(session);
        await refreshGuiView(session);
      } else session.lastXml = xml;
    }
    catch (error) { await syncFromSource(session); await refreshGuiView(session); throw error; }
    return;
  }
  const sourceCommand = sourceAction(readAllCells(xml), readAllCells(session.lastXml), session.handledHistoryActions);
  if (sourceCommand) {
    session.handledHistoryActions.add(sourceCommand.key);
    sourceCommand.indices = sourceIndices(session.editable, sourceCommand.indices);
    const source = await documentForSession(session);
    if (source.version !== session.sourceVersion) {
      await syncFromSource(session);
      throw new Error('Typst changed while the GUI was being edited. The GUI was refreshed from Typst.');
    }
    if (sourceCommand.action === 'export') {
      await syncFromSource(session);
      await exportTypst(vscode, source);
      return;
    }
    if(sourceCommand.action==='workspace-mode'){
      const request=JSON.parse(decodeURIComponent(sourceCommand.value||''));
      if(!['2d','3d'].includes(request.mode))throw new Error('Choose 2D or 3D drawing.');
      const oldState={workspaceMode:session.workspaceMode,activePlaneKey:session.activePlaneKey};
      try{
        const before=source.getText();
        const pending=session.editable?patchesFromEditable(before,session.editable,xml,readAllCells):[];
        await applySourcePatches(session,source,pending);
        const current=await documentForSession(session),text=current.getText(),canvas=usableDiagram(text,session.index).canvas;
        if(request.mode==='3d'&&!require('./three-dimensional').is3DCanvas(text,canvas)){
          session.workspaceMode='3d';
          const conversion=require('./plane-editor').convertTo3D(text,canvas);
          await applySourcePatches(session,current,conversion);
        } else if(request.mode==='2d'&&require('./three-dimensional').is3DCanvas(text,canvas)){
          const key=require('./plane-editor').rebasePlaneKey(request.planeKey||session.activePlaneKey,before,text);
          const plane=require('./plane-editor').resolvePlane(text,canvas,key);
          if(!plane)throw new Error('Select a drawing plane in the 3D settings before opening 2D drawing.');
          session.workspaceMode='2d';session.activePlaneKey=plane.key;
        }else{session.workspaceMode=request.mode;if(request.mode==='2d')session.activePlaneKey=null;}
        session.preparedRender=null;
        await syncFromSource(session);await refreshGuiView(session);
      }catch(error){Object.assign(session,oldState);session.preparedRender=null;await syncFromSource(session);await refreshGuiView(session);throw error;}
      return;
    }
    if (!session.editable) throw new Error('This canvas has no editable CeTZ shapes.');
    try {
      if (session.editable.mode === '3d' && !['properties', 'focus', 'select', 'export', 'create-view', 'plane-create', 'plane-settings', 'plane-delete', 'camera-position', 'projection-kind', 'spatial-edit', 'move-before', 'move-after'].includes(sourceCommand.action))
        throw new Error(require('./three-dimensional').MESSAGE);
      if (sourceCommand.action === 'copy') {
        await vscode.env.clipboard.writeText(copyShapes(source.getText(), session.editable, sourceCommand.indices));
        session.pasteClipboard = null;
        session.pasteCount = 0;
        // Copy and paste can arrive within a single debounced Draw.io save.
        // Consume copy first so a following paste reads the captured snapshot.
        return syncToSource(session);
      }
      if (sourceCommand.action === 'paste') {
        const clipboard = await vscode.env.clipboard.readText();
        let pasteCount = session.pasteClipboard === clipboard ? session.pasteCount || 0 : 0;
        const patches = pasteShapes(source.getText(), session.editable, clipboard, ++pasteCount);
        // Several paste shortcuts can be saved together by Draw.io. Keep each
        // requested paste, allocating names against the preceding copies.
        for (;;) {
          const next = sourceAction(readAllCells(xml), readAllCells(session.lastXml), session.handledHistoryActions);
          if (next?.action !== 'paste') break;
          session.handledHistoryActions.add(next.key);
          const pending = sourceWithPatches(source.getText(), patches);
          const extra = pasteShapes(pending, planeScopedDiagram(pending, session), clipboard, ++pasteCount);
          patches[0].text += extra[0].text;
        }
        await applySourcePatches(session, source, patches);
        session.pasteClipboard = clipboard;
        session.pasteCount = pasteCount;
        await syncFromSource(session);
        const insertion = patches[0];
        const indices = session.editable.calls.flatMap((call, index) =>
          !call.group && call.start >= insertion.start && call.start < insertion.start + insertion.text.length
            ? [session.editable.cellIds?.[index] ?? index] : []);
        if (indices.length) {
          session.selectionSerial = (session.selectionSerial || 0) + 1;
          await updateDiagramDocument(session, withSelectionMarkers(session.lastXml, indices,
            `${Date.now()}-${session.selectionSerial}`), session.diagramFiles);
        }
        await refreshGuiView(session);
        return;
      }
      if (sourceCommand.action === 'select') {
        // A selection can arrive in the same save as a drag or style edit.
        const patches = patchesFromEditable(source.getText(), session.editable, xml, readAllCells);
        await applySourcePatches(session, source, patches);
        if (patches.length) {
          await syncFromSource(session);
          await refreshGuiView(session);
        } else await acceptDiagramSnapshot(session, xml);
        await selectSourceCalls(vscode, await documentForSession(session),
          session.editable.calls, sourceCommand.indices);
        return;
      }
      if (sourceCommand.action === 'focus') {
        const call = session.editable.calls[sourceCommand.indices[0]];
        if (!call) throw new Error('The selected CeTZ shape no longer exists.');
        await syncFromSource(session);
        const editor = await vscode.window.showTextDocument(source, { viewColumn: vscode.ViewColumn.One, preserveFocus: false });
        editor.selection = new vscode.Selection(source.positionAt(call.start), source.positionAt(call.end));
        editor.revealRange(new vscode.Range(editor.selection.start, editor.selection.end));
        return;
      }
      const pending = sourceCommand.action === 'properties' || PATH_ACTIONS.has(sourceCommand.action)
        ? patchesFromEditable(source.getText(), session.editable, xml, readAllCells) : [];
      let patches;
      try { patches = sourceActionPatches(source.getText(), session.editable, sourceCommand, pending); }
      catch (error) {
        if (sourceCommand.action !== 'properties') throw error;
        await syncFromSource(session); await refreshGuiView(session);
        return;
      }
      let historyGroup;
      if (session.editable.mode === '3d' && sourceCommand.action === 'properties') {
        const draft = JSON.parse(decodeURIComponent(sourceCommand.value));
        const call = session.editable.calls[sourceCommand.indices[0]];
        if (['ortho','perspective'].includes(call?.name) && /^[\w-]{1,80}$/.test(draft.historyGroup || '') &&
            Object.keys(draft.values).every(key => ['x','y','z'].includes(key))) historyGroup = draft.historyGroup;
      }
      await applySourcePatches(session, source, patches, sourceCommand.action === 'properties', historyGroup);
      await syncFromSource(session);
      if (patches.selectStart !== undefined) {
        const index = session.editable?.calls.findIndex(call => call.start === patches.selectStart);
        if (index >= 0) {
          session.selectionSerial = (session.selectionSerial || 0) + 1;
          await updateDiagramDocument(session, withSelectionMarker(session.lastXml, session.editable.cellIds?.[index] ?? index,
            `${Date.now()}-${session.selectionSerial}`), session.diagramFiles);
        }
      }
      await refreshGuiView(session);
    } catch (error) { await syncFromSource(session); await refreshGuiView(session); throw error; }
    return;
  }
  if (session.editable) {
    const source = await documentForSession(session);
    if (source.version !== session.sourceVersion) {
      await syncFromSource(session);
      throw new Error('Typst changed while the GUI was being edited. The GUI was refreshed from Typst.');
    }
    const patches = patchesFromEditable(source.getText(), session.editable, xml, readAllCells);
    if (!patches.length) { await acceptDiagramSnapshot(session, xml); return; }
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
async function openGui(sourceUri, canvasIndex, extensionPath, diagramFiles) {
  const editor = vscode.window.activeTextEditor;
  const doc = sourceUri ? await vscode.workspace.openTextDocument(sourceUri) : editor?.document;
  if (!doc || doc.languageId !== 'typst' && !doc.fileName.endsWith('.typ'))
    throw new Error('Open a .typ file and place the cursor in a CeTZ canvas first.');
  const index = Number.isInteger(canvasIndex) ? canvasIndex :
    pickCanvas(doc.getText(), doc.offsetAt(editor.selection.active));
  if (!locateCanvases(doc.getText())[index]) throw new Error('The selected CeTZ canvas no longer exists.');
  await ensureDrawioPlugin(vscode, extensionPath, doc.uri);
  const uri = diagramUri(doc.uri, index);
  const session = sessionFor(doc.uri, uri, index, diagramFiles);
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
  const selected = await vscode.window.showQuickPick(PLACEMENT_SHAPES.map(shape => shape.label), {
    title: 'CeTZ: Insert Shape', placeHolder: 'Choose a CeTZ draw function'
  });
  if (!selected) return;
  const shape = PLACEMENT_SHAPES.find(item => item.label === selected);
  let targetCanvas=canvas;
  if(session?.editable?.planeContext){
    const key=require('./plane-editor').rebasePlaneKey(session.activePlaneKey,session.sceneSource||source,source);
    const plane=require('./plane-editor').resolvePlane(source,canvas,key);
    if(!plane)throw new Error('The drawing plane changed. Choose it again in 3D.');
    targetCanvas={...canvas,bodyStart:plane.bodyStart,bodyEnd:plane.bodyEnd};
  }
  let insertion = insertionFor(source,targetCanvas,shape.call);
  if (!session?.editable?.planeContext && require('./three-dimensional').is3DCanvas(source, canvas)) {
    const rendered = session?.editable?.mode === '3d' && document.version===session.sourceVersion ? session.editable : await renderEditable(source, canvas, document.uri.fsPath);
    const view = rendered.workspace?.views.find(view => view.matrix);
    if (!view) throw new Error('Enable a 3D view in Draw.io before adding shapes.');
    const patch = require('./three-workspace').insertion3D(source, rendered, {view:view.index,plane:'xy',offset:0}, shape.call);
    insertion = {offset:patch.start,text:patch.text};
  }
  const edit = new vscode.WorkspaceEdit();
  edit.insert(document.uri, document.positionAt(insertion.offset), insertion.text);
  if (!await vscode.workspace.applyEdit(edit)) throw new Error('Could not insert the CeTZ call.');
}
function report(error) { vscode.window.showErrorMessage('CeTZ: ' + (error instanceof Error ? error.message : String(error))); }
async function showSyncError(session, error) {
  if (!session.lastXml) return report(error);
  const message = error instanceof Error ? error.message : String(error);
  await updateDiagramDocument(session, withDiagramStatus(session.lastXml, message), session.diagramFiles);
  await refreshGuiView(session, true);
}
function activate(context) {
  const diagramFiles = new DiagramFiles(vscode, async uri => {
    const source = sourceForDiagramUri(vscode, uri);
    if (!source) throw vscode.FileSystemError.FileNotFound(uri);
    await ensureDrawioPlugin(vscode, context.extensionPath, source.sourceUri);
    for (let attempt = 0; attempt < 3; attempt++) {
      const doc = await vscode.workspace.openTextDocument(source.sourceUri);
      const version = doc.version, text = doc.getText();
      const diagram = usableDiagram(text, source.index);
      const { xml, editable } = await renderDiagram(text, diagram.canvas, doc.uri.fsPath);
      if ((await vscode.workspace.openTextDocument(source.sourceUri)).version !== version) continue;
      const session = sessionFor(doc.uri, uri, source.index, diagramFiles);
      session.lastXml = bindScene(session, text, xml, editable);
      session.sourceVersion = version;
      session.diagram = diagram;
      session.editable = editable;
      return Buffer.from(session.lastXml, 'utf8');
    }
    throw new Error('Typst changed while the GUI was opening. Open the GUI again after editing.');
  });
  context.subscriptions.push(vscode.workspace.registerFileSystemProvider(SCHEME, diagramFiles), diagramFiles);
  context.subscriptions.push(vscode.commands.registerCommand('cetzEditor.open', (uri, index) =>
    openGui(uri, index, context.extensionPath, diagramFiles).catch(report)));
  context.subscriptions.push(vscode.languages.registerCodeLensProvider(
    [{ pattern: '**/*.typ' }, { language: 'typst' }],
    { provideCodeLenses: document => launchCodeLenses(vscode, document) }
  ));
  context.subscriptions.push(vscode.commands.registerCommand('cetzEditor.insertShape', () => insertShape().catch(report)));
  context.subscriptions.push(vscode.commands.registerCommand('cetzEditor.export', () =>
    exportTypst(vscode, vscode.window.activeTextEditor?.document).catch(report)));
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
        session.timer = setTimeout(() => {
          // Draw.io may save again while Typst is rendering. Process each
          // snapshot in order so a later edit never races an earlier reset.
          session.guiQueue = (session.guiQueue || Promise.resolve()).catch(() => {})
            .then(() => syncToSource(session))
            .catch(async error => {
              await syncFromSource(session).catch(() => {});
              await showSyncError(session, error).catch(report);
            });
        }, 180);
      }
    }
  }));
  context.subscriptions.push(vscode.commands.registerCommand('cetzEditor.selectInGui', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) throw new Error('Open a .typ file first.');
    const offset = editor.document.offsetAt(editor.selection.active);
    let session, index = -1;
    for (const item of sessions.values()) {
      if (key(item.sourceUri) !== key(editor.document.uri)) continue;
      if (item.sourceVersion !== editor.document.version) await syncFromSource(item);
      index = item.editable?.calls.findIndex(call => offset >= call.start && offset <= call.end) ?? -1;
      if (index >= 0) { session = item; break; }
    }
    if (!session) throw new Error('Place the cursor inside a CeTZ shape open in the GUI.');
    session.selectionSerial = (session.selectionSerial || 0) + 1;
    await updateDiagramDocument(session,
      withSelectionMarker(session.lastXml, session.editable.cellIds?.[index] ?? index, `${Date.now()}-${session.selectionSerial}`),
      session.diagramFiles);
  }));
  context.subscriptions.push({ dispose: () => { for (const s of sessions.values()) {
    if (s.timer) clearTimeout(s.timer);
  } sessions.clear(); } });
}
module.exports = { activate, deactivate() {}, pickCanvas, diagramUri };
