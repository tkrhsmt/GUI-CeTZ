'use strict';

// Optional integration tests run the installed mxGraph event and SVG renderer
// in a DOM implementation. They open no browser and capture no screen images.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { renderEditable, patchesFromEditable } = require('../src/advanced');
const { parseCanvas } = require('../src/diagram');
const { readAllCells } = require('../src/drawio');
let JSDOM;
try { ({ JSDOM } = require(process.env.GUI_CETZ_DOM_MODULE || 'jsdom')); } catch {}
const mxClient = process.env.GUI_CETZ_MXCLIENT;
const skip = !JSDOM || !mxClient ? 'Set GUI_CETZ_DOM_MODULE and GUI_CETZ_MXCLIENT for native DOM tests' : false;
const editorUi = process.env.GUI_CETZ_EDITOR_UI || path.resolve(path.dirname(mxClient || ''), '../js/diagramly/EditorUi.js');

async function fixture(t, sourceOverride, options = {}) {
  const dom = new JSDOM('<html><body><div id="graph"></div></body></html>',
    { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
  t.after(() => dom.window.close());
  const w = dom.window;
  if (options.loadedLayers) w.Image = class {
    set src(value) { this.onload(); }
  };
  w.HTMLCanvasElement.prototype.getContext = () => ({ measureText: text => ({ width: text.length * 6 }) });
  // These fixtures dispatch MouseEvents, including document-level drag events.
  // Keep the mouse path consistent across jsdom versions that add PointerEvent.
  w.PointerEvent = options.pointerEvents ? class extends w.MouseEvent {
    constructor(type,init={}) { super(type,init); this.pointerId=init.pointerId??1; this.pointerType=init.pointerType||'mouse'; }
  } : undefined;
  w.mxLoadResources = false; w.mxLoadStylesheets = false;
  w.eval(fs.readFileSync(mxClient, 'utf8'));
  const graph = new w.mxGraph(w.document.getElementById('graph'));
  graph.getStylesheet().putCellStyle('ellipse', { shape: w.mxConstants.SHAPE_ELLIPSE });
  if (options.modelCoordinates) graph.view.modelCoordinates = true;
  graph.getCompositeParent = cell => cell;
  const element = () => w.document.createElement('div');
  const palettes = {}, paletteEntries = {};
  let nativePaletteClicks = 0;
  function nativePaletteEntry() {
    const entry = element();
    entry.addEventListener('mousedown', () => { nativePaletteClicks++; });
    return entry;
  }
  const sidebar = { wrapper: element(), container: element(), palettes, sidebarTitles: true,
    addPaletteFunctions(id, title, expanded, factories) {
      palettes[id] = [element(), element()];
      paletteEntries[id] = factories.map(factory => factory());
      paletteEntries[id].forEach(entry => palettes[id][1].appendChild(entry));
    },
    createVertexTemplateEntry() { return nativePaletteEntry; }, createEdgeTemplateEntry() { return nativePaletteEntry; } };
  sidebar.container.appendChild(sidebar.wrapper);
  const actions = { undo: { funct() {}, isEnabled() { return true; } },
    redo: { funct() {}, isEnabled() { return true; } },
    copy: { funct() {}, isEnabled() { return false; } },
    paste: { funct() {}, isEnabled() { return false; } } };
  let currentFileReady = !options.nativeFitWindow;
  const ui = { sidebar, editor: { graph, addListener(name, callback) { ui[name] = callback; } },
    actions: { get(name) { return actions[name]; } }, container: element(), formatContainer: element(),
    sidebarContainer: element(), menubarContainer: element(), toolbarContainer: element(),
    hsplitPosition: 0, formatWidth: 240, refresh() {},
    getCurrentFile() { return currentFileReady ? { getTitle() { return 'test.cetz-1.drawio'; }, getData() { return ''; } } : null; } };
  if(options.nativeCanvas){
    // Install the actual editor hooks: unlike bare mxGraph, the infinite
    // canvas owns translate and reconciles it again after every validation.
    const code=fs.readFileSync(path.resolve(path.dirname(editorUi),'../grapheditor/EditorUi.js'),'utf8');
    const start=code.indexOf('var graphViewValidate = graph.view.validate;');
    const sizeStart=code.indexOf('graph.sizeDidChange = function()',start),end=code.indexOf('\n\t\t\t};',sizeStart)+'\n\t\t\t};'.length;
    assert.ok(start>=0&&sizeStart>start&&end>sizeStart);
    const graphCode=fs.readFileSync(path.resolve(path.dirname(editorUi),'../grapheditor/Graph.js'),'utf8');
    w.Graph=function(){};
    for(const name of ['getPageSize','getPageLayout','getDefaultTranslate','updateMinimumSize']){
      const at=graphCode.indexOf('Graph.prototype.'+name+' = function'),to=graphCode.indexOf('\n};',at)+4;
      assert.ok(at>=0&&to>at);w.eval(graphCode.slice(at,to));graph[name]=w.Graph.prototype[name];
    }
    w.mxUtils.unscale=w.mxUtils.unscale||((value,scale,translate=0)=>value/scale-translate);
    graph.scrollTileSize=new w.mxRectangle(0,0,1000,1000);graph.pageVisible=false;
    graph.getContainerMetrics=()=>({scrollbars:true,offsetWidth:800,offsetHeight:600});graph.isViewer=()=>false;
    const paddingAt=code.indexOf('graph.getPagePadding = function()'),paddingEnd=code.indexOf('\n\t};',paddingAt)+5;
    assert.ok(paddingAt>=0&&paddingEnd>paddingAt);w.__cetzCanvasGraph=graph;
    w.eval('(function(){var graph=window.__cetzCanvasGraph;'+code.slice(paddingAt,paddingEnd)+'})();');
    graph.container.style.overflow='auto';
    Object.defineProperties(graph.container,{clientWidth:{value:800},clientHeight:{value:600}});
    if(options.clampedScroll)Object.defineProperties(graph.container,{
      scrollWidth:{get:()=>Math.max(800,parseFloat(graph.view.getDrawPane().ownerSVGElement.style.minWidth)||0)},
      scrollHeight:{get:()=>Math.max(600,parseFloat(graph.view.getDrawPane().ownerSVGElement.style.minHeight)||0)}
    });
    for(const name of ['scrollLeft','scrollTop']){
      const limit=()=>!options.clampedScroll?Infinity:name==='scrollLeft'?graph.container.scrollWidth-800:graph.container.scrollHeight-600;
      let value=0;Object.defineProperty(graph.container,name,{get:()=>Math.min(value,limit()),set:next=>{value=Math.min(limit(),Math.max(0,Number(next)));},configurable:true});
    }
    w.__cetzCanvasUI=ui;
    w.eval('(function(){var ui=window.__cetzCanvasUI,graph=ui.editor.graph;'+code.slice(start,end)+'\n}})();');
  }
  if (options.nativeSelection) {
    const code = fs.readFileSync(path.resolve(path.dirname(editorUi), '../grapheditor/EditorUi.js'), 'utf8');
    const start = code.indexOf('EditorUi.prototype.isSelectionAllowed = function(evt)');
    const end = code.indexOf('\n};', start) + '\n};'.length;
    assert.ok(start >= 0 && end > start);
    w.EditorUi = function () {};
    w.eval(code.slice(start, end));
    ui.isSelectionAllowed = w.EditorUi.prototype.isSelectionAllowed;
    // The installed editor cancels sidebar mousedown/selectstart unless this
    // hook permits the event. Programmatic focus alone bypasses that behavior.
    ui.sidebarContainer.onmousedown = ui.sidebarContainer.onselectstart = event =>
      graph.isEditing() || ui.isSelectionAllowed(event);
    ui.sidebarContainer.appendChild(sidebar.container);
    w.document.body.appendChild(ui.sidebarContainer);
  }
  if (options.nativeClipboard) {
    const code = fs.readFileSync(editorUi, 'utf8');
    const start = code.indexOf('EditorUi.prototype.installNativeClipboardHandler = function()');
    const end = code.indexOf('\n\t};', start) + '\n\t};'.length;
    assert.ok(start >= 0 && end > start, 'load the installed Draw.io clipboard handler');
    w.EditorUi = function () {};
    w.eval(code.slice(start, end));
    w.mxClient.IS_MAC = true;
    w.document.execCommand = () => true;
    graph.container.tabIndex = 0;
    ui.isVirtualKeyboardDevice = () => false;
    ui.keyHandler = { bindControlKey() {} };
    ui.isSelectionAllowed = () => true;
    ui.copyCells = ui.pasteCells = () => assert.fail('CeTZ must intercept native cell cloning');
    ui.handleError = error => { throw error; };
    w.EditorUi.prototype.installNativeClipboardHandler.call(ui);
    // jsdom does not implement contentEditable focusability.
    ui.clipboardElt.tabIndex = -1;
  }
  let nativeFits = 0;
  if (options.nativeFitWindow) {
    const code = fs.readFileSync(path.resolve(path.dirname(editorUi), '../grapheditor/EditorUi.js'), 'utf8');
    w.EditorUi = function () {};
    for (const name of ['setFitWindowEnabled', 'isFitWindowSupported', 'updateFitWindow', 'installFitWindowHandler']) {
      const start = code.indexOf('EditorUi.prototype.' + name + ' = function('), end = code.indexOf('\n};', start) + 4;
      assert.ok(start >= 0 && end > start); w.eval(code.slice(start, end));
      ui[name] = w.EditorUi.prototype[name];
    }
    const events = new w.mxEventSource();
    ui.addListener = events.addListener.bind(events); ui.fireEvent = events.fireEvent.bind(events);
    ui.editor.isChromelessView = () => false;
    ui.fitDiagramOrPages = () => { nativeFits++; graph.fit(20); };
    ui.installFitWindowHandler();
    const actionCode = fs.readFileSync(path.resolve(path.dirname(editorUi), '../grapheditor/Actions.js'), 'utf8');
    const start = actionCode.indexOf("var fitWindowAction = this.addAction('fitWindow'"), end = actionCode.indexOf("this.addAction('fitPage'", start);
    assert.ok(start >= 0 && end > start);
    w.Editor = { ctrlKey: 'Ctrl', shiftKey: 'Shift' }; w.__cetzFitUI = ui;
    w.__cetzFitActions = { addAction(name, funct) { return actions[name] = { funct, setToggleAction() {}, setSelectedCallback() {} }; } };
    w.eval('(function(){var ui=window.__cetzFitUI,graph=ui.editor.graph;' + actionCode.slice(start, end) + '}).call(window.__cetzFitActions);');
  }
  if (options.nativeRefresh) {
    const code=fs.readFileSync(path.resolve(path.dirname(editorUi),'../grapheditor/EditorUi.js'),'utf8');
    w.EditorUi=w.EditorUi||function(){};
    const start=code.indexOf('EditorUi.prototype.refresh = function('),end=code.indexOf('\n};',start)+4;
    assert.ok(start>=0&&end>start);w.eval(code.slice(start,end));ui.refresh=w.EditorUi.prototype.refresh;ui.format={};
    ui.boundNativeRefresh=ui.refresh.bind(ui);
    // Native refresh clears the rail width while laying out the standard
    // format panel. Its scrollbar metrics can differ until CeTZ restores it.
    graph.getContainerMetrics=()=>({scrollbars:true,offsetWidth:800,offsetHeight:ui.formatContainer.style.width==='48px'?600:587});
  }
  w.Draw = { loadPlugin(callback) { callback(ui); } };
  const plugin = fs.readFileSync(path.resolve(__dirname, '../src/cetz-drawio-plugin.js'), 'utf8');
  if (!options.initialSelection) w.eval(plugin);
  const source = sourceOverride || '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *;\n' +
    'rect((0, 0), (2, 1), fill: red)\n' +
    'bezier((0, 3), (3, 3), (1, 4), (2, 2))\n' +
    'line((0, 5), (3, 6))\n' +
    'arc((5, 3), start: 0deg, stop: 90deg, radius: 1)\n})';
  const rendered = await renderEditable(source, parseCanvas(source).canvas, path.resolve('examples/basic.typ'));
  const document = w.mxUtils.parseXml(rendered.xml);
  new w.mxCodec(document).decode(document.getElementsByTagName('mxGraphModel')[0], graph.model);
  let initialHandler;
  if (options.initialSelection) {
    graph.setSelectionCell(graph.model.getCell(options.initialSelection));
    graph.view.validate();
    initialHandler = graph.selectionCellsHandler.getHandler(graph.getSelectionCell());
    assert.equal(initialHandler.selectionBorder.opacity, 100, 'reproduce a handler created before plugin loading');
    w.eval(plugin);
  }
  currentFileReady = true;
  ui.fileLoaded();
  function send(target, kind, x, y) {
    // Live preview can replace the original SVG node. Subsequent pointer
    // events still reach the graph in a browser through its document listeners.
    if (!target.isConnected) target = graph.container;
    const event = w.mxClient.IS_POINTER ? { down: 'pointerdown', move: 'pointermove', up: 'pointerup' } :
      { down: 'mousedown', move: 'mousemove', up: 'mouseup' };
    target.dispatchEvent(new w.MouseEvent(event[kind], { bubbles: true, clientX: x, clientY: y,
      button: 0, buttons: kind === 'up' ? 0 : 1 }));
  }
  function select(id) {
    const cell = graph.model.getCell(id); graph.setSelectionCell(cell); graph.view.validate();
    return { cell, state: graph.view.getState(cell) };
  }
  function drag(id, dx, dy) {
    const selected = select(id), state = selected.state;
    const x = state.x + state.width / 2, y = state.y + state.height / 2;
    const target = state.shape.node.firstChild;
    send(target, 'down', x, y); send(target, 'move', x + dx, y + dy);
    return { ...selected, target, x, y, handler: graph.graphHandler };
  }
  function imageDocument(shape) {
    assert.equal(shape.node.localName, 'svg');
    assert.equal(shape.node.getAttribute('data-cetz-live-preview'), 'true');
    return shape.node;
  }
  return { w, graph, ui, source, rendered, send, select, drag, imageDocument, initialHandler,
    paletteEntries, nativePaletteClicks: () => nativePaletteClicks, nativeFits: () => nativeFits };
}

function cubicVertices(data) {
  const tokens = data.match(/[a-z]|[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/ig);
  let i = 0, command, x = 0, y = 0;
  const points = [];
  while (i < tokens.length) {
    if (/^[a-z]$/i.test(tokens[i])) command = tokens[i++];
    if (command.toUpperCase() === 'Z') { command = null; continue; }
    const relative = command === command.toLowerCase();
    if (command.toUpperCase() === 'M') {
      x = Number(tokens[i++]) + (relative ? x : 0); y = Number(tokens[i++]) + (relative ? y : 0);
    } else if (command.toUpperCase() === 'C') {
      if (!points.length) points.push({ x, y });
      const baseX = x, baseY = y;
      for (let j = 0; j < 3; j++) {
        x = Number(tokens[i++]) + (relative ? baseX : 0); y = Number(tokens[i++]) + (relative ? baseY : 0);
        points.push({ x, y });
      }
    } else assert.fail('Expected a cubic curve, got ' + command);
  }
  return points;
}

function worldVertices(svg, box, calibration, screenView) {
  const path = svg.querySelector('path');
  const viewBox = svg.getAttribute('viewBox').split(/\s+/).map(Number);
  const transform = /translate\(([^)]+)\)/.exec(path.getAttribute('transform') || '');
  const [tx, ty = 0] = transform ? transform[1].trim().split(/[\s,]+/).map(Number) : [0, 0];
  const scale = screenView ? screenView.scale : 1;
  const translate = screenView ? screenView.translate : { x: 0, y: 0 };
  return cubicVertices(path.getAttribute('d')).map(point => {
    const x = (box.x + (point.x + tx - viewBox[0]) * box.width / viewBox[2]) / scale - translate.x;
    const y = (box.y + (point.y + ty - viewBox[1]) * box.height / viewBox[3]) / scale - translate.y;
    return { x: (x - calibration.originX) / (calibration.unitX * 2.5),
      y: (calibration.originY - y) / (calibration.unitY * 2.5) };
  });
}

async function compareWithTypst(f, drag, pointId) {
  const before = readAllCells(f.rendered.xml).get(pointId).geometry;
  const dx = drag.handler.currentDx / f.graph.view.scale, dy = drag.handler.currentDy / f.graph.view.scale;
  const changed = f.rendered.xml.replace(new RegExp('(<mxCell id="' + pointId + '"[\\s\\S]*?<mxGeometry)([^>]+)'),
    (_, prefix, attributes) => prefix + attributes.replace(/\bx="[^"]*"/, `x="${+before.x + dx}"`)
      .replace(/\by="[^"]*"/, `y="${+before.y + dy}"`));
  const patches = patchesFromEditable(f.source, f.rendered, changed, readAllCells);
  const source = patches.sort((a, b) => b.start - a.start).reduce((text, patch) =>
    text.slice(0, patch.start) + patch.text + text.slice(patch.end), f.source);
  const expected = await renderEditable(source, parseCanvas(source).canvas, path.resolve('examples/basic.typ'));
  const cells = readAllCells(expected.xml), owner = cells.get('cetz-edit-0').geometry;
  const layer = [...cells.values()].find(cell => cell.cell.parent === 'cetz-edit-0');
  const svg = f.w.mxUtils.parseXml(decodeURIComponent(/image=data:image\/svg\+xml,([^;]+)/.exec(layer.cell.style)[1])).documentElement;
  const expectedPoints = worldVertices(svg, { x: +owner.x + +layer.geometry.x, y: +owner.y + +layer.geometry.y,
    width: +layer.geometry.width, height: +layer.geometry.height }, expected.calibration);
  const shape = drag.handler.cetzDragImages.find(entry => entry.moving).shape;
  const actualPoints = worldVertices(shape.node, shape.bounds, f.rendered.calibration, f.graph.view);
  assert.equal(actualPoints.length, expectedPoints.length);
  actualPoints.forEach((point, i) => assert.ok(Math.hypot(point.x - expectedPoints[i].x, point.y - expectedPoints[i].y) < 0.003,
    `control vertex ${i}: live ${JSON.stringify(point)} vs Typst ${JSON.stringify(expectedPoints[i])}`));
  assert.doesNotMatch(shape.node.outerHTML, /NaN|Infinity/);
}

test('shape bodies can translate repeatedly after selection and control point editing', { skip }, async t => {
  const f = await fixture(t, undefined, { loadedLayers: true });
  for (const index of [0, 1, 2, 3]) {
    const cell = f.graph.model.getCell('cetz-edit-' + index);
    function bodyGesture(dx, dy) {
      const state = f.graph.view.getState(cell);
      const layer = cell.children.find(child => /^cetz-render-/.test(child.id));
      const target = f.graph.view.getState(layer).shape.node.firstChild;
      const x = state.getCenterX(), y = state.getCenterY();
      f.send(target, 'down', x, y);
      if (dx || dy) {
        f.send(target, 'move', x + dx, y + dy);
        assert.ok(f.graph.graphHandler.cetzDragImages?.some(entry => entry.moving),
          'body drag previews the selected shape ' + index);
        assert.ok(f.graph.graphHandler.cells.includes(cell), 'the owner is translated');
      }
      f.send(target, 'up', x + dx, y + dy);
      assert.equal(f.graph.getSelectionCell(), cell, 'artwork clicks always select the owner');
    }
    bodyGesture(40, 30);
    bodyGesture(0, 0);
    for (let n = 0; n < 2; n++) {
      const before = cell.geometry.clone();
      bodyGesture(40, 30);
      assert.notEqual(cell.geometry.x, before.x, 'the selected shape moves on every gesture');
      assert.equal(cell.geometry.width, before.width);
      assert.equal(cell.geometry.height, before.height);
    }
    if (f.graph.model.getCell('cetz-point-' + index + '-0')) {
      const pointDrag = f.drag('cetz-point-' + index + '-0', 20, 20);
      assert.ok(pointDrag.handler.cells.every(cell => /^cetz-point-/.test(cell.id)),
        'control points still edit independently');
      f.send(pointDrag.target, 'up', pointDrag.x + 20, pointDrag.y + 20);
    }
    bodyGesture(40, 30);
  }
});

test('Delete followed by a source merge preserves survivors and their control point ownership', { skip }, async t => {
  const { bindScene } = require('../src/scene');
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *;\n' +
    'line((0, 0), (2, 0))\ncircle((4, 0), radius: 1)\nbezier((6, 0), (9, 0), (7, 2), (8, 2))\n})';
  const f = await fixture(t, source, { loadedLayers: true });
  const session = {}, tick = () => new Promise(resolve => setTimeout(resolve, 0));
  function merge(xml) {
    const document = f.w.mxUtils.parseXml(xml), incoming = new f.w.mxGraphModel();
    new f.w.mxCodec(document).decode(document.getElementsByTagName('mxGraphModel')[0], incoming);
    f.graph.model.beginUpdate();
    try {
      for (const cell of Object.values(f.graph.model.cells)) {
        if (cell.id !== '0' && cell.id !== '1' && !incoming.getCell(cell.id) && f.graph.model.getCell(cell.id))
          f.graph.model.remove(cell);
      }
      for (const wanted of Object.values(incoming.cells)) {
        if (wanted.id === '0' || wanted.id === '1') continue;
        let cell = f.graph.model.getCell(wanted.id);
        const parent = f.graph.model.getCell(wanted.parent.id);
        if (!cell) f.graph.model.add(parent, wanted);
        else {
          f.graph.model.setGeometry(cell, wanted.geometry && wanted.geometry.clone());
          f.graph.model.setStyle(cell, wanted.style);
          f.graph.model.setValue(cell, wanted.value);
          f.graph.model.setVisible(cell, wanted.visible);
          if (cell.parent !== parent) f.graph.model.add(parent, cell);
        }
      }
    } finally { f.graph.model.endUpdate(); }
  }
  merge(bindScene(session, source, f.rendered.xml, f.rendered)); await tick();
  const oldIds = f.rendered.cellIds.slice();
  f.select('cetz-edit-' + oldIds[1]);
  f.graph.removeCells(f.graph.getSelectionCells());
  const deletedXml = f.w.mxUtils.getXml(new f.w.mxCodec().encode(f.graph.model));
  const patches = patchesFromEditable(source, f.rendered, deletedXml, readAllCells);
  const remaining = patches.reduceRight((text, patch) => text.slice(0, patch.start) + patch.text + text.slice(patch.end), source);
  assert.match(remaining, /line\(\(0, 0\), \(2, 0\)\)/);
  assert.doesNotMatch(remaining, /circle\(/);
  const next = await renderEditable(remaining, parseCanvas(remaining).canvas, path.resolve('examples/basic.typ'));
  merge(bindScene(session, remaining, next.xml, next)); await tick();
  oldIds.forEach(id => assert.equal(f.graph.model.getCell('cetz-edit-' + id), undefined));
  for (const [index, id] of next.cellIds.entries()) {
    const cell = f.graph.model.getCell('cetz-edit-' + id);
    assert.ok(Math.abs(cell.geometry.x - next.calls[index].geometry.x) < 0.00001);
    assert.ok(Math.abs(cell.geometry.y - next.calls[index].geometry.y) < 0.00001);
    assert.ok(cell.children.every(child => child.parent === cell));
  }
  const id = next.cellIds[1], unit = next.calibration.unitX * 2.5;
  const drag = f.drag(`cetz-point-${id}-2`, unit * 0.25, 0);
  f.send(f.graph.container, 'up', drag.x + unit * 0.25, drag.y);
  const edited = f.w.mxUtils.getXml(new f.w.mxCodec().encode(f.graph.model));
  const [patch] = patchesFromEditable(remaining, next, edited, readAllCells);
  assert.match(patch.text, /bezier\(\(6, 0\), \(9, 0\), \(7\.25, 2\), \(8, 2\)\)/);
});

test('moved artwork is visible after deletion and restoration with the same SVG and cell IDs', { skip }, async t => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *;\n' +
    'circle((0, 0), radius: 1, fill: red)\ncircle((3, 0), radius: 1, fill: blue)\n})';
  const f = await fixture(t, source, { loadedLayers: true });
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  await tick();
  f.graph.view.scaleAndTranslate(4, 3, -2);
  const delta = f.rendered.calibration.unitX * 2.5 * 4 * 0.5;
  const drag = f.drag('cetz-edit-0', delta, 0);
  f.send(f.graph.container, 'up', drag.x + delta, drag.y);
  const changed = f.w.mxUtils.getXml(new f.w.mxCodec().encode(f.graph.model));
  const patches = patchesFromEditable(source, f.rendered, changed, readAllCells);
  const moved = patches.reduceRight((text, patch) => text.slice(0, patch.start) + patch.text + text.slice(patch.end), source);
  const rendered = await renderEditable(moved, parseCanvas(moved).canvas, path.resolve('examples/basic.typ'));
  function restoreOwner() {
    const xml = f.w.mxUtils.parseXml(rendered.xml);
    const incoming = new f.w.mxGraphModel();
    new f.w.mxCodec(xml).decode(xml.getElementsByTagName('mxGraphModel')[0], incoming);
    f.graph.model.beginUpdate();
    try {
      const old = f.graph.model.getCell('cetz-edit-0');
      if (old) f.graph.model.remove(old);
      f.graph.model.add(f.graph.model.getCell('1'), incoming.getCell('cetz-edit-0'));
    } finally { f.graph.model.endUpdate(); }
  }
  restoreOwner(); await tick();
  const camera = [f.graph.view.scale, f.graph.view.translate.x, f.graph.view.translate.y];
  for (let repeat = 0; repeat < 3; repeat++) {
    const oldLayer = f.graph.model.getCell('cetz-render-0');
    f.graph.removeCells([f.graph.model.getCell('cetz-edit-0')]);
    if (repeat === 0) await tick();
    assert.equal(f.graph.model.getCell('cetz-render-0'), undefined);
    restoreOwner(); await tick();
    const layer = f.graph.model.getCell('cetz-render-0'), state = f.graph.view.getState(layer);
    assert.notEqual(layer, oldLayer, 'the restored fragment is a new cell with the same ID');
    assert.equal(layer.style, oldLayer.style, 'the restored SVG content is identical');
    assert.ok(state && state.shape && state.shape.node.isConnected, 'restored artwork has a live SVG node');
    assert.notEqual(state.shape.node.style.visibility, 'hidden');
    assert.equal(f.graph.isCellVisible(layer), true);
    assert.deepEqual([f.graph.view.scale, f.graph.view.translate.x, f.graph.view.translate.y], camera);
    assert.equal(f.w.document.querySelector('[data-cetz-live-preview]'), null, 'no stale drag overlay hides the restoration');
  }
});

test('control points keep a constant screen size, stroke and hit area through both zoom rendering paths', { skip }, async t => {
  for (const modelCoordinates of [false, true]) {
    const f = await fixture(t, undefined, { modelCoordinates });
    f.select('cetz-edit-1');
    const cell = f.graph.model.getCell('cetz-point-1-2');
    const before = f.w.mxUtils.getXml(new f.w.mxCodec().encode(f.graph.model));
    for (const scale of [0.5, 1, 2, 4, 8, 16, 4, 1]) {
      f.graph.view.scaleAndTranslate(scale, 3, -2);
      const state = f.graph.view.getState(cell), shape = state.shape;
      assert.equal(shape.bounds.width, 14);
      assert.equal(shape.bounds.height, 14);
      assert.equal(shape.strokewidth * scale, 2);
      assert.equal(shape.bounds.getCenterX(), state.getCenterX());
      assert.equal(shape.bounds.getCenterY(), state.getCenterY());
      const ellipse = shape.node.querySelector('ellipse');
      assert.ok(ellipse, 'the point remains a native SVG circle');
      let svgScale = 1;
      for (let node = ellipse; node; node = node.parentNode) {
        if (!node.getAttribute) continue;
        for (const match of (node.getAttribute('transform') || '').matchAll(/scale\(([^)]+)\)/g))
          svgScale *= Number(match[1].split(/[ ,]+/)[0]);
      }
      assert.ok(Math.abs(Number(ellipse.getAttribute('rx')) * 2 * svgScale - 14) < 0.01,
        'the rendered diameter stays 14px even when the SVG pane is scaled');
      assert.ok(Math.abs(Number(ellipse.getAttribute('stroke-width') || 1) * svgScale - 2) < 0.01,
        JSON.stringify({ modelCoordinates, scale, svgScale, svg: ellipse.outerHTML }));
      const x = state.getCenterX(), y = state.getCenterY();
      assert.equal(f.graph.intersects(state, x + 8, y), true);
      assert.equal(f.graph.intersects(state, x + 10, y), false, 'the hit area does not grow with zoom');
      const ignoreOthers = candidate => candidate.cell !== cell;
      assert.equal(f.graph.getCellAt(x, y, null, true, false, ignoreOthers), cell);
      assert.equal(f.graph.getCellAt(x + 20, y, null, true, false, ignoreOthers), null);
      assert.equal(f.w.mxUtils.getXml(new f.w.mxCodec().encode(f.graph.model)), before,
        'zooming changes only rendering, leaving all source-mapped cells intact');
    }
    f.graph.view.setScale(8);
    const delta = f.rendered.calibration.unitX * 2.5 * 8 * 0.03125;
    const drag = f.drag(cell.id, delta, delta);
    assert.equal(drag.state.shape.bounds.width, 14, 'the moving point also stays screen-sized');
    f.send(f.graph.container, 'up', drag.x + delta, drag.y + delta);
    const changed = f.w.mxUtils.getXml(new f.w.mxCodec().encode(f.graph.model));
    const [patch] = patchesFromEditable(f.source, f.rendered, changed, readAllCells);
    assert.match(patch.text, /\(1\.03125, 3\.96875\)/, 'fixed-size markers preserve fine coordinate dragging');
  }
});

test('zoomed placement, point drags, body drags and resizing retain sub-quarter coordinates in Typst', { skip }, async t => {
  const { snapStep } = require('../src/snapping');
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *;\n' +
    'line((0, 0), (2, 0))\ncircle((4, 0), radius: 1)\nrect((6, 0), (8, 1))\n})';
  for (const scale of [2, 4, 8, 16]) {
    const f = await fixture(t, source), step = snapStep(scale);
    f.graph.view.scaleAndTranslate(scale, 3, -2);
    const unit = f.rendered.calibration.unitX * 2.5, delta = step * unit * scale;
    assert.ok(Math.abs(f.graph.gridSize - unit * step) < 0.00001, 'zoom updates the native resize/grid spacing');
    for (const id of ['cetz-point-0-0', 'cetz-edit-1']) {
      const drag = f.drag(id, delta, delta);
      f.send(f.graph.container, 'up', drag.x + delta, drag.y + delta);
      assert.equal(Number(f.graph.getCellStyle(drag.cell).cetzSnapStep), step);
    }
    const selected = f.select('cetz-edit-2');
    const handler = f.graph.selectionCellsHandler.getHandler(selected.cell), target = handler.sizers[7].node;
    const x = selected.state.x + selected.state.width, y = selected.state.y + selected.state.height;
    f.send(target, 'down', x, y); f.send(target, 'move', x + delta, y + delta);
    f.send(f.graph.container, 'up', x + delta, y + delta);
    assert.equal(Number(f.graph.getCellStyle(selected.cell).cetzSnapStep), step);
    const icon = f.paletteEntries['cetz-preview-primitives'].find(entry => entry.getAttribute('aria-label') === 'line');
    icon.dispatchEvent(new f.w.MouseEvent('click', { bubbles: true, cancelable: true }));
    for (const p of [[step, step], [1 + step, 2 + step]]) {
      f.graph.container.dispatchEvent(new f.w.MouseEvent('click', { bubbles: true, cancelable: true, detail: 1,
        clientX: (f.rendered.calibration.originX + p[0] * unit + f.graph.view.translate.x) * scale - f.graph.container.scrollLeft,
        clientY: (f.rendered.calibration.originY - p[1] * unit + f.graph.view.translate.y) * scale - f.graph.container.scrollTop }));
    }
    const xml = f.w.mxUtils.getXml(new f.w.mxCodec().encode(f.graph.model));
    const patches = patchesFromEditable(source, f.rendered, xml, readAllCells);
    const updated = [...patches].sort((a, b) => b.start - a.start).reduce((text, patch) =>
      text.slice(0, patch.start) + patch.text + text.slice(patch.end), source);
    assert.ok(updated.includes(`line((${step}, ${-step}), (2, 0))`), updated);
    assert.ok(updated.includes(`circle((${4 + step}, ${-step}), radius: 1)`), updated);
    assert.ok(updated.replace(/\),\s*\(/g, '),(').includes(`rect((6, ${-step}),(${8 + step}, 1))`), updated);
    assert.ok(updated.includes(`line((${step}, ${step}), (${1 + step}, ${2 + step}))`), updated);
    const next = await renderEditable(updated, parseCanvas(updated).canvas, path.resolve('examples/basic.typ'));
    assert.equal(next.calls.length, 4, 'fine edits survive recompilation');
    f.graph.view.setScale(1);
    assert.ok(Math.abs(f.graph.gridSize - unit * 0.25) < 0.00001, 'zooming out restores the regular grid');
  }
});

test('zoom refines arc endpoint angles and retains them after source synchronization', { skip }, async t => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *;\n' +
    'arc((0, 0), start: 0deg, stop: 90deg, radius: 2, anchor: "origin")\n})';
  const f = await fixture(t, source), scale = 4;
  f.graph.view.setScale(scale);
  const unit = f.rendered.calibration.unitX * 2.5 * scale, radians = 23.32 * Math.PI / 180;
  const dx = 2 * Math.cos(radians) * unit, dy = (2 - 2 * Math.sin(radians)) * unit;
  const drag = f.drag('cetz-point-0-2', dx, dy);
  f.send(f.graph.container, 'up', drag.x + dx, drag.y + dy);
  const xml = f.w.mxUtils.getXml(new f.w.mxCodec().encode(f.graph.model));
  const [patch] = patchesFromEditable(source, f.rendered, xml, readAllCells);
  assert.match(patch.text, /stop: 23\.25deg/);
});

test('fine dragging keeps named coordinate references and their rendered positions', { skip }, async t => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *;\n' +
    'anchor("a", (3, 0))\ncontent("a", [Text])\ncircle("a", radius: 0.5)\n})';
  const f = await fixture(t, source), scale = 4, step = 0.0625;
  f.graph.view.setScale(scale);
  const delta = f.rendered.calibration.unitX * 2.5 * scale * step;
  for (const id of ['cetz-point-1-0', 'cetz-edit-2']) {
    const drag = f.drag(id, delta, delta);
    f.send(f.graph.container, 'up', drag.x + delta, drag.y + delta);
  }
  const xml = f.w.mxUtils.getXml(new f.w.mxCodec().encode(f.graph.model));
  const patches = patchesFromEditable(source, f.rendered, xml, readAllCells);
  const updated = [...patches].sort((a, b) => b.start - a.start).reduce((text, patch) =>
    text.slice(0, patch.start) + patch.text + text.slice(patch.end), source);
  // The measured anchor starts at y=0.01, so reaching the fine grid at
  // y=-0.0625 requires a relative offset of -0.0725.
  assert.match(updated, /circle\(\(rel: \(0\.0625, -0\.0725\), to: "a"\), radius: 0\.5\)/);
  assert.match(updated, /content\(\(rel: \([^)]*\), to: "a"\), \[Text\]\)/);
  const next = await renderEditable(updated, parseCanvas(updated).canvas, path.resolve('examples/basic.typ'));
  const point = readAllCells(next.xml).get('cetz-point-1-0').geometry;
  assert.ok(Math.abs((+point.x + 7 - next.calibration.originX) / (next.calibration.unitX * 2.5) - 3 - step) < 0.00001);
  assert.ok(Math.abs((next.calibration.originY - +point.y - 7) / (next.calibration.unitY * 2.5) + step) < 0.00001);
  const circle = next.calls[2].geometry;
  assert.ok(Math.abs((circle.x + circle.width / 2 - next.calibration.originX) / (next.calibration.unitX * 2.5) - 3 - step) < 0.00001);
  assert.ok(Math.abs((next.calibration.originY - circle.y - circle.height / 2) / (next.calibration.unitY * 2.5) + step) < 0.00001);
});

test('every right palette icon places shapes at clicked points without native default insertion', { skip }, async t => {
  const cases = require('./placement-fixtures');
  const { SPECS } = require('../src/placement');
  const f = await fixture(t);
  const icons = f.paletteEntries['cetz-preview-primitives'].concat(f.paletteEntries['cetz-advanced']);
  assert.equal(icons.length, Object.keys(cases).length);
  const templates = () => Object.values(f.graph.model.cells).filter(cell => /cetzPoints=/.test(cell.style || ''));
  let expectedCount = 0;
  for (const [name, points] of Object.entries(cases)) {
    f.graph.view.scaleAndTranslate(expectedCount % 2 ? 2 : 1, 3, -2);
    f.graph.container.scrollLeft = 17; f.graph.container.scrollTop = 23;
    const icon = icons.find(entry => entry.getAttribute('aria-label') === name);
    icon.dispatchEvent(new f.w.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    icon.dispatchEvent(new f.w.MouseEvent('click', { bubbles: true, cancelable: true }));
    assert.equal(templates().length, expectedCount, 'arming ' + name + ' does not insert a default shape');
    assert.equal(icon.getAttribute('aria-pressed'), 'true');
    assert.match(f.graph.container.querySelector('.cetzPlacementHint').textContent, /Esc/);
    for (const [i, p] of points.entries()) {
      const view = f.graph.view, frame = f.rendered.calibration;
      const x = (frame.originX + p[0] * frame.unitX * 2.5 + view.translate.x) * view.scale - f.graph.container.scrollLeft;
      const y = (frame.originY - p[1] * frame.unitY * 2.5 + view.translate.y) * view.scale - f.graph.container.scrollTop;
      f.send(f.graph.container, 'move', x, y);
      assert.ok(f.graph.view.getOverlayPane().querySelector('[data-cetz-placement]'));
      f.send(f.graph.container, 'down', x, y); f.send(f.graph.container, 'up', x, y);
      f.graph.container.dispatchEvent(new f.w.MouseEvent('click', { clientX: x, clientY: y, button: 0,
        bubbles: true, cancelable: true, detail: 1 }));
      if (i < points.length - 1 || SPECS[name].min)
        assert.equal(templates().length, expectedCount, name + ' waits for complete placement');
    }
    if (SPECS[name].min) f.graph.container.dispatchEvent(new f.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert.equal(templates().length, ++expectedCount);
    const marker = templates().at(-1);
    const encoded = /cetzPoints=([^;]+)/.exec(marker.style)[1];
    assert.deepEqual(JSON.parse(decodeURIComponent(encoded)), points, name + ' keeps clicked world coordinates');
    assert.equal(icon.getAttribute('aria-pressed'), 'false');
    assert.equal(f.graph.container.querySelector('.cetzPlacementHint'), null);
    assert.equal(f.graph.view.getOverlayPane().querySelector('[data-cetz-placement]'), null);
  }
  assert.equal(f.nativePaletteClicks(), 0, 'palette mouse gestures do not invoke native insertion');
  const xml = f.w.mxUtils.getXml(new f.w.mxCodec().encode(f.graph.model));
  const patches = patchesFromEditable(f.source, f.rendered, xml, readAllCells);
  assert.equal(patches.length, 1, 'only the explicitly placed shapes produce source changes');
  assert.match(patches[0].text, /line\(\(2, -1\), \(-1, 3\)\)/);
  const updated = f.source.slice(0, patches[0].start) + patches[0].text + f.source.slice(patches[0].end);
  const next = await renderEditable(updated, parseCanvas(updated).canvas, path.resolve('examples/basic.typ'));
  assert.equal(next.calls.length, f.rendered.calls.length + expectedCount);
});

test('placement supports cancellation, retrying invalid points and finishing a variable path by double-click', { skip }, async t => {
  const f = await fixture(t);
  const icons = f.paletteEntries['cetz-preview-primitives'].concat(f.paletteEntries['cetz-advanced']);
  const arm = name => icons.find(entry => entry.getAttribute('aria-label') === name)
    .dispatchEvent(new f.w.MouseEvent('click', { bubbles: true, cancelable: true }));
  const click = (x, y, detail = 1) => f.graph.container.dispatchEvent(new f.w.MouseEvent('click', {
    clientX: f.rendered.calibration.originX + x * f.rendered.calibration.unitX * 2.5,
    clientY: f.rendered.calibration.originY - y * f.rendered.calibration.unitY * 2.5,
    bubbles: true, cancelable: true, detail
  }));
  const count = () => Object.values(f.graph.model.cells).filter(cell => /cetzPoints=/.test(cell.style || '')).length;
  arm('line'); click(1, 1);
  f.graph.container.dispatchEvent(new f.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(count(), 0);
  assert.equal(f.graph.container.querySelector('.cetzPlacementHint'), null);
  arm('rect'); click(1, 1); click(1, 3);
  assert.equal(count(), 0);
  assert.match(f.graph.container.querySelector('.cetzPlacementHint').textContent, /different point/);
  click(3, 3);
  assert.equal(count(), 1);
  arm('line'); click(1, 1); arm('hobby');
  click(2, 2); click(3, 3); click(4, 2); click(4, 2, 2);
  f.graph.container.dispatchEvent(new f.w.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
  assert.equal(count(), 2);
  arm('circle'); click(0, 0); f.ui.fileLoaded();
  assert.equal(count(), 2, 'reloading a file cancels unfinished placement');
  assert.equal(f.graph.view.getOverlayPane().querySelector('[data-cetz-placement]'), null);
});

test('native clipboard actions and shortcuts send CeTZ commands without cloning SVG cells', { skip }, async t => {
  const f = await fixture(t);
  const commands = () => Object.values(f.graph.model.cells).map(cell => cell.style || '')
    .filter(style => /cetzAction=(copy|paste);/.test(style));
  assert.equal(f.ui.actions.get('copy').isEnabled(), false);
  f.select('cetz-point-1-0');
  assert.equal(f.ui.actions.get('copy').isEnabled(), true);
  f.ui.actions.get('copy').funct();
  assert.match(commands().at(-1), /cetzAction=copy;cetzTargets=1;/);
  f.graph.clearSelection();
  assert.equal(f.ui.actions.get('paste').isEnabled(), true);
  f.ui.actions.get('paste').funct();
  assert.match(commands().at(-1), /cetzAction=paste;cetzActionToken=/);
  f.select('cetz-edit-0');
  f.graph.container.dispatchEvent(new f.w.KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }));
  assert.match(commands().at(-1), /cetzAction=copy;cetzTargets=0;/);
  f.graph.clearSelection();
  f.graph.container.dispatchEvent(new f.w.KeyboardEvent('keydown', { key: 'v', metaKey: true, bubbles: true }));
  assert.match(commands().at(-1), /cetzAction=paste;/);
  const count = commands().length;
  const input = f.w.document.createElement('input');
  f.graph.container.appendChild(input);
  input.dispatchEvent(new f.w.KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true }));
  assert.equal(commands().length, count, 'text fields keep native clipboard behaviour');
  assert.equal(Object.keys(f.graph.model.cells).filter(id => /^cetz-edit-/.test(id)).length, 4);
});

test('macOS clipboard shortcuts work through Draw.io native hidden input', {
  skip: skip || (!fs.existsSync(editorUi) ? 'Set GUI_CETZ_EDITOR_UI to EditorUi.js for native clipboard tests' : false)
}, async t => {
  const f = await fixture(t, undefined, { nativeClipboard: true });
  const commands = name => Object.values(f.graph.model.cells).filter(cell =>
    (cell.style || '').includes('cetzAction=' + name + ';')).length;
  f.select('cetz-edit-0');
  f.graph.container.focus();
  f.graph.container.dispatchEvent(new f.w.KeyboardEvent('keydown', {
    key: 'Meta', keyCode: 91, metaKey: true, bubbles: true
  }));
  assert.equal(f.w.document.activeElement, f.ui.clipboardElt, 'Meta focuses the native clipboard input');
  function shortcut(key, name) {
    const before = commands(name);
    f.ui.clipboardElt.dispatchEvent(new f.w.KeyboardEvent('keydown', {
      key, keyCode: key.toUpperCase().charCodeAt(0), metaKey: true, bubbles: true, cancelable: true
    }));
    assert.equal(commands(name), before, 'the hidden input waits for its native clipboard event');
    const event = new f.w.Event(name, { bubbles: true, cancelable: true });
    f.ui.clipboardElt.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(commands(name), before + 1, 'one command per native clipboard gesture');
  }
  shortcut('c', 'copy');
  shortcut('v', 'paste');
  shortcut('v', 'paste');
  const hostPaste = new f.w.Event('paste', { bubbles: true, cancelable: true });
  f.ui.clipboardElt.dispatchEvent(hostPaste);
  assert.equal(commands('paste'), 3, 'host menu paste works without a V keydown');
  const editor = f.w.document.createElement('div'), text = f.w.document.createElement('span');
  editor.setAttribute('contenteditable', 'true');
  editor.appendChild(text); f.graph.container.appendChild(editor);
  const textPaste = new f.w.Event('paste', { bubbles: true, cancelable: true });
  text.dispatchEvent(textPaste);
  assert.equal(textPaste.defaultPrevented, false, 'real text editors retain native paste');
  assert.equal(commands('paste'), 3);
  f.graph.clearSelection();
  for (const [shiftKey, name] of [[false, 'undo'], [true, 'redo']]) {
    const before = commands(name);
    const event = new f.w.KeyboardEvent('keydown', { key: 'z', keyCode: 90, metaKey: true,
      shiftKey, bubbles: true, cancelable: true });
    f.ui.clipboardElt.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(commands(name), before + 1, 'history shortcuts work with no selection and native clipboard focus');
  }
  const textUndo = new f.w.KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true });
  text.dispatchEvent(textUndo);
  assert.equal(textUndo.defaultPrevented, false, 'text editing retains its native undo');
  f.ui.clipboardElt.dispatchEvent(new f.w.KeyboardEvent('keyup', { key: 'Meta', keyCode: 91, bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(f.ui.clipboardElt.isConnected, false, 'releasing Meta restores graph focus');
});

test('point guides align the point center and preserve off-grid source coordinates', { skip }, async t => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *;\n' +
    'line((0, 0), (0, 2))\nrect((1.13, 4), (2.13, 5))\n})';
  for (const scale of [1, 2]) {
    const f = await fixture(t, source);
    f.graph.view.scaleAndTranslate(scale, 3, -2);
    f.graph.graphHandler.guidesEnabled = true;
    const unit = f.rendered.calibration.unitX * 2.5 * scale;
    const drag = f.drag('cetz-point-0-0', 1.14 * unit, -0.74 * unit);
    const guide = drag.handler.guide;
    assert.equal(guide.guideX.node.style.visibility, 'visible');
    assert.equal(guide.guideX.stroke, '#0088cf');
    const target = f.graph.view.getState(f.graph.model.getCell('cetz-edit-1'));
    assert.ok(Math.abs(drag.state.getCenterX() + drag.handler.currentDx - target.x) < 0.001);
    assert.equal(drag.handler.cetzGuideSnap.x, true);
    assert.equal(drag.handler.cetzGuideSnap.y, false);
    f.send(f.graph.container, 'move', drag.x + 3.2 * unit, drag.y - 0.74 * unit);
    assert.equal(guide.guideX.node.style.visibility, 'hidden');
    assert.equal(drag.handler.cetzGuideSnap.x, false, 'moving away restores grid snapping');
    f.send(f.graph.container, 'move', drag.x + 1.14 * unit, drag.y - 0.74 * unit);
    f.send(f.graph.container, 'up', drag.x + 1.14 * unit, drag.y - 0.74 * unit);
    assert.equal(Number(f.graph.getCellStyle(drag.cell).cetzGuideX), 1);
    const xml = f.w.mxUtils.getXml(new f.w.mxCodec().encode(f.graph.model));
    const patches = patchesFromEditable(source, f.rendered, xml, readAllCells);
    const updated = patches.reduceRight((text, patch) =>
      text.slice(0, patch.start) + patch.text + text.slice(patch.end), source);
    assert.match(updated, /line\(\(1\.13, 0\.75\), \(0, 2\)\)/);
    assert.equal(drag.handler.guide, null, 'drop removes guide overlays');
    assert.equal(drag.handler.cetzGuideSnap, null, 'drop clears snapping metadata');
  }
});

test('point guides preserve both aligned axes for a referenced text position', { skip }, async t => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *;\n' +
    'anchor("a", (0, 0))\ncontent("a", [Text])\nrect((1.13, 1.17), (2.13, 2.17))\n})';
  const f = await fixture(t, source);
  f.graph.graphHandler.guidesEnabled = true;
  const unit = f.rendered.calibration.unitX * 2.5;
  const drag = f.drag('cetz-point-1-0', 1.14 * unit, -1.18 * unit);
  assert.equal(drag.handler.guide.guideX.node.style.visibility, 'visible');
  assert.equal(drag.handler.guide.guideY.node.style.visibility, 'visible');
  f.send(f.graph.container, 'up', drag.x + 1.14 * unit, drag.y - 1.18 * unit);
  const xml = f.w.mxUtils.getXml(new f.w.mxCodec().encode(f.graph.model));
  const patches = patchesFromEditable(source, f.rendered, xml, readAllCells);
  const updated = source.slice(0, patches[0].start) + patches[0].text + source.slice(patches[0].end);
  // The reference position is resolved from Typst's measured anchor, which
  // includes the content anchor offset. Preserve that offset when moving it.
  assert.match(updated, /content\(\(rel: \(1\.13, 1\.16\), to: "a"\), \[Text\]\)/);
  const next = await renderEditable(updated, parseCanvas(updated).canvas, path.resolve('examples/basic.typ'));
  const cells = readAllCells(next.xml), point = cells.get('cetz-point-1-0').geometry;
  const target = cells.get('cetz-edit-2').geometry;
  assert.ok(Math.abs(+point.x + 7 - +target.x) < 0.01);
  assert.ok(Math.abs(+point.y + 7 - +target.y - +target.height) < 0.01);
});

test('arc endpoint guides keep the endpoint on its ellipse and retain a fractional angle', { skip }, async t => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *;\n' +
    'arc((0, 0), start: 0deg, stop: 90deg, radius: (2, 1), anchor: "origin")\n' +
    'rect((1.13, 4), (2.13, 5))\n})';
  const f = await fixture(t, source);
  f.graph.graphHandler.guidesEnabled = true;
  const unit = f.rendered.calibration.unitX * 2.5;
  const drag = f.drag('cetz-point-0-2', 1.14 * unit, (1 - Math.sqrt(1 - (1.13 / 2) ** 2)) * unit);
  assert.equal(drag.handler.guide.guideX.node.style.visibility, 'visible');
  assert.equal(drag.handler.cetzGuideSnap.x, true);
  f.send(f.graph.container, 'up', drag.x + 1.14 * unit,
    drag.y + (1 - Math.sqrt(1 - (1.13 / 2) ** 2)) * unit);
  const x = (drag.cell.geometry.x + 7 - f.rendered.calibration.originX) / unit;
  const y = (f.rendered.calibration.originY - drag.cell.geometry.y - 7) / unit;
  assert.ok(Math.abs(x - 1.13) < 0.001);
  assert.ok(Math.abs((x / 2) ** 2 + y ** 2 - 1) < 0.00001);
  const xml = f.w.mxUtils.getXml(new f.w.mxCodec().encode(f.graph.model));
  const patches = patchesFromEditable(source, f.rendered, xml, readAllCells);
  const updated = source.slice(0, patches[0].start) + patches[0].text + source.slice(patches[0].end);
  assert.match(updated, /stop: \d+\.\d+deg/);
  const next = await renderEditable(updated, parseCanvas(updated).canvas, path.resolve('examples/basic.typ'));
  const after = readAllCells(next.xml).get('cetz-point-0-2').geometry;
  const afterX = (+after.x + 7 - next.calibration.originX) / (next.calibration.unitX * 2.5);
  assert.ok(Math.abs(afterX - 1.13) < 0.0001, 'source refresh retains alignment');
});

test('selected curve guides forward body drags to their owner', { skip }, async t => {
  const f = await fixture(t, undefined, { loadedLayers: true });
  const { cell } = f.select('cetz-edit-1'), before = cell.geometry.clone();
  const guide = f.graph.view.getState(f.graph.model.getCell('cetz-guide-1-0'));
  const x = (guide.absolutePoints[0].x + guide.absolutePoints[1].x) / 2;
  const y = (guide.absolutePoints[0].y + guide.absolutePoints[1].y) / 2;
  const target = guide.shape.node.lastChild;
  f.send(target, 'down', x, y);
  f.send(target, 'move', x + 40, y + 30);
  assert.ok(f.graph.graphHandler.cells.includes(cell));
  assert.ok(f.graph.graphHandler.cetzDragImages.some(entry => entry.moving));
  f.send(target, 'up', x + 40, y + 30);
  assert.notEqual(cell.geometry.x, before.x);
  assert.equal(f.graph.getSelectionCell(), cell);
});

test('native pointer events repaint the moving SVG on every frame before mouseup', { skip }, async t => {
  const f = await fixture(t);
  const drag = f.drag('cetz-edit-0', 30, 20);
  const entry = drag.handler.cetzDragImages.find(entry => entry.moving);
  const node = entry.shape.node;
  const first = Number(node.getAttribute('x'));
  assert.ok(node.querySelector('path'), 'the moving shape contains actual vector geometry');
  assert.equal(node.querySelector('image'), null, 'no asynchronous bitmap decoding is needed');
  f.send(drag.target, 'move', drag.x + 70, drag.y + 50);
  assert.notEqual(Number(node.getAttribute('x')), first);
  assert.equal(drag.handler.cetzDragImages.find(entry => entry.moving).shape, entry.shape);
  const fallback = f.graph.view.getState(f.graph.model.getCell('cetz-preview-image')).shape.node;
  assert.equal(fallback.style.visibility, 'hidden', 'the static copy of the moving shape is hidden');
  assert.ok(drag.handler.cetzDragImages.some(entry => !entry.moving), 'neighbouring shapes remain drawn');
  assert.ok(entry.shape.bounds.width > 100);
  f.send(drag.target, 'up', drag.x + 70, drag.y + 50);
  assert.equal(entry.shape.node, null, 'releasing the mouse removes the transient drawing');
  assert.notEqual(fallback.style.visibility, 'hidden', 'releasing the mouse restores the source drawing');
});

test('native CeTZ 0.4.2 gestures paint both movement and line deformation', { skip }, async t => {
  const source = '#import "@preview/cetz:0.4.2"\n#cetz.canvas({ import cetz.draw: *; ' +
    'rect((0, 0), (2, 1), fill: red); line((0, 3), (3, 3)) })';
  const f = await fixture(t, source);
  const move = f.drag('cetz-edit-0', 30, 20);
  const rectangle = move.handler.cetzDragImages.find(entry => entry.moving).shape;
  const firstX = rectangle.node.getAttribute('x');
  f.send(move.target, 'move', move.x + 70, move.y + 50);
  assert.notEqual(rectangle.node.getAttribute('x'), firstX);
  f.send(move.target, 'up', move.x + 70, move.y + 50);
  f.select('cetz-edit-1');
  const edit = f.drag('cetz-point-1-1', 20, 25);
  const line = edit.handler.cetzDragImages.find(entry => entry.moving).shape;
  const firstPath = f.imageDocument(line).querySelector('path').getAttribute('d');
  f.send(edit.target, 'move', edit.x + 70, edit.y + 60);
  assert.notEqual(f.imageDocument(line).querySelector('path').getAttribute('d'), firstPath);
  assert.ok(line.bounds.width > 0 && line.bounds.height > 0);
});

test('native resize events repaint SVG width and height even with native live preview disabled', { skip }, async t => {
  const f = await fixture(t), selected = f.select('cetz-edit-0');
  const handler = f.graph.selectionCellsHandler.getHandler(selected.cell);
  const target = handler.sizers[7].node;
  const x = selected.state.x + selected.state.width, y = selected.state.y + selected.state.height;
  const original = selected.cell.children[0].geometry.width;
  f.send(target, 'down', x, y); f.send(target, 'move', x + 50, y + 30);
  assert.equal(handler.livePreviewActive, false, 'reproduce mxGraph disabling resize preview for parent cells');
  const preview = handler.cetzResizePreview.cetzDragImages.find(entry => entry.moving).shape;
  assert.ok(Number(preview.node.getAttribute('width')) > original);
  const width = preview.bounds.width;
  f.send(target, 'move', x + 90, y + 60);
  assert.ok(preview.bounds.width > width);
  assert.equal(selected.cell.children[0].geometry.width, original, 'resizing previews never rewrite rendered child geometry');
  f.send(target, 'up', x + 90, y + 60);
  assert.equal(preview.node, null);
});

test('native ellipse resizing updates both vector dimensions throughout the gesture', { skip }, async t => {
  const source = '#import "@preview/cetz:0.4.2"\n#cetz.canvas({ import cetz.draw: *; ' +
    'circle((0, 0), radius: (1, 0.5), fill: red) })';
  const f = await fixture(t, source), selected = f.select('cetz-edit-0');
  const handler = f.graph.selectionCellsHandler.getHandler(selected.cell), target = handler.sizers[7].node;
  const x = selected.state.x + selected.state.width, y = selected.state.y + selected.state.height;
  f.send(target, 'down', x, y); f.send(target, 'move', x + 35, y + 40);
  const entry = handler.cetzResizePreview.cetzDragImages.find(entry => entry.moving);
  assert.ok(entry, JSON.stringify({ previewCell: handler.cetzResizePreview.cells[0].id,
    index: handler.index, bounds: handler.bounds,
    layers: Object.values(f.graph.model.cells).filter(cell => /^cetz-render-/.test(cell.id)).map(cell => ({
      id: cell.id, parent: cell.parent && cell.parent.id, geometry: cell.geometry,
      style: cell.style.slice(0, 210), state: !!f.graph.view.getState(cell.parent) })),
    images: handler.cetzResizePreview.cetzDragImages.map(item => ({ id: item.cell.id, parent: item.cell.parent.id, moving: item.moving })) }));
  const shape = entry.shape;
  const firstWidth = Number(shape.node.getAttribute('width'));
  const firstHeight = Number(shape.node.getAttribute('height'));
  assert.equal(shape.node.getAttribute('preserveAspectRatio'), 'none');
  f.send(target, 'move', x + 75, y + 80);
  assert.ok(Number(shape.node.getAttribute('width')) > firstWidth);
  assert.ok(Number(shape.node.getAttribute('height')) > firstHeight);
});

test('native Bezier handle drags rewrite the SVG cubic while keeping the endpoint fixed', { skip }, async t => {
  const f = await fixture(t);
  f.select('cetz-edit-1');
  const geometryBefore = JSON.stringify(f.graph.model.getCell('cetz-point-1-2').geometry);
  const drag = f.drag('cetz-point-1-2', 40, -30);
  const entry = drag.handler.cetzDragImages.find(entry => entry.moving);
  const firstPath = f.imageDocument(entry.shape).querySelector('path').getAttribute('d');
  assert.match(firstPath, /C /, 'the curve is redrawn from cubic coordinates');
  const firstCurve = firstPath.split('C ')[1].trim().split(/\s+/).map(Number);
  f.send(drag.target, 'move', drag.x + 80, drag.y - 50);
  const secondCurve = f.imageDocument(entry.shape).querySelector('path').getAttribute('d')
    .split('C ')[1].trim().split(/\s+/).map(Number);
  assert.notEqual(secondCurve[0], firstCurve[0]);
  assert.deepEqual(secondCurve.slice(2), firstCurve.slice(2), 'the other control point and endpoint stay fixed');
  assert.equal(JSON.stringify(drag.cell.geometry), geometryBefore, 'no model writes occur while the mouse is held');
});

test('native line point drags repaint a changed path instead of moving its bitmap', { skip }, async t => {
  const f = await fixture(t);
  f.select('cetz-edit-2');
  const drag = f.drag('cetz-point-2-1', 20, 40);
  const shape = drag.handler.cetzDragImages.find(entry => entry.moving).shape;
  const first = f.imageDocument(shape).querySelector('path').getAttribute('d');
  f.send(drag.target, 'move', drag.x + 60, drag.y + 70);
  const second = f.imageDocument(shape).querySelector('path').getAttribute('d');
  assert.notEqual(second, first);
  assert.equal(second.split('L ')[0], first.split('L ')[0], 'the start of the line is pinned');
});

test('native arc endpoint drags regenerate the visible arc during the gesture', { skip }, async t => {
  const f = await fixture(t);
  f.select('cetz-edit-3');
  const drag = f.drag('cetz-point-3-2', 35, 30);
  const shape = drag.handler.cetzDragImages.find(entry => entry.moving).shape;
  const first = f.imageDocument(shape).querySelector('path').getAttribute('d');
  f.send(drag.target, 'move', drag.x + 60, drag.y + 65);
  const second = f.imageDocument(shape).querySelector('path').getAttribute('d');
  assert.notEqual(second, first);
  assert.equal(second.split('C ')[0], first.split('C ')[0], 'the arc start stays fixed');
});

test('native arc center drags change curvature while preserving the start point', { skip }, async t => {
  const f = await fixture(t);
  f.select('cetz-edit-3');
  const start = f.graph.view.getState(f.graph.model.getCell('cetz-point-3-0'));
  const expectedX = start.getCenterX(), expectedY = start.getCenterY();
  const drag = f.drag('cetz-point-3-1', 25, -20);
  const shape = drag.handler.cetzDragImages.find(entry => entry.moving).shape;
  const svg = f.imageDocument(shape), curve = svg.querySelector('path');
  const numbers = '[+-]?(?:\\d+\\.?\\d*|\\.\\d+)';
  const moves = [...curve.getAttribute('d').matchAll(new RegExp('M\\s+(' + numbers + ')\\s+(' + numbers + ')', 'g'))];
  const point = moves.at(-1);
  const translation = /translate\(([^)]+)\)/.exec(curve.getAttribute('transform'));
  const [tx, ty = 0] = translation ? translation[1].trim().split(/[\s,]+/).map(Number) : [0, 0];
  const [vx, vy, vw, vh] = svg.getAttribute('viewBox').split(/\s+/).map(Number);
  const screenX = shape.bounds.x + (+point[1] + tx - vx) * shape.bounds.width / vw;
  const screenY = shape.bounds.y + (+point[2] + ty - vy) * shape.bounds.height / vh;
  assert.ok(Math.abs(screenX - expectedX) < 0.001);
  assert.ok(Math.abs(screenY - expectedY) < 0.001);
  const first = curve.getAttribute('d');
  f.send(drag.target, 'move', drag.x + 40, drag.y - 30);
  assert.notEqual(f.imageDocument(shape).querySelector('path').getAttribute('d'), first);
});

for (const kind of ['hobby', 'catmull']) test(`native ${kind} knot drags redraw the spline path`, { skip }, async t => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *; ' +
    `${kind}((0, 0), (1, 1), (2, 0), (3, 1)) })`;
  const f = await fixture(t, source);
  f.select('cetz-edit-0');
  const drag = f.drag('cetz-point-0-1', 20, 30);
  const shape = drag.handler.cetzDragImages.find(entry => entry.moving).shape;
  const first = f.imageDocument(shape).querySelector('path').getAttribute('d');
  f.send(drag.target, 'move', drag.x + 50, drag.y + 60);
  assert.notEqual(f.imageDocument(shape).querySelector('path').getAttribute('d'), first);
});

test('native arrow endpoint drags also move and turn the arrowhead', { skip }, async t => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *; ' +
    'line((0, 0), (3, 0), mark: (end: ">")) })';
  const f = await fixture(t, source);
  f.select('cetz-edit-0');
  const drag = f.drag('cetz-point-0-1', 20, 30);
  const images = drag.handler.cetzDragImages.filter(entry => entry.moving);
  assert.ok(images.length >= 2);
  const first = images.map(entry => f.imageDocument(entry.shape).querySelector('path').getAttribute('d'));
  f.send(drag.target, 'move', drag.x + 60, drag.y + 70);
  const second = images.map(entry => f.imageDocument(entry.shape).querySelector('path').getAttribute('d'));
  assert.ok(second.every((data, index) => data !== first[index]), 'both the line and its mark are updated');
});

test('native text position handle drags move the original glyph vectors', { skip }, async t => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *; content((1, 1), [Hello]) })';
  const f = await fixture(t, source);
  f.select('cetz-edit-0');
  const drag = f.drag('cetz-point-0-0', 20, 30);
  const shape = drag.handler.cetzDragImages.find(entry => entry.moving && entry.shape.node.querySelector('use')).shape;
  assert.ok(f.imageDocument(shape).querySelector('use'));
  const first = shape.node.getAttribute('x');
  f.send(drag.target, 'move', drag.x + 60, drag.y + 70);
  assert.notEqual(shape.node.getAttribute('x'), first);
  const references = Array.from(shape.node.querySelectorAll('use')).map(node =>
    node.getAttributeNS('http://www.w3.org/1999/xlink', 'href'));
  assert.ok(references.every(reference => shape.node.querySelector('[id="' + reference.slice(1) + '"]')),
    'glyph references resolve inside this preview rather than another SVG');
});

test('editor hit areas and selection previews have no rectangular borders', { skip }, async t => {
  const f = await fixture(t), selected = f.select('cetz-edit-2');
  const style = f.graph.getCellStyle(selected.cell);
  assert.ok(style.strokeColor == null || style.strokeColor === 'none');
  assert.ok(selected.state.shape.stroke == null);
  assert.equal(Number(style.fillOpacity), 0);
  const handler = f.graph.selectionCellsHandler.getHandler(selected.cell);
  assert.equal(handler.selectionBorder.opacity, 0);
  assert.ok(!handler.sizers || handler.sizers.length === 0, 'a line does not have rectangular resize handles');
  assert.ok(f.graph.view.getState(f.graph.model.getCell('cetz-point-2-0')), 'the CeTZ endpoint remains available');
  const moveBorder = f.graph.graphHandler.createPreviewShape(new f.w.mxRectangle(0, 0, 100, 100));
  assert.equal(moveBorder.opacity, 0);
  moveBorder.destroy();
  const button = f.ui.sidebar.wrapper.querySelector('[data-cetz-outline-id="cetz-edit-2"] .cetzOutlineSelect');
  button.parentNode.dispatchEvent(new f.w.MouseEvent('mouseenter'));
  const highlights = f.graph.view.getOverlayPane().querySelectorAll('[data-cetz-outline-highlight]');
  assert.ok(highlights.length > 0);
  highlights.forEach(svg => {
    assert.ok(svg.querySelector('path'));
    assert.equal(svg.querySelector('rect'), null, 'outline hover follows the actual line rather than its box');
  });
});

test('a cached first-selection handler loses its border as soon as the plugin loads', { skip }, async t => {
  const f = await fixture(t, undefined, { initialSelection: 'cetz-edit-2' });
  const handler = f.graph.selectionCellsHandler.getHandler(f.graph.getSelectionCell());
  assert.ok(handler === f.initialHandler, 'the native selection handler is reused');
  assert.equal(handler.selectionBorder.opacity, 0);
  assert.equal(handler.selectionBorder.node.style.opacity, '0');
  assert.ok(!handler.sizers || handler.sizers.length === 0, 'cached rectangular resize handles are removed too');
  assert.ok(f.graph.view.getState(f.graph.model.getCell('cetz-point-2-0')), 'CeTZ endpoints remain usable');
  // Native refreshes reset border appearance when selection is restored.
  handler.selectionBorder.opacity = 100;
  handler.selectionBorder.node.style.opacity = '';
  handler.refresh(); handler.redraw();
  assert.equal(handler.selectionBorder.opacity, 0);
  assert.equal(handler.selectionBorder.node.style.opacity, '0');
});

test('the first pointer selection has no border before any control point is touched', { skip }, async t => {
  const f = await fixture(t), cell = f.graph.model.getCell('cetz-edit-2');
  assert.equal(f.graph.getSelectionCount(), 0);
  const state = f.graph.view.getState(cell), target = state.shape.node.firstChild;
  const x = state.getCenterX(), y = state.getCenterY();
  f.send(target, 'down', x, y);
  assert.equal(f.graph.getSelectionCell(), cell);
  let handler = f.graph.selectionCellsHandler.getHandler(cell);
  assert.equal(handler.selectionBorder.node.style.opacity, '0');
  assert.equal(handler.selectionBorder.node.style.pointerEvents, 'none');
  assert.ok(!handler.sizers || handler.sizers.length === 0, 'no rectangular handle arrangement on the first selection');
  assert.ok(f.graph.isCellVisible(f.graph.model.getCell('cetz-point-2-0')));
  assert.ok(f.graph.isCellVisible(f.graph.model.getCell('cetz-point-2-1')));
  f.send(target, 'up', x, y);
  handler = f.graph.selectionCellsHandler.getHandler(cell);
  assert.equal(handler.selectionBorder.node.style.opacity, '0', 'mouse release does not reveal the frame');
});

test('curves use CeTZ points while rectangles retain native resize controls', { skip }, async t => {
  const f = await fixture(t);
  for (const index of [1, 2, 3]) {
    const selected = f.select('cetz-edit-' + index);
    const handler = f.graph.selectionCellsHandler.getHandler(selected.cell);
    handler.refresh(); handler.redraw();
    assert.ok(!handler.sizers || handler.sizers.length === 0, 'curve handles stay absent after refresh');
    const point = f.select('cetz-point-' + index + '-0');
    const pointHandler = f.graph.selectionCellsHandler.getHandler(point.cell);
    assert.ok(!pointHandler.sizers || pointHandler.sizers.length === 0, 'a CeTZ point has no native box handles');
  }
  const rectangle = f.select('cetz-edit-0');
  assert.ok(f.graph.selectionCellsHandler.getHandler(rectangle.cell).sizers.some(Boolean));
});

const largeEdits = [
  ['quadratic Bezier', 'bezier((0,0),(3,0),(1,2))'],
  ['cubic Bezier', 'bezier((0,0),(3,0),(1,2),(2,-1))'],
  ['Catmull', 'catmull((0,0),(1,2),(3,1),(2,-1), tension: 0.8)'],
  ['closed Catmull', 'catmull((0,0),(1,2),(3,1),(2,-1), tension: 0.25, close: true)'],
  ['Hobby', 'hobby((0,0),(1,2),(3,1),(2,-1))'],
  ['tensioned Hobby', 'hobby((0,0),(1,2),(3,1),(2,-1), ta: (1.2,0.8,1.5), tb: (1,2,0.75), omega: (1,1))'],
  ['closed Hobby', 'hobby((0,0),(1,2),(3,1),(2,-1), close: true)']
];
for (const [name, call] of largeEdits) test(`large ${name} edits agree with freshly rendered CeTZ control vertices`, { skip }, async t => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *; ' + call + ' })';
  const f = await fixture(t, source);
  f.select('cetz-edit-0');
  const pointId = 'cetz-point-0-' + (name.includes('Bezier') ? 2 : 1);
  const drag = f.drag(pointId, 2400, -1300);
  await compareWithTypst(f, drag, pointId);
  f.send(drag.target, 'move', drag.x - 1800, drag.y + 900);
  await compareWithTypst(f, drag, pointId);
});

test('extreme resizing changes geometry without stretching stroke widths', { skip }, async t => {
  const source = '#import "@preview/cetz:0.4.2"\n#cetz.canvas({ import cetz.draw: *; rect((0,0),(2,1), stroke: 4pt) })';
  const f = await fixture(t, source), selected = f.select('cetz-edit-0');
  const handler = f.graph.selectionCellsHandler.getHandler(selected.cell), target = handler.sizers[7].node;
  const x = selected.state.x + selected.state.width, y = selected.state.y + selected.state.height;
  f.send(target, 'down', x, y); f.send(target, 'move', x + 1800, y + 30);
  const shape = handler.cetzResizePreview.cetzDragImages.find(entry => entry.moving).shape;
  const [, , vw, vh] = shape.node.getAttribute('viewBox').split(/\s+/).map(Number);
  assert.ok(Math.abs(shape.bounds.width / vw - 2.5) < 0.001);
  assert.ok(Math.abs(shape.bounds.height / vh - 2.5) < 0.001, 'SVG units keep an equal scale on both axes');
  assert.equal(Number(shape.node.querySelector('path').getAttribute('stroke-width')), 4);
  assert.doesNotMatch(shape.node.outerHTML, /NaN|Infinity/);
});

test('extreme line endpoint movement preserves arrowhead edge lengths', { skip }, async t => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *; ' +
    'line((0,0),(3,1), mark: (end: ">")) })';
  const f = await fixture(t, source);
  f.select('cetz-edit-0');
  function edges(shape) {
    const path = shape.node.querySelector('path').getAttribute('d');
    const drawing = path.slice(path.lastIndexOf('M '));
    const number = '[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[+-]?\\d+)?';
    const points = [...drawing.matchAll(new RegExp('[ML]\\s+(' + number + ')\\s+(' + number + ')', 'gi'))]
      .map(match => ({ x: +match[1], y: +match[2] }));
    const [, , width, height] = shape.node.getAttribute('viewBox').split(/\s+/).map(Number);
    return points.slice(1).map((point, i) => Math.hypot((point.x - points[i].x) * shape.bounds.width / width,
      (point.y - points[i].y) * shape.bounds.height / height));
  }
  const drag = f.drag('cetz-point-0-1', 30, 40);
  const images = drag.handler.cetzDragImages.filter(entry => entry.moving);
  assert.ok(images.length >= 2);
  const arrow = images[images.length - 1].shape, before = edges(arrow);
  assert.ok(before.length >= 2);
  f.send(drag.target, 'move', drag.x + 2200, drag.y + 100);
  const after = edges(arrow);
  assert.equal(after.length, before.length);
  after.forEach((length, i) => assert.ok(Math.abs(length - before[i]) < 0.001));
});

test('an arc center moved onto its start stays finite without a corrupt SVG', { skip }, async t => {
  const f = await fixture(t);
  f.select('cetz-edit-3');
  const start = f.graph.view.getState(f.graph.model.getCell('cetz-point-3-0'));
  const center = f.graph.view.getState(f.graph.model.getCell('cetz-point-3-1'));
  const drag = f.drag('cetz-point-3-1', start.getCenterX() - center.getCenterX(), start.getCenterY() - center.getCenterY());
  const shape = drag.handler.cetzDragImages.find(entry => entry.moving).shape;
  assert.doesNotMatch(shape.node.outerHTML, /NaN|Infinity/);
  const viewBox = shape.node.getAttribute('viewBox').split(/\s+/).map(Number);
  assert.ok(viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0);
});


function inspectorCommands(f) {
  return Object.values(f.graph.model.cells).filter(cell => /(?:^|;)cetzAction=properties;/.test(cell.style || ''));
}
async function waitForInspector(predicate) {
  const deadline = Date.now() + 3000;
  while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(predicate(), 'automatic property synchronization completes');
}
async function acceptInspectorCommand(f, source) {
  const { sourceAction, sourceActionPatches } = require('../src/source-actions');
  const cells = readAllCells(f.w.mxUtils.getXml(new f.w.mxCodec().encode(f.graph.model)));
  const action = sourceAction(cells, readAllCells(f.rendered.xml));
  assert.equal(action.action, 'properties');
  const next = sourceActionPatches(source, f.rendered, action).sort((a, b) => b.start - a.start)
    .reduce((text, patch) => text.slice(0, patch.start) + patch.text + text.slice(patch.end), source);
  const rendered = await renderEditable(next, parseCanvas(next).canvas, path.resolve('examples/native.typ'));
  f.graph.model.beginUpdate();
  try {
    f.graph.removeCells([f.graph.model.getCell(action.id)]);
    for (const [id, entry] of readAllCells(rendered.xml)) if (/^cetz-edit-/.test(id))
      f.graph.model.setStyle(f.graph.model.getCell(id), entry.cell.style);
  } finally { f.graph.model.endUpdate(); }
  f.rendered = rendered;
  await new Promise(resolve => setTimeout(resolve, 20));
  return next;
}

test('inspector automatically saves debounced coordinates and preserves newer input and focus during rendering', { skip }, async t => {
  let source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *\nline((0, 0), (2, 1), stroke: 1pt + black)\n})';
  const f = await fixture(t, source); f.select('cetz-edit-0');
  f.w.document.body.appendChild(f.ui.sidebar.wrapper);
  const panel = f.ui.sidebar.wrapper.querySelector('.cetzInspector');
  const input = label => panel.querySelector('[aria-label="' + label + '"]');
  assert.equal(panel.querySelector('.cetzApply'), null);
  const x = input('Start X'); x.focus();
  for (const value of ['0.0', '0.03', '0.03125']) {
    x.value = value; x.dispatchEvent(new f.w.Event('input', { bubbles: true }));
  }
  input('Start Y').value = '-1.125'; input('Start Y').dispatchEvent(new f.w.Event('input', { bubbles: true }));
  assert.equal(inspectorCommands(f).length, 0, 'typing is coalesced');
  await waitForInspector(() => inspectorCommands(f).length === 1);
  x.value = '0.0625'; x.dispatchEvent(new f.w.Event('input', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 450));
  assert.equal(inspectorCommands(f).length, 1, 'only one write can be in flight');
  source = await acceptInspectorCommand(f, source);
  assert.match(source, /line\(\(0.03125, -1.125\)/);
  assert.equal(input('Start X'), x);
  assert.equal(x.value, '0.0625');
  assert.equal(f.w.document.activeElement, x);
  await waitForInspector(() => inspectorCommands(f).length === 1);
  source = await acceptInspectorCommand(f, source);
  assert.match(source, /line\(\(0.0625, -1.125\)/);
  assert.match(panel.querySelector('.cetzStatus').textContent, /saved automatically/);
  assert.equal(f.w.document.activeElement, x);
});

test('stroke inspector automatically saves menus and retains advanced dictionary fields', { skip }, async t => {
  let source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *\nline((0, 0), (2, 1), stroke: (paint: red, thickness: 2pt, cap: "round", join: "bevel", miter-limit: 4))\n})';
  const f = await fixture(t, source); f.select('cetz-edit-0');
  const panel = f.ui.sidebar.wrapper.querySelector('.cetzInspector');
  const input = label => panel.querySelector('[aria-label="' + label + '"]');
  assert.equal(input('Stroke cap').value, '"round"');
  for (const [label, value] of [['stroke Typst color', 'green'], ['Stroke thickness', '3pt'], ['Stroke dash', '"dotted"'], ['close', 'true']]) {
    input(label).value = value;
    input(label).dispatchEvent(new f.w.Event('change', { bubbles: true }));
    assert.equal(inspectorCommands(f).length, 1, label + ' applies without waiting for a button');
    source = await acceptInspectorCommand(f, source);
  }
  assert.match(source, /stroke: \(paint: green, thickness: 3pt, cap: "round", join: "bevel", miter-limit: 4, dash: "dotted"\)/);
  assert.match(source, /close: true/);
});

test('inspector keeps invalid coordinates unsaved and automatically applies corrected expressions and marks', { skip }, async t => {
  let source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *\nline((0, 0), (2, 1), mark: (end: ">", scale: 2, fill: red))\n})';
  const f = await fixture(t, source); f.select('cetz-edit-0');
  const panel = f.ui.sidebar.wrapper.querySelector('.cetzInspector');
  const input = label => panel.querySelector('[aria-label="' + label + '"]');
  assert.equal(input('End mark').value, 'triangle');
  input('Start X').value = '';
  input('Start X').dispatchEvent(new f.w.Event('input', { bubbles: true }));
  input('close').value = 'true'; input('close').dispatchEvent(new f.w.Event('change', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 450));
  assert.equal(inspectorCommands(f).length, 0);
  input('Start expression mode').click();
  input('Start expression').value = '(1, 2)';
  input('Start expression').dispatchEvent(new f.w.Event('input', { bubbles: true }));
  await waitForInspector(() => inspectorCommands(f).length === 1);
  source = await acceptInspectorCommand(f, source);
  assert.equal(input('Start X').value, '1');
  assert.equal(input('Start Y').value, '2');
  assert.match(source, /line\(\(1, 2\)/);
  input('Start mark').value = 'bar'; input('Start mark').dispatchEvent(new f.w.Event('change', { bubbles: true }));
  assert.equal(inspectorCommands(f).length, 1);
  source = await acceptInspectorCommand(f, source);
  assert.match(source, /mark: \(end: ">", scale: 2, fill: red, start: "bar"\)/);
});

test('automatic inspector queues edits across selection changes without writing to the new selection', { skip }, async t => {
  let source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *\nline((0, 0), (2, 1))\ncircle((4, 0), radius: 1)\n})';
  const f = await fixture(t, source); f.select('cetz-edit-0');
  let panel = f.ui.sidebar.wrapper.querySelector('.cetzInspector');
  const x = panel.querySelector('[aria-label="Start X"]');
  x.value = '1'; x.dispatchEvent(new f.w.Event('input', { bubbles: true }));
  f.select('cetz-edit-1');
  panel = f.ui.sidebar.wrapper.querySelector('.cetzInspector');
  const radius = panel.querySelector('[aria-label="radius"]');
  radius.value = '2'; radius.dispatchEvent(new f.w.Event('input', { bubbles: true }));
  await waitForInspector(() => inspectorCommands(f).length === 1);
  source = await acceptInspectorCommand(f, source);
  await waitForInspector(() => inspectorCommands(f).length === 1);
  source = await acceptInspectorCommand(f, source);
  assert.match(source, /line\(\(1, 0\), \(2, 1\)\)/);
  assert.match(source, /circle\(\(4, 0\), radius: 2\)/);
});

test('automatic inspector waits for IME composition and preserves rejected values for correction', { skip }, async t => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *\ncontent((0, 0), [Hello])\n})';
  const f = await fixture(t, source); f.select('cetz-edit-0');
  const panel = f.ui.sidebar.wrapper.querySelector('.cetzInspector');
  const text = panel.querySelector('[aria-label="Text / content"]');
  text.dispatchEvent(new f.w.CompositionEvent('compositionstart', { bubbles: true }));
  text.value = '[日本語]'; text.dispatchEvent(new f.w.Event('input', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 450));
  assert.equal(inspectorCommands(f).length, 0);
  text.dispatchEvent(new f.w.CompositionEvent('compositionend', { bubbles: true }));
  await waitForInspector(() => inspectorCommands(f).length === 1);
  // A failed Typst render returns the original properties with a newer scene.
  f.graph.model.beginUpdate();
  try {
    f.graph.removeCells(inspectorCommands(f));
    f.graph.insertVertex(f.graph.getDefaultParent(), 'cetz-scene-999', '', -1000, -1000, 1, 1, 'opacity=0;');
  } finally { f.graph.model.endUpdate(); }
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(text.value, '[日本語]');
  assert.match(panel.querySelector('.cetzStatus').textContent, /Preview updates when the value is valid/);
  await new Promise(resolve => setTimeout(resolve, 450));
  assert.equal(inspectorCommands(f).length, 0, 'failed drafts are not retried in a loop');
  text.value = '[Corrected]'; text.dispatchEvent(new f.w.Event('input', { bubbles: true }));
  await waitForInspector(() => inspectorCommands(f).length === 1);
  const next = await acceptInspectorCommand(f, source);
  assert.match(next, /\[Corrected\]/);
});

test('automatic inspector cancels pending writes when another document reuses the same shape IDs', { skip }, async t => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *\nline((0, 0), (2, 1))\n})';
  const f = await fixture(t, source);
  let title = 'first.cetz-1.drawio';
  f.ui.getCurrentFile = () => ({ getId() { return null; }, getTitle() { return title; }, getData() { return ''; } });
  f.ui.fileLoaded(); f.select('cetz-edit-0');
  const input = f.ui.sidebar.wrapper.querySelector('[aria-label="Start X"]');
  input.value = '9'; input.dispatchEvent(new f.w.Event('input', { bubbles: true }));
  title = 'second.cetz-1.drawio'; f.ui.fileLoaded();
  await new Promise(resolve => setTimeout(resolve, 450));
  assert.equal(inspectorCommands(f).length, 0);
  assert.equal(f.ui.sidebar.wrapper.querySelector('[aria-label="Start X"]').value, '0');
});

test('inspector automatically retries a correction entered while an incomplete draft is being validated', { skip }, async t => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *\nline((0, 0), (2, 1), stroke: black)\n})';
  const f = await fixture(t, source); f.select('cetz-edit-0');
  const panel = f.ui.sidebar.wrapper.querySelector('.cetzInspector');
  const stroke = panel.querySelector('[aria-label="stroke"]');
  stroke.value = 'red +'; stroke.dispatchEvent(new f.w.Event('input', { bubbles: true }));
  await waitForInspector(() => inspectorCommands(f).length === 1);
  stroke.value = '2pt + red'; stroke.dispatchEvent(new f.w.Event('input', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 450));
  f.graph.model.beginUpdate();
  try {
    f.graph.removeCells(inspectorCommands(f));
    f.graph.insertVertex(f.graph.getDefaultParent(), 'cetz-scene-999', '', -1000, -1000, 1, 1, 'opacity=0;');
  } finally { f.graph.model.endUpdate(); }
  await waitForInspector(() => inspectorCommands(f).length === 1);
  assert.equal(stroke.value, '2pt + red');
  const next = await acceptInspectorCommand(f, source);
  assert.match(next, /stroke: 2pt \+ red/);
  assert.match(panel.querySelector('.cetzStatus').textContent, /saved automatically/);
});

test('Outline separates names and geometry, preserves scroll, and highlights the owner of a selected point', { skip }, async t => {
  const f = await fixture(t);
  const outline = f.ui.sidebar.wrapper.querySelector('.cetzOutline');
  assert.equal(outline.querySelector('h2').textContent, 'Outline');
  assert.equal(Number(outline.querySelector('.cetzOutlineCount').textContent), f.rendered.calls.length);
  let list = outline.querySelector('.cetzOutlineList');
  const row = list.querySelector('[data-cetz-outline-id="cetz-edit-2"]');
  assert.equal(row.querySelector('.cetzOutlineNameText').textContent, 'line');
  assert.match(row.querySelector('.cetzOutlineMeta').textContent, /^line ·/);
  assert.ok(row.querySelector('.cetzOutlineIcon svg path'));
  list.scrollTop = 70;
  f.graph.setCellStyles('cetzDash', 'solid', [f.graph.model.getCell('cetz-edit-2')]);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(outline.querySelector('.cetzOutlineList'), list, 'unrelated redraws preserve DOM and scroll');
  f.select('cetz-point-2-0');
  list = outline.querySelector('.cetzOutlineList');
  assert.equal(list.scrollTop, 70);
  assert.equal(list.querySelector('[data-cetz-outline-id="cetz-edit-2"]').getAttribute('data-selected'), 'true');
  assert.equal(list.querySelector('[aria-pressed="true"]').closest('[data-cetz-outline-id]').getAttribute('data-cetz-outline-id'), 'cetz-edit-2');
});

test('Outline collapses groups, reveals selected descendants, and retains layer selection and reorder actions', { skip }, async t => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *\n' +
    'group({ rect((0, 0), (2, 1), name: "Panel"); circle((3, 0), radius: 0.6, name: "Status") }, name: "Layout")\n' +
    'line((0, -1), (3, -1), name: "Connection")\ncontent((0, -2), [Overview], name: "Caption")\n})';
  const f = await fixture(t, source);
  const outline = f.ui.sidebar.wrapper.querySelector('.cetzOutline');
  const groupId = 'cetz-edit-' + f.rendered.calls.findIndex(call => call.name === 'group');
  const rectId = 'cetz-edit-' + f.rendered.calls.findIndex(call => call.name === 'rect');
  const lineId = 'cetz-edit-' + f.rendered.calls.findIndex(call => call.name === 'line');
  const rows = () => outline.querySelectorAll('.cetzOutlineRow');
  const row = id => outline.querySelector('[data-cetz-outline-id="' + id + '"]');
  const total = rows().length;
  assert.equal(row(groupId).querySelector('.cetzOutlineNameText').textContent, 'Layout');
  assert.equal(row(groupId).querySelector('.cetzOutlineCount').textContent, '2');
  row(groupId).querySelector('.cetzOutlineBranch').click();
  assert.equal(rows().length, total - 2);
  assert.equal(row(groupId).querySelector('.cetzOutlineBranch').getAttribute('aria-expanded'), 'false');
  f.select(lineId);
  assert.equal(rows().length, total - 2, 'selecting another top-level item preserves collapse');
  f.select(rectId);
  assert.equal(rows().length, total, 'canvas selection reveals the selected child');
  assert.equal(row(rectId).getAttribute('data-selected'), 'true');
  row(lineId).querySelector('.cetzOutlineSelect').click();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(f.graph.getSelectionCell().id, lineId);
  row(rectId).querySelector('.cetzOutlineSelect').dispatchEvent(new f.w.MouseEvent('click', { bubbles: true, ctrlKey: true }));
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(f.graph.getSelectionCells().length, 2);
  row(lineId).querySelector('[aria-label="Move layer down"]').click();
  assert.ok(Object.values(f.graph.model.cells).some(cell => /cetzAction=move-after;/.test(cell.style || '')));
});

test('Outline explains how to start an empty drawing', { skip }, async t => {
  const f = await fixture(t, '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *\n})');
  const outline = f.ui.sidebar.wrapper.querySelector('.cetzOutline');
  assert.equal(outline.querySelector('.cetzOutlineCount').textContent, '0');
  assert.match(outline.querySelector('.cetzOutlineEmpty').textContent, /No objects yet/);
});

test('three-point circle, arc and Bezier previews match Typst while their points move', { skip }, async t => {
  for (const name of ['circle-through', 'arc-through', 'bezier-through']) {
    const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *\n' + name + '((0, 0), (1, 1), (2, 0))\n})';
    const f = await fixture(t, source, { loadedLayers: true });
    assert.equal(Object.keys(f.graph.model.cells).filter(id => /^cetz-point-0-/.test(id)).length, 3, name);
    const unit = f.rendered.calibration.unitX * 2.5;
    const drag = f.drag('cetz-point-0-1', unit * 0.25, -unit * 0.5);
    await compareWithTypst(f, drag, 'cetz-point-0-1');
    f.send(drag.target, 'up', drag.x + unit * 0.25, drag.y - unit * 0.5);
  }
});

test('Boolean properties offer all four operations and save them automatically', { skip }, async t => {
  let source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *\nboolean({ rect((0, 0), (2, 2)) }, { rect((1, 1), (3, 3)) }, op: "difference", fill: blue)\n})';
  const f = await fixture(t, source); f.select('cetz-edit-0');
  const panel = f.ui.sidebar.wrapper.querySelector('.cetzInspector');
  const menu = panel.querySelector('[aria-label="op"]');
  assert.equal(menu.tagName, 'SELECT');
  assert.deepEqual([...menu.options].map(option => option.value).filter(Boolean), ['"union"', '"intersection"', '"difference"', '"xor"']);
  for (const op of ['union', 'intersection', 'xor', 'difference']) {
    menu.value = JSON.stringify(op); menu.dispatchEvent(new f.w.Event('change', { bubbles: true }));
    assert.equal(inspectorCommands(f).length, 1);
    source = await acceptInspectorCommand(f, source);
    assert.ok(source.includes('op: ' + JSON.stringify(op)));
  }
});

test('Boolean artwork survives native Draw.io serialization, selection, movement and resizing', { skip }, async t => {
  for (const version of ['0.5.2', '0.5.3']) {
    const source = '#import "@preview/cetz:' + version + '"\n#cetz.canvas({ import cetz.draw: *\nboolean({ rect((3, 2.5), (4.5, 4)) }, { rect((3.5, 4.5), (6, 3)) }, op: "difference", fill: blue)\n})';
    const f = await fixture(t, source, { loadedLayers: true });
    const xml = () => f.w.mxUtils.getXml(new f.w.mxCodec().encode(f.graph.model));
    assert.deepEqual(patchesFromEditable(source, f.rendered, xml(), readAllCells), [], 'an unchanged native save is not an artwork edit');
    f.select('cetz-edit-0');
    assert.deepEqual(patchesFromEditable(source, f.rendered, xml(), readAllCells), [], 'selection remains source-neutral');
    const unit = f.rendered.calibration.unitX * 2.5;
    const drag = f.drag('cetz-edit-0', unit * 0.5, unit * 0.25);
    f.send(drag.target, 'up', drag.x + unit * 0.5, drag.y + unit * 0.25);
    const patches = patchesFromEditable(source, f.rendered, xml(), readAllCells);
    assert.equal(patches.length, 1, 'moving the owner is an editable source operation');
    const moved = patches.reduceRight((text, patch) => text.slice(0, patch.start) + patch.text + text.slice(patch.end), source);
    const rendered = await renderEditable(moved, parseCanvas(moved).canvas, path.resolve('examples/basic.typ'));
    assert.ok(rendered.calls[0].geometry);
    const selected = f.select('cetz-edit-0');
    const handler = f.graph.selectionCellsHandler.getHandler(selected.cell), target = handler.sizers[7].node;
    const x = selected.state.x + selected.state.width, y = selected.state.y + selected.state.height;
    f.send(target, 'down', x, y); f.send(target, 'move', x + unit * 0.5, y + unit * 0.25);
    f.send(target, 'up', x + unit * 0.5, y + unit * 0.25);
    const resizedPatches = patchesFromEditable(source, f.rendered, xml(), readAllCells);
    assert.equal(resizedPatches.length, 1);
    const resized = resizedPatches.reduceRight((text, patch) => text.slice(0, patch.start) + patch.text + text.slice(patch.end), source);
    const resizedRender = await renderEditable(resized, parseCanvas(resized).canvas, path.resolve('examples/basic.typ'));
    assert.ok(resizedRender.calls[0].geometry);
    assert.equal(f.graph.isEnabled(), true);
  }
});

test('all palette shapes survive untouched native serialization while actual artwork edits are still rejected', { skip }, async t => {
  const { ALL_SHAPES } = require('../src/templates');
  for (const shape of ALL_SHAPES) {
    const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *\n' + shape.call + '\n})';
    const f = await fixture(t, source);
    const xml = f.w.mxUtils.getXml(new f.w.mxCodec().encode(f.graph.model));
    assert.deepEqual(patchesFromEditable(source, f.rendered, xml, readAllCells), [], shape.label);
    const layer = Object.values(f.graph.model.cells).find(cell => /^cetz-render-/.test(cell.id));
    const geometry = layer.geometry.clone(); geometry.x += 1;
    f.graph.model.setGeometry(layer, geometry);
    const damaged = f.w.mxUtils.getXml(new f.w.mxCodec().encode(f.graph.model));
    assert.throws(() => patchesFromEditable(source, f.rendered, damaged, readAllCells), /rendered shape/, shape.label);
  }
});

test('new shapes move on the CeTZ grid with native Draw.io guides enabled', { skip }, async t => {
  const calls = [
    'polygon((3, 3.5), 6, radius: 0.70710678, angle: -45deg)',
    'polygon((3.09557432, 3.5), 6, radius: 0.70710678, angle: -45deg)',
    'circle-through((0, 0), (1, 1), (2, 0))',
    'arc-through((0, 0), (1, 1), (2, 0))',
    'bezier-through((0, 0), (1, 1), (2, 0))',
    'boolean({ rect((3, 2.5), (4.5, 4)) }, { rect((3.5, 4.5), (6, 3)) }, op: "difference", fill: blue)'
  ];
  const { propertyModel } = require('../src/properties');
  const { snapStep, snapCoordinate } = require('../src/snapping');
  const cases = [[1, 0.01, 0.1], ...[1, 4, 16].map(scale => {
    const step = snapStep(scale); return [scale, step * 1.48, step * 2.44];
  })];
  function firstPoint(call) {
    const field = propertyModel(call).fields.find(field => field.key === '$0');
    if (field.point) return field.point;
    const rect = /rect\(\(\s*([+\d.-]+),\s*([+\d.-]+)\)/.exec(field.value);
    return [Number(rect[1]), Number(rect[2])];
  }
  for (const call of calls) for (const [scale, dx, dy] of cases) {
    const source = '#import "@preview/cetz:0.5.3"\n#cetz.canvas({ import cetz.draw: *\n' + call + '\n})';
    const f = await fixture(t, source, { loadedLayers: true });
    f.graph.view.scaleAndTranslate(scale, 3, -2);
    f.graph.graphHandler.guidesEnabled = true;
    const unit = f.rendered.calibration.unitX * 2.5 * scale;
    const drag = f.drag('cetz-edit-0', unit * dx, -unit * dy);
    const guided = { ...drag.handler.cetzGuideSnap };
    f.send(drag.target, 'up', drag.x + unit * dx, drag.y - unit * dy);
    const xml = f.w.mxUtils.getXml(new f.w.mxCodec().encode(f.graph.model));
    const patches = patchesFromEditable(source, f.rendered, xml, readAllCells);
    const changed = patches.reduceRight((text, patch) => text.slice(0, patch.start) + patch.text + text.slice(patch.end), source);
    const rendered = await renderEditable(changed, parseCanvas(changed).canvas, path.resolve('examples/basic.typ'));
    const before = firstPoint(f.rendered.calls[0]), after = firstPoint(rendered.calls[0]);
    assert.deepEqual(guided, { x: false, y: false }, call + ' has no other shape to guide to');
    assert.deepEqual(after, [snapCoordinate(before[0] + dx, snapStep(scale)), snapCoordinate(before[1] + dy, snapStep(scale))], scale + '×: ' + changed);
    if (call.startsWith('polygon')) assert.ok(changed.includes('radius: 0.70710678'), 'moving preserves radius and shape');
  }
});

test('polygon movement retains intentional off-grid alignment to a real shape', { skip }, async t => {
  const source = '#import "@preview/cetz:0.5.3"\n#cetz.canvas({ import cetz.draw: *\npolygon((0, 0), 6, radius: 0.70710678, angle: -45deg)\nrect((3.13, 4), (4.13, 5))\n})';
  const f = await fixture(t, source, { loadedLayers: true });
  f.graph.graphHandler.guidesEnabled = true;
  const unit = f.rendered.calibration.unitX * 2.5;
  const drag = f.drag('cetz-edit-0', unit * 2.43, -unit * 0.74);
  assert.equal(drag.handler.cetzGuideSnap.x, true);
  assert.equal(drag.handler.cetzGuideSnap.y, false);
  assert.ok(drag.handler.guide.states.every(state => /^cetz-(edit|point)-/.test(state.cell.id)));
  const target = f.graph.view.getState(f.graph.model.getCell('cetz-edit-1'));
  assert.ok(Math.abs(drag.state.x + drag.state.width + drag.handler.currentDx - target.x) < 0.001);
  f.send(drag.target, 'up', drag.x + unit * 2.43, drag.y - unit * 0.74);
  const xml = f.w.mxUtils.getXml(new f.w.mxCodec().encode(f.graph.model));
  const patches = patchesFromEditable(source, f.rendered, xml, readAllCells);
  const changed = patches.reduceRight((text, patch) => text.slice(0, patch.start) + patch.text + text.slice(patch.end), source);
  const point = require('../src/properties').propertyModel(require('../src/advanced').locateEditableCalls(changed, parseCanvas(changed).canvas)[0]).fields[0].point;
  assert.ok(Math.abs(point[0] - (3.13 - 0.70710678)) < 0.00001, changed);
  assert.equal(point[1], 0.75);
});

test('body drag coordinates remain authoritative after pixel-bound rounding and repeated renders', { skip }, async t => {
  const { snapStep, snapCoordinate } = require('../src/snapping');
  const { propertyModel } = require('../src/properties');
  let source = '#import "@preview/cetz:0.5.3"\n#cetz.canvas({ import cetz.draw: *\nrect((0, 0), (3, 2))\ncircle((1.5, 1), radius: 0.2)\ncontent((0.60002, 0.25), [aaaa])\nboolean({ rect((4.59998797, 1.93531558), (6.65824109, 4.12313302)) }, { rect((5.28607205, 4.85240551), (8.7164946, 2.66458805)) }, op: "xor", fill: blue)\npolygon((2.50587685, 3.67620927), 3, radius: 0.70710678, angle: 0deg)\n})';
  for (const [scale, dx, dy] of [[1, 0.37, 0.61], [2, -0.31, 0.43], [4, 0.17, -0.29], [8, -0.07, 0.13]]) {
    const f = await fixture(t, source, { loadedLayers: true });
    f.graph.graphHandler.guidesEnabled = false;
    f.graph.view.scaleAndTranslate(scale, 3, -2);
    const index = f.rendered.calls.findIndex(call => call.name === 'polygon');
    const before = propertyModel(f.rendered.calls[index]).fields[0].point;
    const unit = f.rendered.calibration.unitX * 2.5 * scale;
    const drag = f.drag('cetz-edit-' + index, unit * dx, -unit * dy);
    f.send(drag.target, 'up', drag.x + unit * dx, drag.y - unit * dy);
    const style = f.graph.getCellStyle(drag.cell), step = snapStep(scale);
    assert.equal(Number(style.cetzMoveX), snapCoordinate(before[0] + dx, step));
    assert.equal(Number(style.cetzMoveY), snapCoordinate(before[1] + dy, step));
    // Simulate native layout/save rounding after the drag was snapped. That
    // rounding must not turn a translation into a scale or alter its target.
    const g = drag.cell.geometry.clone();
    g.x = Math.round(g.x) + 0.17; g.y = Math.round(g.y) - 0.23;
    g.width = Math.round(g.width * 100) / 100; g.height = Math.round(g.height * 100) / 100;
    f.graph.model.setGeometry(drag.cell, g);
    const xml = f.w.mxUtils.getXml(new f.w.mxCodec().encode(f.graph.model));
    const patches = patchesFromEditable(source, f.rendered, xml, readAllCells);
    source = patches.sort((a, b) => b.start - a.start).reduce((text, patch) => text.slice(0, patch.start) + patch.text + text.slice(patch.end), source);
    const next = await renderEditable(source, parseCanvas(source).canvas, path.resolve('examples/basic.typ'));
    const polygon = next.calls.find(call => call.name === 'polygon');
    assert.deepEqual(propertyModel(polygon).fields[0].point, [snapCoordinate(before[0] + dx, step), snapCoordinate(before[1] + dy, step)], source);
    assert.match(polygon.call, /, 3, radius: 0.70710678, angle: 0deg/);
  }
});

test('body drag protocol preserves free movement when the grid is disabled', { skip }, async t => {
  const source = '#import "@preview/cetz:0.5.3"\n#cetz.canvas({ import cetz.draw: *\npolygon((0, 0), 6, radius: 0.70710678)\n})';
  const f = await fixture(t, source, { loadedLayers: true });
  f.graph.gridEnabled = false; f.graph.graphHandler.guidesEnabled = false;
  const unit = f.rendered.calibration.unitX * 2.5, drag = f.drag('cetz-edit-0', unit * 0.37, -unit * 0.61);
  f.send(drag.target, 'up', drag.x + unit * 0.37, drag.y - unit * 0.61);
  assert.equal(String(f.graph.getCellStyle(drag.cell).cetzMoveGrid), '0');
  const patches = patchesFromEditable(source, f.rendered, f.w.mxUtils.getXml(new f.w.mxCodec().encode(f.graph.model)), readAllCells);
  assert.match(patches[0].text, /polygon\(\(0.37, 0.61\), 6, radius: 0.70710678\)/);
});

test('moving a selection shares one translation and preserves relative positions', { skip }, async t => {
  const source = '#import "@preview/cetz:0.5.3"\n#cetz.canvas({ import cetz.draw: *\npolygon((0.1, 0.2), 6, radius: 0.70710678)\ncircle((3.13, 4.17), radius: 0.3)\n})';
  const f = await fixture(t, source, { loadedLayers: true });
  f.graph.graphHandler.guidesEnabled = false;
  f.graph.setSelectionCells([f.graph.model.getCell('cetz-edit-0'), f.graph.model.getCell('cetz-edit-1')]);
  f.graph.view.validate();
  const state = f.graph.view.getState(f.graph.model.getCell('cetz-edit-0'));
  const x = state.getCenterX(), y = state.getCenterY(), target = state.shape.node.firstChild;
  const unit = f.rendered.calibration.unitX * 2.5;
  f.send(target, 'down', x, y); f.send(target, 'move', x + unit * 0.37, y - unit * 0.61);
  f.send(target, 'up', x + unit * 0.37, y - unit * 0.61);
  const patches = patchesFromEditable(source, f.rendered, f.w.mxUtils.getXml(new f.w.mxCodec().encode(f.graph.model)), readAllCells);
  assert.equal(patches.length, 2);
  const next = patches.sort((a, b) => b.start - a.start).reduce((text, patch) => text.slice(0, patch.start) + patch.text + text.slice(patch.end), source);
  assert.match(next, /polygon\(\(0.5, 0.75\), 6, radius: 0.70710678\)/);
  assert.match(next, /circle\(\(3.53, 4.72\), radius: 0.3\)/);
});

test('selection operations replace composite palette tools and apply Boolean to selected non-rectangle shapes', { skip }, async t => {
  const source = '#import "@preview/cetz:0.5.3"\n#cetz.canvas({ import cetz.draw: *\ncircle((0, 0), radius: 1.5, fill: red)\npolygon((0.5, 0), 5, radius: 1.5)\n})';
  const f = await fixture(t, source);
  const names = f.paletteEntries['cetz-preview-primitives'].concat(f.paletteEntries['cetz-advanced']).map(entry => entry.getAttribute('aria-label'));
  assert.equal(names.length, 15);
  for (const name of ['boolean', 'rect-around', 'merge-path', 'compound-path']) assert.equal(names.includes(name), false);
  f.select('cetz-edit-0');
  const panel = f.ui.sidebar.wrapper.querySelector('.cetzOperations');
  const button = action => panel.querySelector('[data-cetz-operation="' + action + '"]');
  assert.equal(button('boolean-union').disabled, true);
  assert.equal(button('make-rect-around').disabled, false);
  f.graph.setSelectionCells([f.graph.model.getCell('cetz-edit-1'), f.graph.model.getCell('cetz-edit-0')]);
  assert.equal(button('boolean-union').disabled, false);
  assert.equal(button('make-compound-path').disabled, false);
  button('boolean-xor').click();
  assert.equal(f.graph.container.querySelector('.cetzPlacementHint'), null);
  assert.equal(Object.values(f.graph.model.cells).some(cell => /cetzTemplate=/.test(cell.style || '')), false);
  const { sourceAction, sourceActionPatches } = require('../src/source-actions');
  const xml = f.w.mxUtils.getXml(new f.w.mxCodec().encode(f.graph.model));
  const action = sourceAction(readAllCells(xml), readAllCells(f.rendered.xml));
  assert.equal(action.action, 'boolean-xor');
  const patches = sourceActionPatches(source, f.rendered, action, patchesFromEditable(source, f.rendered, xml, readAllCells));
  const next = [...patches].sort((a, b) => b.start - a.start).reduce((text, patch) => text.slice(0, patch.start) + patch.text + text.slice(patch.end), source);
  assert.ok(next.includes('circle((0, 0), radius: 1.5, fill: red)'));
  assert.ok(next.includes('polygon((0.5, 0), 5, radius: 1.5)'));
  assert.ok(next.includes('op: "xor"'));
  assert.doesNotMatch(next, /rect\(/);
  const result = await renderEditable(next, parseCanvas(next).canvas, path.resolve('examples/basic.typ'));
  assert.equal(result.calls.length, 1); assert.equal(result.calls[0].start, patches.selectStart);
});

test('path-operation availability follows closed paths, object type and selection scope', { skip }, async t => {
  const source = '#import "@preview/cetz:0.5.3"\n#cetz.canvas({ import cetz.draw: *\nline((0, 0), (2, 1))\nbezier((2, 1), (4, 0), (3, 2))\ncontent((0, 3), [Title])\n})';
  const f = await fixture(t, source);
  f.graph.setSelectionCells([f.graph.model.getCell('cetz-edit-0'), f.graph.model.getCell('cetz-edit-1')]);
  const panel = f.ui.sidebar.wrapper.querySelector('.cetzOperations');
  const button = action => panel.querySelector('[data-cetz-operation="' + action + '"]');
  assert.equal(button('boolean-union').disabled, true);
  assert.equal(button('make-merge-path').disabled, false);
  assert.equal(button('make-compound-path').disabled, false);
  assert.match(panel.querySelector('.cetzOperationsHint').textContent, /closed paths/);
  f.graph.setSelectionCells([f.graph.model.getCell('cetz-edit-0'), f.graph.model.getCell('cetz-edit-2')]);
  assert.equal(button('make-merge-path').disabled, true);
  assert.equal(button('make-rect-around').disabled, false, 'text can be surrounded by a frame');
  const items = [];
  f.graph.popupMenuHandler.factoryMethod({ addItem(label, icon, callback, parent, iconClass, enabled) { const item = { label, callback, parent, enabled }; items.push(item); return item; }, addSeparator() {} });
  const folder = items.find(item => item.label === 'Path operations');
  assert.ok(folder);
  assert.equal(items.find(item => item.label === 'Frame selection').parent, folder);
  assert.equal(items.find(item => item.label === 'Unite').enabled, false);
});

test('content Text accepts literal text, IME, punctuation and empty values without Typst brackets', { skip }, async t => {
  let source = '#import "@preview/cetz:0.5.3"\n#cetz.canvas({ import cetz.draw: *\ncontent((0, 0), [Hello])\n})';
  const f = await fixture(t, source); f.select('cetz-edit-0');
  f.w.document.body.appendChild(f.ui.sidebar.wrapper);
  const panel = f.ui.sidebar.wrapper.querySelector('.cetzInspector');
  const text = panel.querySelector('[aria-label="Text"]');
  assert.equal(text.value, 'Hello');
  const literal = '日本語 [text] # * $ "quote" \\ path\nsecond line';
  text.focus();
  text.dispatchEvent(new f.w.CompositionEvent('compositionstart', { bubbles: true }));
  text.value = literal; text.dispatchEvent(new f.w.Event('input', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 450));
  assert.equal(inspectorCommands(f).length, 0);
  text.dispatchEvent(new f.w.CompositionEvent('compositionend', { bubbles: true }));
  await waitForInspector(() => inspectorCommands(f).length === 1);
  source = await acceptInspectorCommand(f, source);
  assert.ok(source.includes(JSON.stringify(literal)));
  assert.equal(text.value, literal);
  assert.equal(f.w.document.activeElement, text);
  assert.match(panel.querySelector('.cetzStatus').textContent, /saved automatically/);
  const metadata = JSON.parse(decodeURIComponent(f.graph.getCellStyle(f.graph.model.getCell('cetz-edit-0')).cetzProperties));
  assert.equal(metadata.fields.find(field => field.key === '$1').text, literal);
  text.value = ''; text.dispatchEvent(new f.w.Event('change', { bubbles: true }));
  source = await acceptInspectorCommand(f, source);
  assert.match(source, /content\(\(0, 0\), ""\)/);
  assert.equal(text.value, '');
});

test('content Text keeps an explicit Typst expression mode for rich content', { skip }, async t => {
  let source = '#import "@preview/cetz:0.5.3"\n#cetz.canvas({ import cetz.draw: *\ncontent((0, 0), [Hello])\n})';
  const f = await fixture(t, source); f.select('cetz-edit-0');
  const panel = f.ui.sidebar.wrapper.querySelector('.cetzInspector');
  panel.querySelector('[aria-label="Text expression mode"]').click();
  const expression = panel.querySelector('[aria-label="Text / content"]');
  assert.equal(expression.style.display, '');
  expression.value = '[*Bold* and $x^2$]'; expression.dispatchEvent(new f.w.Event('change', { bubbles: true }));
  source = await acceptInspectorCommand(f, source);
  assert.ok(source.includes('[*Bold* and $x^2$]'));
  assert.equal(expression.value, '[*Bold* and $x^2$]');
});

test('content Text permits the first mouse click and text selection with native Draw.io sidebar guards', { skip }, async t => {
  let source = '#import "@preview/cetz:0.5.3"\n#cetz.canvas({ import cetz.draw: *\ncontent((0, 0), "Text")\n})';
  const f = await fixture(t, source, { nativeSelection: true }); f.select('cetz-edit-0');
  const panel = f.ui.sidebar.wrapper.querySelector('.cetzInspector');
  const text = panel.querySelector('[aria-label="Text"]');
  const mode = panel.querySelector('[aria-label="Text expression mode"]');
  assert.equal(mode.getAttribute('aria-pressed'), 'false');
  for (const type of ['mousedown', 'selectstart']) {
    const event = new f.w.MouseEvent(type, { bubbles: true, cancelable: true });
    text.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false, type + ' must allow native text editing before touching ƒx');
  }
  assert.equal(f.ui.isSelectionAllowed({ target: f.graph.container }), false, 'canvas keeps native selection behavior');
  text.focus(); text.value = 'First edit'; text.dispatchEvent(new f.w.Event('input', { bubbles: true }));
  await waitForInspector(() => inspectorCommands(f).length === 1);
  source = await acceptInspectorCommand(f, source);
  assert.match(source, /content\(\(0, 0\), "First edit"\)/);
  mode.click();
  const expression = panel.querySelector('[aria-label="Text / content"]');
  const event = new f.w.MouseEvent('mousedown', { bubbles: true, cancelable: true }); expression.dispatchEvent(event);
  assert.equal(event.defaultPrevented, false, 'Typst expression textareas also permit mouse editing');
});

test('empty content stays selectable and survives repeated native saves and later text edits', { skip }, async t => {
  for (const value of ['""', '[]']) {
    const source = '#import "@preview/cetz:0.5.3"\n#cetz.canvas({ import cetz.draw: *\ncontent((1, 2), ' + value + ')\n})';
    const f = await fixture(t, source); f.select('cetz-edit-0');
    const cell = f.graph.model.getCell('cetz-edit-0');
    assert.ok(cell);
    for (let i = 0; i < 3; i++) {
      const xml = f.w.mxUtils.getXml(new f.w.mxCodec().encode(f.graph.model));
      assert.deepEqual(patchesFromEditable(source, f.rendered, xml, readAllCells), [], 'idle saves of empty content must leave the source intact');
    }
    assert.ok(cell.geometry.width > 0 && cell.geometry.height > 0, 'empty content retains a usable selection target');
    const text = f.ui.sidebar.wrapper.querySelector('.cetzInspector [aria-label="Text"]');
    assert.equal(text.value, '');
    text.value = 'Restored'; text.dispatchEvent(new f.w.Event('change', { bubbles: true }));
    assert.match(await acceptInspectorCommand(f, source), /content\(\(1, 2\), "Restored"\)/);
  }
});

test('canvas hover tints nearby CeTZ artwork like Outline without selecting or modifying it', { skip }, async t => {
  const f = await fixture(t);
  const highlighted = () => f.graph.view.getOverlayPane().querySelectorAll('[data-cetz-highlight-owner]');
  function hover(id, dx, dy) {
    const state = id && f.graph.view.getState(f.graph.model.getCell(id));
    const x = state ? state.x + dx : dx, y = state ? state.y + dy : dy;
    const event = new f.w.MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y });
    Object.defineProperty(event, 'target', { value: f.graph.container });
    f.graph.fireMouseEvent(f.w.mxEvent.MOUSE_MOVE, new f.w.mxMouseEvent(event, state));
  }
  const before = f.w.mxUtils.getXml(new f.w.mxCodec().encode(f.graph.model));
  hover('cetz-edit-0', 10, 10);
  assert.ok(highlighted().length);
  assert.equal(highlighted()[0].getAttribute('data-cetz-highlight-owner'), 'cetz-edit-0');
  const first = highlighted()[0];
  hover('cetz-edit-0', 12, 12);
  assert.equal(highlighted()[0], first, 'hovering the same object reuses its overlay');
  hover('cetz-edit-2', 10, 10);
  assert.equal(highlighted()[0].getAttribute('data-cetz-highlight-owner'), 'cetz-edit-2');
  assert.equal(f.graph.getSelectionCells().length, 0);
  assert.equal(f.w.mxUtils.getXml(new f.w.mxCodec().encode(f.graph.model)), before);
  f.select('cetz-edit-2');
  hover('cetz-point-2-0', 7, 7);
  assert.equal(highlighted()[0].getAttribute('data-cetz-highlight-owner'), 'cetz-edit-2');
  hover(null, -1000, -1000);
  assert.equal(highlighted().length, 0);
  for (const scale of [1, 2, 0.5]) {
    f.graph.view.setScale(scale);
    const state = f.graph.view.getState(f.graph.model.getCell('cetz-edit-0'));
    hover(null, state.x - 4, state.y + state.height / 2);
    assert.equal(highlighted()[0].getAttribute('data-cetz-highlight-owner'), 'cetz-edit-0', 'nearby hover works at scale ' + scale);
    f.graph.container.dispatchEvent(new f.w.MouseEvent('mouseleave'));
    assert.equal(highlighted().length, 0);
  }
  hover('cetz-edit-0', 10, 10);
  f.graph.view.setScale(1.5);
  assert.equal(highlighted().length, 0, 'zoom removes stale overlays');
  hover('cetz-edit-0', 10, 10);
  const down = new f.w.MouseEvent('mousedown', { button: 0 });
  Object.defineProperty(down, 'target', { value: f.graph.container });
  f.graph.fireMouseEvent(f.w.mxEvent.MOUSE_DOWN, new f.w.mxMouseEvent(down));
  assert.equal(highlighted().length, 0, 'dragging starts without a stationary hover overlay');
});

test('Outline height resizes independently of the source and survives selection redraws', { skip }, async t => {
  const f = await fixture(t);
  f.w.document.body.appendChild(f.ui.sidebar.wrapper);
  const outline = f.ui.sidebar.wrapper.querySelector('.cetzOutline');
  Object.defineProperty(outline, 'offsetHeight', { get() { return Number.parseInt(outline.style.height) || 320; } });
  const handle = outline.querySelector('[role="separator"]');
  assert.equal(handle.getAttribute('aria-label'), 'Resize Outline');
  const before = f.w.mxUtils.getXml(new f.w.mxCodec().encode(f.graph.model));
  function drag(from, to, finish = true) {
    handle.dispatchEvent(new f.w.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientY: from }));
    f.w.document.dispatchEvent(new f.w.MouseEvent('mousemove', { bubbles: true, cancelable: true, clientY: to }));
    if (finish) f.w.document.dispatchEvent(new f.w.MouseEvent('mouseup', { bubbles: true, clientY: to }));
  }
  drag(320, 420);
  assert.equal(outline.style.height, '420px');
  assert.equal(handle.getAttribute('aria-valuenow'), '420');
  assert.equal(f.w.localStorage.getItem('gui-cetz.outlineHeight'), '420');
  assert.equal(f.w.document.documentElement.style.cursor, '');
  assert.equal(f.w.mxUtils.getXml(new f.w.mxCodec().encode(f.graph.model)), before);
  const list = outline.querySelector('.cetzOutlineList'); list.scrollTop = 50;
  f.select('cetz-edit-2');
  assert.equal(outline.style.height, '420px');
  assert.equal(outline.querySelector('.cetzOutlineResize'), handle);
  assert.equal(outline.querySelector('.cetzOutlineList').scrollTop, 50);
  handle.dispatchEvent(new f.w.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
  assert.equal(outline.style.height, '404px');
  drag(404, 454, false);
  f.w.document.dispatchEvent(new f.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(outline.style.height, '404px', 'Escape cancels a resize');
  drag(404, -1000); assert.equal(outline.style.height, '140px');
  drag(140, 5000); assert.equal(outline.style.height, '608px');
  handle.dispatchEvent(new f.w.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
  assert.equal(outline.style.height, '');
  assert.equal(outline.getAttribute('data-resized'), 'false');
  assert.equal(f.w.localStorage.getItem('gui-cetz.outlineHeight'), null);
});

test('arrow keys move selected shapes by one zoom-dependent grid step and Shift moves five', { skip }, async t => {
  const source = '#import "@preview/cetz:0.5.3"\n#cetz.canvas({ import cetz.draw: *\nrect((0, 0), (2, 1))\ncircle((3.13, 1.17), radius: 0.5)\n})';
  for (const scale of [1, 2, 4]) {
    const f = await fixture(t, source); f.graph.view.setScale(scale);
    f.graph.setSelectionCells(['cetz-edit-0', 'cetz-edit-1'].map(id => f.graph.model.getCell(id)));
    function press(key, shiftKey = false, target = f.graph.container) {
      const event = new f.w.KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
      target.dispatchEvent(event); return event;
    }
    const step = 0.25 / scale;
    for (let i = 0; i < 3; i++) assert.equal(press('ArrowRight').defaultPrevented, true);
    press('ArrowUp', true);
    const xml = f.w.mxUtils.getXml(new f.w.mxCodec().encode(f.graph.model));
    const patches = patchesFromEditable(source, f.rendered, xml, readAllCells);
    const next = patches.sort((a, b) => b.start - a.start).reduce((text, patch) => text.slice(0, patch.start) + patch.text + text.slice(patch.end), source);
    const rendered = await renderEditable(next, parseCanvas(next).canvas, path.resolve('examples/native.typ'));
    const model = index => JSON.parse(decodeURIComponent(readAllCells(rendered.xml).get('cetz-edit-' + index).cell.style.match(/cetzProperties=([^;]+);/)[1]));
    assert.deepEqual(model(0).fields.find(field => field.key === '$0').point, [3 * step, 5 * step]);
    assert.deepEqual(model(1).fields.find(field => field.key === '$0').point, [Number((3.13 + 3 * step).toFixed(8)), Number((1.17 + 5 * step).toFixed(8))]);
    assert.match(next, /radius: 0\.5/);
    press('ArrowLeft'); press('ArrowDown', true);
    assert.equal(Number(f.graph.getCellStyle(f.graph.model.getCell('cetz-edit-0')).cetzMoveX), 2 * step);
    assert.equal(Number(f.graph.getCellStyle(f.graph.model.getCell('cetz-edit-0')).cetzMoveY), 0);
    f.select('cetz-edit-0');
    const input = f.ui.sidebar.wrapper.querySelector('.cetzInspector input');
    const before = f.graph.model.getCell('cetz-edit-0').geometry.clone();
    assert.equal(press('ArrowRight', false, input).defaultPrevented, false);
    const handle = f.ui.sidebar.wrapper.querySelector('.cetzOutlineResize');
    press('ArrowDown', false, handle);
    assert.equal(f.graph.model.getCell('cetz-edit-0').geometry.x, before.x);
    assert.equal(f.graph.model.getCell('cetz-edit-0').geometry.y, before.y);
  }
});

test('continuous arrow input survives intermediate source renders without rewinding newer moves', { skip }, async t => {
  let source = '#import "@preview/cetz:0.5.3"\n#cetz.canvas({ import cetz.draw: *\nrect((0, 0), (2, 1))\n})';
  const f = await fixture(t, source); f.select('cetz-edit-0');
  const key = (name, shiftKey = false) => f.graph.container.dispatchEvent(new f.w.KeyboardEvent('keydown', { key: name, shiftKey, bubbles: true, cancelable: true }));
  const xml = () => f.w.mxUtils.getXml(new f.w.mxCodec().encode(f.graph.model));
  async function renderSnapshot(snapshot) {
    const patches = patchesFromEditable(source, f.rendered, snapshot, readAllCells);
    const next = patches.sort((a, b) => b.start - a.start).reduce((text, patch) => text.slice(0, patch.start) + patch.text + text.slice(patch.end), source);
    return { source: next, rendered: await renderEditable(next, parseCanvas(next).canvas, path.resolve('examples/native.typ')) };
  }
  function merge(result) {
    const document = f.w.mxUtils.parseXml(result.rendered.xml), incoming = new f.w.mxGraphModel();
    new f.w.mxCodec(document).decode(document.getElementsByTagName('mxGraphModel')[0], incoming);
    f.graph.model.beginUpdate();
    try {
      for (const [id, cell] of Object.entries(incoming.cells)) {
        const current = f.graph.model.getCell(id); if (!current || !cell.geometry) continue;
        f.graph.model.setStyle(current, cell.style);
        f.graph.model.setGeometry(current, cell.geometry.clone());
      }
    } finally { f.graph.model.endUpdate(); }
    source = result.source; f.rendered = result.rendered;
  }
  key('ArrowRight');
  const first = await renderSnapshot(xml());
  key('ArrowRight'); key('ArrowRight');
  let desired = f.graph.model.getCell('cetz-edit-0').geometry.clone();
  merge(first);
  assert.ok(Math.abs(f.graph.model.getCell('cetz-edit-0').geometry.x - desired.x) < 0.00002, 'an earlier .25 render must preserve the newer .75 position');
  key('ArrowRight');
  const second = await renderSnapshot(xml());
  key('ArrowUp', true); key('ArrowRight');
  desired = f.graph.model.getCell('cetz-edit-0').geometry.clone();
  merge(second);
  assert.ok(Math.abs(f.graph.model.getCell('cetz-edit-0').geometry.x - desired.x) < 0.00002);
  assert.ok(Math.abs(f.graph.model.getCell('cetz-edit-0').geometry.y - desired.y) < 0.00002);
  const final = await renderSnapshot(xml()); merge(final);
  assert.match(source, /rect\(\(1\.25, 1\.25\),\s*\(3\.25, 2\.25\)\)/);
  assert.deepEqual(patchesFromEditable(source, f.rendered, xml(), readAllCells), []);
  key('ArrowLeft');
  const last = await renderSnapshot(xml()); merge(last);
  assert.match(source, /rect\(\(1, 1\.25\),\s*\(3, 2\.25\)\)/);
  key('ArrowRight');
  const reversed = await renderSnapshot(xml());
  key('ArrowLeft');
  merge(reversed);
  assert.equal(Number(f.graph.getCellStyle(f.graph.model.getCell('cetz-edit-0')).cetzMoveX), 1, 'returning to the previous source position is still a pending move');
  const settled = await renderSnapshot(xml()); merge(settled);
  assert.match(source, /rect\(\(1, 1\.25\),\s*\(3, 2\.25\)\)/);
  key('ArrowRight');
  const beforeUndo = await renderSnapshot(xml());
  key('ArrowRight');
  f.graph.container.dispatchEvent(new f.w.KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true }));
  merge(beforeUndo);
  assert.equal(f.graph.getCellStyle(f.graph.model.getCell('cetz-edit-0')).cetzMoveX, undefined, 'Undo cancels unacknowledged keyboard movement');
});

test('3D native selection exposes planes and projection Properties and blocks selection of plane geometry', { skip }, async t => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *\northo({on-xy({line((0,0), (1,2))})})\n})';
  const f = await fixture(t, source);
  const panel = f.ui.sidebar.wrapper;
  f.select('cetz-edit-0');
  assert.match(panel.querySelector('.cetz3DHint').textContent, /3D/);
  assert.equal(panel.querySelector('.cetz3DHint').style.display, '');
  assert.equal(f.graph.getSelectionCount(),0,'geometry cannot be selected');
  assert.equal(panel.querySelector('[aria-label="End Z"]'),null);
  const cell = f.graph.model.getCell('cetz-edit-0');
  assert.equal(f.graph.isCellMovable(cell), false);
  assert.equal(f.graph.isCellResizable(cell), false);
  assert.equal(f.graph.isCellDeletable(cell), false,'3D deletion targets planes rather than their individual geometry');
  assert.equal(f.graph.isCellRotatable(cell), false);
  f.select('cetz-edit-1');
  assert.equal(f.graph.getSelectionCell().id,'cetz-edit-1','the plane can be selected');
  assert.equal(f.graph.isCellDeletable(f.graph.getSelectionCell()),true);
  f.select('cetz-edit-2');assert.equal(f.graph.getSelectionCell().id,'cetz-edit-2','projection controls can be selected for Properties');assert.ok(panel.querySelector('[aria-label="sorted"]'));
  const plane=f.rendered.workspace.planes[0],p=require('../src/three-workspace').project(plane.matrix,[-2,-2,0]);
  f.send(f.graph.container,'down',p[0],p[1]);f.send(f.w.document,'up',p[0],p[1]);
  assert.equal(f.graph.getSelectionCell().id,'cetz-edit-1','empty plane background can be selected away from any artwork');
  assert.equal(panel.querySelectorAll('.cetzOutlineRow').length,2,'projection and plane are separate Outline entries');
  assert.equal(panel.querySelector('.cetzOutlineGrip').draggable, false);
  const encoded = new f.w.mxCodec().encode(f.graph.model);
  const xml = f.w.mxUtils.getXml(encoded);
  assert.deepEqual(patchesFromEditable(source, f.rendered, xml, readAllCells), []);
});

test('all native palette icons place shapes on the selected 3D plane after zoom and pan', {skip}, async t => {
  const source='#import "@preview/cetz:0.5.2"\n#cetz.canvas({import cetz.draw: *\northo({line((0,0,0),(1,2,3))})\n})';
  const f=await fixture(t,source), panel=f.ui.sidebar.wrapper;
  const workspace=f.rendered.workspace.views[0], {project,planePoint}=require('../src/three-workspace');
  const fixtures=require('./placement-fixtures');
  f.graph.view.setScale(2); f.graph.view.setTranslate(17,-9);
  const plane=panel.querySelector('[aria-label="Base plane"]'), depth=panel.querySelector('[aria-label="Plane offset"]');
  const entries=f.paletteEntries['cetz-preview-primitives'].concat(f.paletteEntries['cetz-advanced']);
  for(const name of Object.keys(fixtures)) for(const current of ['xy','xz','zy']) {
    plane.value=current; depth.value='1.5'; plane.dispatchEvent(new f.w.Event('change'));
    const icon=entries.find(entry=>entry.getAttribute('aria-label')===name);
    assert.ok(icon,name); icon.click();
    assert.ok(f.graph.container.querySelector('.cetzPlacementHint'),name+'/'+current);
    for(const p of fixtures[name]){
      const q=project(workspace.matrix,planePoint(current,1.5,...p));
      f.graph.container.dispatchEvent(new f.w.MouseEvent('click',{bubbles:true,cancelable:true,
        clientX:(q[0]+17)*2,clientY:(q[1]-9)*2,button:0}));
    }
    if(['hobby','catmull'].includes(name)) f.graph.container.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
    const marker=Object.values(f.graph.model.cells).find(cell=>/cetzPlacement3D=/.test(cell.style||''));
    assert.ok(marker,name+'/'+current);
    const payload=JSON.parse(decodeURIComponent(f.graph.getCellStyle(marker).cetzPlacement3D));
    assert.deepEqual(payload.points,fixtures[name],name+'/'+current);
    assert.equal(payload.plane,current); assert.equal(payload.offset,1.5);
    const xml=f.w.mxUtils.getXml(new f.w.mxCodec().encode(f.graph.model));
    const patches=patchesFromEditable(source,f.rendered,xml,readAllCells);
    assert.equal(patches.length,1); assert.match(patches[0].text,/cetz.draw.on-/);
    f.graph.model.remove(marker);
  }
  assert.ok(f.graph.view.getBackgroundPane().querySelector('[data-cetz-3d-workplane="true"]'));
});

test('unsupported perspective scenes retain live source rendering and the final drag while rendering', {skip}, async t => {
  let source='#import "@preview/cetz:0.5.3"\n#cetz.canvas({import cetz.draw: *\nperspective(x:20deg,y:30deg,z:5deg,{line((0,0,0),(1,2,3))\ncircle((4,4,2),radius:1)})\n})';
  const f=await fixture(t,source);
  const event=(target,type,x,y)=>target.dispatchEvent(new f.w.MouseEvent(type,{bubbles:true,cancelable:true,button:0,buttons:type==='mouseup'?0:1,clientX:x,clientY:y}));
  event(f.graph.container,'mousedown',100,100); event(f.w.document,'mousemove',120,110);
  await waitForInspector(()=>inspectorCommands(f).length===1);
  const first=JSON.parse(decodeURIComponent(f.graph.getCellStyle(inspectorCommands(f)[0]).cetzValue));
  assert.equal(first.values.x,'25deg'); assert.equal(first.values.y,'20deg'); assert.ok(first.historyGroup);
  event(f.w.document,'mousemove',180,160); event(f.w.document,'mouseup',180,160);
  assert.equal(inspectorCommands(f).length,1);
  source=await acceptInspectorCommand(f,source);
  await waitForInspector(()=>inspectorCommands(f).length===1);
  const last=JSON.parse(decodeURIComponent(f.graph.getCellStyle(inspectorCommands(f)[0]).cetzValue));
  assert.equal(last.values.x,'50deg'); assert.equal(last.values.y,'-10deg'); assert.equal(last.values.z,undefined,'unchanged roll is preserved in source');
  assert.equal(last.historyGroup,first.historyGroup);
  source=await acceptInspectorCommand(f,source);
  assert.match(source,/perspective\(x:50deg,y:-10deg,z:5deg/);
  const before=f.graph.view.translate.clone();
  const pan=[...f.ui.sidebar.wrapper.querySelectorAll('.cetz3DWorkspace button')].find(button=>button.textContent==='Pan');pan.click();
  event(f.graph.container,'mousedown',10,10);event(f.w.document,'mousemove',60,40);event(f.w.document,'mouseup',60,40);
  assert.equal(f.graph.view.translate.x,before.x+50); assert.equal(f.graph.view.translate.y,before.y+30);
  assert.equal(inspectorCommands(f).length,0,'pan never changes source coordinates');
});

test('3D pointer rotation previews locally without model writes and compiles once on release even with throttled animation frames', {skip}, async t => {
  const source='#import "@preview/cetz:0.5.2"\n#cetz.canvas({import cetz.draw: *\northo(x:20deg,y:30deg,z:5deg,{on-xy({rect((0,0),(2,1))})})\n})';
  const f=await fixture(t,source,{pointerEvents:true}),g=f.graph;
  const state={source,mode:'3d',key:f.rendered.workspace.planes[0].key,scene:{},liveMerge:true};
  await loadWorkspaceScene(f,state,f.rendered);
  g.view.setScale(1.5);g.view.setTranslate(17,-9);
  f.w.requestAnimationFrame=()=>123;f.w.cancelAnimationFrame=()=>{};
  const send=(target,type,x,y)=>target.dispatchEvent(new f.w.PointerEvent(type,{bubbles:true,cancelable:true,button:0,buttons:type==='pointerup'?0:1,pointerId:7,clientX:x,clientY:y}));
  const image=()=>g.view.getState(g.model.getCell('cetz-preview-image')).shape.node.querySelector('image').getAttributeNS('http://www.w3.org/1999/xlink','href');
  const before=image(),xml=f.w.mxUtils.getXml(new f.w.mxCodec().encode(g.model));
  let changes=0;g.model.addListener('change',()=>changes++);
  send(g.container,'pointerdown',100,100);send(f.w.document,'pointermove',120,110);
  const preview=()=>g.view.getOverlayPane().querySelector('[data-cetz-orbit-preview]');
  await waitForInspector(()=>!!preview());
  assert.equal(preview().getAttribute('data-cetz-orbit-angles'),'25,20,5');
  const artwork=preview().querySelector('[data-cetz-live-preview]'),firstTransform=artwork.getAttribute('transform');
  assert.ok(artwork.querySelector('path'),'reuse actual plane artwork');
  assert.equal(g.view.getState(g.model.getCell('cetz-preview-image')).shape.node.style.visibility,'hidden');
  send(f.w.document,'pointermove',80,110);
  await waitForInspector(()=>preview().getAttribute('data-cetz-orbit-angles')==='25,40,5');
  send(f.w.document,'pointermove',80,80);
  await waitForInspector(()=>preview().getAttribute('data-cetz-orbit-angles')==='10,40,5');
  send(f.w.document,'pointermove',160,140);
  await waitForInspector(()=>preview().getAttribute('data-cetz-orbit-angles')==='40,0,5');
  assert.equal(preview().querySelector('[data-cetz-live-preview]'),artwork,'pointer moves reuse the same SVG paths');
  assert.notEqual(artwork.getAttribute('transform'),firstTransform);
  await new Promise(resolve=>setTimeout(resolve,350));
  assert.equal(inspectorCommands(f).length,0,'no Typst compile requests during local rotation');
  assert.equal(changes,0,'no Draw.io model, source or inspector redraw per frame');
  assert.equal(f.w.mxUtils.getXml(new f.w.mxCodec().encode(g.model)),xml);
  const expected=await renderEditable(source.replace('x:20deg,y:30deg','x:40deg,y:0deg'),parseCanvas(source.replace('x:20deg,y:30deg','x:40deg,y:0deg')).canvas,path.resolve('examples/native.typ'));
  const {project}=require('../src/three-workspace'),oldPoint=project(f.rendered.workspace.planes[0].matrix,[1,1,0]),newPoint=project(expected.workspace.planes[0].matrix,[1,1,0]);
  const transform=artwork.getAttribute('transform').slice(7,-1).split(' ').map(Number),x=(oldPoint[0]+17)*1.5,y=(oldPoint[1]-9)*1.5;
  assert.ok(Math.hypot(transform[0]*x+transform[2]*y+transform[4]-(newPoint[0]+17)*1.5,transform[1]*x+transform[3]*y+transform[5]-(newPoint[1]-9)*1.5)<0.002,'local plane projection agrees with a fresh CeTZ render');
  send(f.w.document,'pointerup',180,160);
  assert.equal(inspectorCommands(f).length,1);
  const final=JSON.parse(decodeURIComponent(g.getCellStyle(inspectorCommands(f)[0]).cetzValue));
  assert.equal(final.values.x,'50deg');assert.equal(final.values.y,'-10deg');assert.ok(final.historyGroup);
  await acceptWorkspaceUI(f,state);
  assert.match(state.source,/ortho\(x:50deg,y:-10deg,z:5deg/);
  assert.equal(preview(),null);assert.notEqual(image(),before);
  assert.notEqual(g.view.getState(g.model.getCell('cetz-preview-image')).shape.node.style.visibility,'hidden');
});

test('local orbit moves raw XYZ lines and labels alongside planes and commits the latest frame on blur',{skip},async t=>{
  const source='#import "@preview/cetz:0.5.2"\n#cetz.canvas({import cetz.draw: *\northo(x:20deg,y:30deg,z:5deg,{on-xy({rect((0,0),(2,1))})\nline((0,0,0),(3,2,2),stroke:1.5pt+red)\ncontent((3,2,2),[XYZ])})\n})';
  const f=await fixture(t,source),g=f.graph,state={source,mode:'3d',key:f.rendered.workspace.planes[0].key,scene:{},liveMerge:true};
  await loadWorkspaceScene(f,state,f.rendered);
  f.send(g.container,'down',100,100);f.send(f.w.document,'move',140,120);
  const preview=()=>g.view.getOverlayPane().querySelector('[data-cetz-orbit-preview]');
  await waitForInspector(()=>!!preview());
  const line=preview().querySelector('[data-cetz-orbit-kind="line"] [data-cetz-live-preview]'),label=preview().querySelector('[data-cetz-orbit-kind="point"] [data-cetz-live-preview]');
  assert.ok(line&&label);assert.ok(label.querySelector('use'),'keep Typst glyph definitions in the preview');
  const target=source.replace('x:20deg,y:30deg','x:30deg,y:10deg'),rendered=await renderEditable(target,parseCanvas(target).canvas,path.resolve('examples/native.typ')),{project}=require('../src/three-workspace');
  for(const shape of [line,label]){
    const m=shape.getAttribute('transform').slice(7,-1).split(' ').map(Number);
    const old=project(f.rendered.workspace.views[0].matrix,[3,2,2]),next=project(rendered.workspace.views[0].matrix,[3,2,2]);
    assert.ok(Math.hypot(m[0]*old[0]+m[2]*old[1]+m[4]-next[0],m[1]*old[0]+m[3]*old[1]+m[5]-next[1])<0.002);
  }
  assert.equal(inspectorCommands(f).length,0);
  f.w.dispatchEvent(new f.w.Event('blur'));assert.equal(inspectorCommands(f).length,1);
  f.send(f.w.document,'up',200,200);assert.equal(inspectorCommands(f).length,1,'release after blur cannot commit again');
  await acceptWorkspaceUI(f,state);assert.equal(preview(),null);assert.match(state.source,/ortho\(x:30deg,y:10deg,z:5deg/);
  assert.ok(state.source.includes('line((0,0,0),(3,2,2),stroke:1.5pt+red)'));
});

for(const version of ['0.4.2','0.5.2']) test(`local orbit matches CeTZ ${version} for tilted XY/XZ/ZY planes and a translated camera`,{skip},async t=>{
  const {planeCode}=require('../src/plane-editor'),{project}=require('../src/three-workspace');
  const header=`#import "@preview/cetz:${version}"\n`;
  const poses=[{kind:'xy',position:[2,3,4],angles:[15,-25,35]},{kind:'xz',position:[-1,2,0],angles:[5,15,20]},{kind:'zy',position:[2,-2,1],angles:[-10,20,15]}];
  const source=header+'#cetz.canvas({cetz.draw.ortho(x:20deg,y:30deg,z:5deg,{\n// GUI-CeTZ camera-position: [3,4,5]\ncetz.draw.translate(x:-3,y:-4,z:-5)\n'+poses.map((pose,i)=>planeCode(header,'gui-plane-'+(i+1),pose,'cetz.draw.rect((0,0),(2,1),fill:blue)')).join('\n')+'})})';
  const f=await fixture(t,source),g=f.graph;
  g.view.setScale(1.25);g.view.setTranslate(-9,11);
  f.send(g.container,'down',100,100);f.send(f.w.document,'move',140,120);
  const preview=()=>g.view.getOverlayPane().querySelector('[data-cetz-orbit-preview]');
  await waitForInspector(()=>!!preview());
  assert.equal(inspectorCommands(f).length,0);
  const target=source.replace('x:20deg,y:30deg','x:30deg,y:10deg'),rendered=await renderEditable(target,parseCanvas(target).canvas,path.resolve('examples/native.typ'));
  const localAxes=g.view.getOverlayPane().querySelector('[data-cetz-plane-axes]'),localOrigin=localAxes.querySelector('[data-cetz-plane-origin]'),expectedOrigin=project(rendered.workspace.planes.find(plane=>plane.key===localAxes.getAttribute('data-cetz-plane-axes')).matrix,[0,0,0]);
  assert.ok(Math.hypot(+localOrigin.getAttribute('cx')-expectedOrigin[0],+localOrigin.getAttribute('cy')-expectedOrigin[1])<.003,'local origin follows the orbit camera');
  for(const plane of f.rendered.workspace.planes){
    const shape=preview().querySelector('[data-cetz-orbit-plane="'+plane.key+'"] [data-cetz-live-preview]');
    assert.ok(shape,plane.key);
    const m=shape.getAttribute('transform').slice(7,-1).split(' ').map(Number);
    const old=project(plane.matrix,[0.4,0.8,0]),next=project(rendered.workspace.planes.find(p=>p.key===plane.key).matrix,[0.4,0.8,0]);
    const x=(old[0]-9)*1.25,y=(old[1]+11)*1.25;
    assert.ok(Math.hypot(m[0]*x+m[2]*y+m[4]-(next[0]-9)*1.25,m[1]*x+m[3]*y+m[5]-(next[1]+11)*1.25)<0.003,plane.kind+' matches calibrated projection');
  }
  // Returning to the starting camera needs no compilation and restores the exact image.
  f.send(f.w.document,'move',100,100);f.send(f.w.document,'up',100,100);
  assert.equal(inspectorCommands(f).length,0);assert.equal(preview(),null);
  assert.notEqual(g.view.getState(g.model.getCell('cetz-preview-image')).shape.node.style.visibility,'hidden');
});

for(const distance of ['auto','8','0.1']) test(`perspective orbit reuses projective textures and matches CeTZ with distance ${distance}`,{skip},async t=>{
  const {planeCode}=require('../src/plane-editor'),{project}=require('../src/three-workspace');
  const header='#import "@preview/cetz:0.5.3"\n';
  const poses=[{kind:'xy',position:[1,1,0],angles:[15,-10,20]},{kind:'xz',position:[-1,2,1],angles:[5,10,-10]},{kind:'zy',position:[2,-1,0],angles:[-10,20,5]}];
  const source=header+'#cetz.canvas({import cetz.draw: *\nperspective(x:20deg,y:30deg,z:5deg,distance:'+distance+',{\n// GUI-CeTZ camera-position: [0.5,-0.2,0.3]\ncetz.draw.translate(x:-0.5,y:0.2,z:-0.3)\n'+poses.map((pose,i)=>planeCode(header,'gui-plane-'+(i+1),pose,'cetz.draw.rect((0,0),(2,1),fill:blue)')).join('\n')+'\nline((0,0,0),(3,2,2),stroke:red)\ncontent((3,2,2),[XYZ])\n})})';
  const f=await fixture(t,source),g=f.graph,state={source,mode:'3d',key:'gui-plane-1',scene:{},liveMerge:true};
  await loadWorkspaceScene(f,state,f.rendered);g.view.setScale(1.4);g.view.setTranslate(12,-7);
  const before=f.w.mxUtils.getXml(new f.w.mxCodec().encode(g.model));let changes=0;g.model.addListener('change',()=>changes++);
  f.send(g.container,'down',100,100);f.send(f.w.document,'move',140,120);
  const preview=()=>g.view.getOverlayPane().querySelector('[data-cetz-orbit-preview]');
  await waitForInspector(()=>!!preview());
  assert.equal(preview().getAttribute('data-cetz-orbit-projection'),'perspective');
  assert.equal(preview().getAttribute('data-cetz-orbit-adaptive-lens'),'true');
  assert.equal(preview().querySelectorAll('foreignObject [data-cetz-perspective-warp]').length,3);
  assert.equal(inspectorCommands(f).length,0);assert.equal(changes,0);
  assert.equal(f.w.mxUtils.getXml(new f.w.mxCodec().encode(g.model)),before);
  const target=source.replace('x:20deg,y:30deg,z:5deg','x:30deg,y:10deg,z:5deg'),rendered=await renderEditable(target,parseCanvas(target).canvas,path.resolve('examples/native.typ'));
  const localAxes=g.view.getOverlayPane().querySelector('[data-cetz-plane-axes]'),localOrigin=localAxes.querySelector('[data-cetz-plane-origin]'),expectedOrigin=project(rendered.workspace.planes.find(plane=>plane.key===localAxes.getAttribute('data-cetz-plane-axes')).matrix,[0,0,0]);
  assert.ok(Math.hypot(+localOrigin.getAttribute('cx')-expectedOrigin[0],+localOrigin.getAttribute('cy')-expectedOrigin[1])<.03,'local origin follows the perspective camera and adaptive lens');
  for(const plane of f.rendered.workspace.planes){
    const warp=preview().querySelector('[data-cetz-orbit-plane="'+plane.key+'"] [data-cetz-perspective-warp]'),m=warp.style.transform.slice(9,-1).split(',').map(Number);
    const old=project(plane.matrix,[0.4,0.6,0]),next=project(rendered.workspace.planes.find(p=>p.key===plane.key).matrix,[0.4,0.6,0]);
    const x=(old[0]+12)*1.4,y=(old[1]-7)*1.4,w=m[3]*x+m[7]*y+m[15];
    assert.ok(m.every(Number.isFinite));
    assert.ok(Math.hypot((m[0]*x+m[4]*y+m[12])/w-(next[0]+12)*1.4,(m[1]*x+m[5]*y+m[13])/w-(next[1]-7)*1.4)<0.03,plane.kind+' perspective divide agrees with freshly compiled CeTZ');
  }
  const first=preview().querySelector('[data-cetz-perspective-warp]'),transform=first.style.transform;
  f.send(f.w.document,'move',160,140);
  await waitForInspector(()=>preview().getAttribute('data-cetz-orbit-angles')==='40,0,5');
  assert.equal(preview().querySelector('[data-cetz-perspective-warp]'),first);assert.notEqual(first.style.transform,transform);
  await new Promise(resolve=>setTimeout(resolve,350));assert.equal(inspectorCommands(f).length,0);assert.equal(changes,0);
  f.send(f.w.document,'up',180,160);assert.equal(inspectorCommands(f).length,1);
  await acceptWorkspaceUI(f,state);assert.equal(preview(),null);assert.match(state.source,/perspective\(x:50deg,y:-10deg,z:5deg,distance:/);
  assert.ok(state.source.includes('distance:'+distance));
  assert.notEqual(g.view.getState(g.model.getCell('cetz-preview-image')).shape.node.style.visibility,'hidden');
});

test('perspective orbit safely resumes exact rendering when fixed calibrated depth crosses the camera',{skip},async t=>{
  const source='#import "@preview/cetz:0.5.3"\n#cetz.canvas({import cetz.draw: *\nperspective(x:20deg,y:-60deg,z:5deg,distance:8,{on-xy({circle((20,0),radius:0.5)})})\n})';
  const f=await fixture(t,source),g=f.graph,state={source,mode:'3d',key:f.rendered.workspace.planes[0].key,scene:{},liveMerge:true};
  await loadWorkspaceScene(f,state,f.rendered);
  f.send(g.container,'down',100,100);f.send(f.w.document,'move',120,100);
  const preview=()=>g.view.getOverlayPane().querySelector('[data-cetz-orbit-preview]');await waitForInspector(()=>!!preview());
  assert.equal(preview().getAttribute('data-cetz-orbit-adaptive-lens'),'false');
  f.send(f.w.document,'move',520,100);
  await waitForInspector(()=>!preview());
  assert.notEqual(g.view.getState(g.model.getCell('cetz-preview-image')).shape.node.style.visibility,'hidden');
  await waitForInspector(()=>inspectorCommands(f).length===1);
  const values=JSON.parse(decodeURIComponent(g.getCellStyle(inspectorCommands(f)[0]).cetzValue)).values;assert.equal(values.y,'-270deg');
  await acceptWorkspaceUI(f,state);f.send(f.w.document,'up',520,100);assert.match(state.source,/perspective\(x:20deg,y:-270deg,z:5deg,distance:8/);
  assert.ok(g.view.getOverlayPane().querySelectorAll('[style*="NaN"]').length===0);
});

test('older CeTZ perspective follows its measured affine output during local orbit',{skip},async t=>{
  const source='#import "@preview/cetz:0.5.2"\n#cetz.canvas({import cetz.draw: *\nperspective(x:20deg,y:30deg,z:5deg,{on-xy({rect((0,0),(2,1))})})\n})';
  const f=await fixture(t,source);f.send(f.graph.container,'down',100,100);f.send(f.w.document,'move',140,120);
  const preview=()=>f.graph.view.getOverlayPane().querySelector('[data-cetz-orbit-preview]');await waitForInspector(()=>!!preview());
  assert.equal(preview().getAttribute('data-cetz-orbit-projection'),'ortho');assert.equal(inspectorCommands(f).length,0);
  f.send(f.w.document,'up',140,120);assert.equal(inspectorCommands(f).length,1);
});

test('3D background guides cannot be selected and clicks select planes while drags orbit', {skip}, async t => {
  const source='#import "@preview/cetz:0.5.2"\n#cetz.canvas({import cetz.draw: *\northo({on-xy({rect((0,0),(1,1))})\non-xz({rect((3,0),(4,1))})})\n})';
  const f=await fixture(t,source),g=f.graph;
  const guides=g.view.getBackgroundPane().querySelector('[data-cetz-3d-guides]');
  assert.equal(guides.getAttribute('pointer-events'),'none');
  assert.equal(guides.querySelectorAll('[data-cetz-3d-grid]').length,2);
  assert.equal(guides.querySelectorAll('[data-cetz-3d-axis]').length,3);
  assert.equal(Object.keys(g.model.cells).filter(id=>/^cetz-(grid3d|axis-3d)-/.test(id)).length,0);
  assert.equal(g.isCellSelectable({id:'cetz-grid3d-0-0',style:''}),false,'legacy guides also remain unselectable');
  const rubberband=new f.w.mxRubberband(g);t.after(()=>rubberband.destroy());
  function pointer(target,type,x,y,shiftKey=false){target.dispatchEvent(new f.w.MouseEvent(type,{bubbles:true,cancelable:true,button:0,buttons:type==='mouseup'?0:1,clientX:x,clientY:y,shiftKey}));}
  function click(id,shiftKey){
    const s=g.view.getState(g.model.getCell(id)),x=s.x+s.width/2,y=s.y+s.height/2;
    pointer(g.container,'mousedown',x,y,shiftKey);pointer(f.w.document,'mouseup',x+1,y+1,shiftKey);
  }
  click('cetz-edit-0');assert.equal(g.getSelectionCell().id,'cetz-edit-1');
  click('cetz-edit-2',true);assert.deepEqual(Array.from(g.getSelectionCells(),c=>c.id),['cetz-edit-3']);
  assert.equal(f.ui.sidebar.wrapper.querySelector('[aria-label="Selected plane"]').value,f.rendered.workspace.planes[1].key);
  assert.equal(g.view.getBackgroundPane().querySelectorAll('[data-cetz-plane-surface]').length,2);
  assert.equal(g.isCellSelectable(g.model.getCell('cetz-edit-0')),false);
  assert.equal(inspectorCommands(f).length,0,'clicks and small pointer jitter never update the camera');
  const s=g.view.getState(g.model.getCell('cetz-edit-0')),before=g.model.getCell('cetz-edit-0').geometry.clone();
  pointer(s.shape.node,'mousedown',s.x+10,s.y+10);
  pointer(f.w.document,'mousemove',s.x+60,s.y+30,true);
  pointer(f.w.document,'mouseup',s.x+60,s.y+30,true);
  assert.equal(inspectorCommands(f).length,1,'dragging over an object or with Shift still orbits');
  assert.equal(g.getSelectionCell().id,'cetz-edit-3');
  assert.ok(g.model.getCell('cetz-edit-0').geometry.equals(before));
  assert.ok(rubberband.first==null,'no marquee selection starts');
  assert.ok(g.graphHandler.first==null,'no shape movement starts');
});

test('3D canvas and Outline hover highlight the plane surface at every zoom without changing the scene', {skip}, async t => {
  const source='#import "@preview/cetz:0.5.2"\n#cetz.canvas({import cetz.draw: *\northo({on-xy({rect((0,0),(1,1),fill:red)\ncircle((3,0),radius:0.5)})\nline((100,100,50),(110,110,60))})\n})';
  const f=await fixture(t,source),g=f.graph;
  const overlays=()=>g.view.getOverlayPane().querySelectorAll('[data-cetz-highlight-owner]');
  const hover=(x,y)=>{
    const event=new f.w.MouseEvent('mousemove',{bubbles:true,clientX:x,clientY:y});
    Object.defineProperty(event,'target',{value:g.container});
    g.fireMouseEvent(f.w.mxEvent.MOUSE_MOVE,new f.w.mxMouseEvent(event));
  };
  const before=f.w.mxUtils.getXml(new f.w.mxCodec().encode(g.model));
  for(const scale of [1,2,0.5]){
    g.view.setScale(scale);g.view.setTranslate(17,-9);
    const s=g.view.getState(g.model.getCell('cetz-edit-0'));
    hover(s.x-4,s.y+s.height/2);
    assert.ok(overlays().length);const overlay=overlays()[0];
    assert.equal(overlay.getAttribute('data-cetz-highlight-owner'),'cetz-edit-2');
    assert.equal(overlay.getAttribute('data-cetz-highlight-plane'),encodeURIComponent(f.rendered.workspace.planes[0].key));
    assert.equal(overlay.localName,'polygon');assert.equal(overlay.getAttribute('fill-opacity'),'0.14');
    assert.equal(overlay.querySelector('path'),null,'the whole plane is highlighted without parsing per-object SVGs');
    const surface=g.view.getBackgroundPane().querySelector('[data-cetz-plane-surface]');
    const projected=surface.getAttribute('points').split(' ').map(p=>p.split(',').map(Number)).map(p=>[(p[0]+17)*scale,(p[1]-9)*scale].join(',')).join(' ');
    assert.equal(overlay.getAttribute('points'),projected);
    hover(s.x-3,s.y+s.height/2);assert.equal(overlays()[0],overlay);
    const other=g.view.getState(g.model.getCell('cetz-edit-1'));
    hover(other.x+other.width/2,other.y+other.height/2);assert.equal(overlays()[0],overlay,'moving between elements on the same plane reuses one surface highlight');
    f.graph.container.dispatchEvent(new f.w.MouseEvent('mouseleave'));assert.equal(overlays().length,0);
    const row=f.ui.sidebar.wrapper.querySelector('[data-cetz-outline-id="cetz-edit-2"]');row.dispatchEvent(new f.w.MouseEvent('mouseenter'));
    assert.equal(overlays()[0].getAttribute('data-cetz-highlight-plane'),encodeURIComponent(f.rendered.workspace.planes[0].key));
    row.dispatchEvent(new f.w.MouseEvent('mouseleave'));assert.equal(overlays().length,0);
    const separate=g.view.getState(g.model.getCell('cetz-edit-3'));hover(separate.x+separate.width/2,separate.y+separate.height/2);
    assert.equal(overlays().length,1,'a standalone 3D line gets its own editable object highlight');assert.equal(overlays()[0].getAttribute('data-cetz-highlight-object'),'3');
  }
  assert.equal(g.getSelectionCount(),0);
  assert.equal(f.w.mxUtils.getXml(new f.w.mxCodec().encode(g.model)),before);
  assert.deepEqual(patchesFromEditable(source,f.rendered,before,readAllCells),[]);
});

test('3D pan coalesces pointer moves per frame and reuses background paths through translation', {skip}, async t => {
  const f=await fixture(t,'#import "@preview/cetz:0.5.2"\n#cetz.canvas({import cetz.draw: *\northo({on-xy({rect((0,0),(1,1))})})\n})');
  const g=f.graph,pane=g.view.getBackgroundPane(),grid=pane.querySelector('[data-cetz-3d-grid]'),plane=pane.querySelector('[data-cetz-plane-surface]');
  const before=f.w.mxUtils.getXml(new f.w.mxCodec().encode(g.model));
  const pan=[...f.ui.sidebar.wrapper.querySelectorAll('.cetz3DWorkspace button')].find(b=>b.textContent==='Pan');pan.click();
  let translations=0;const translate=g.view.setTranslate;
  g.view.setTranslate=function(){translations++;return translate.apply(this,arguments);};
  const send=(target,type,x,y)=>target.dispatchEvent(new f.w.MouseEvent(type,{bubbles:true,cancelable:true,button:0,buttons:1,clientX:x,clientY:y}));
  const tx=g.view.translate.x,ty=g.view.translate.y;
  send(g.container,'mousedown',10,10);
  for(let i=1;i<=100;i++)send(f.w.document,'mousemove',10+i,10+i/2);
  assert.equal(translations,0);
  await new Promise(resolve=>f.w.requestAnimationFrame(resolve));
  assert.equal(translations,1);
  send(f.w.document,'mouseup',130,80);
  assert.equal(g.view.translate.x,tx+120);assert.equal(g.view.translate.y,ty+70);
  assert.equal(pane.querySelector('[data-cetz-3d-grid]'),grid);
  assert.equal(pane.querySelector('[data-cetz-plane-surface]'),plane);
  assert.equal(inspectorCommands(f).length,0);
  assert.equal(f.w.mxUtils.getXml(new f.w.mxCodec().encode(g.model)),before);
  // Focus loss flushes an outstanding frame and releases the gesture.
  send(g.container,'mousedown',0,0);send(f.w.document,'mousemove',20,30);
  f.w.dispatchEvent(new f.w.Event('blur'));
  assert.equal(g.view.translate.x,tx+140);assert.equal(g.view.translate.y,ty+100);
  send(f.w.document,'mousemove',80,90);
  await new Promise(resolve=>f.w.requestAnimationFrame(resolve));
  assert.equal(g.view.translate.x,tx+140);
});

test('3D workspace status updates do not create an idle sidebar redraw loop', {skip}, async t => {
  const f=await fixture(t,'#import "@preview/cetz:0.5.2"\n#cetz.canvas({import cetz.draw: *\northo({rect((0,0),(1,1))})\n})');
  // Match Draw.io's real sidebar hierarchy so the plugin's subtree observer
  // sees its own 2D/3D panels, which the lightweight fixture keeps separate.
  f.ui.sidebar.container.appendChild(f.ui.sidebar.wrapper);
  await new Promise(resolve=>setTimeout(resolve,30));
  let changes=0;
  const observer=new f.w.MutationObserver(records=>{changes+=records.length;});
  observer.observe(f.ui.sidebar.wrapper,{childList:true,subtree:true});
  await new Promise(resolve=>setTimeout(resolve,40));
  observer.disconnect();
  assert.equal(changes,0,'idle panels never schedule themselves for another redraw');
});

test('3D native tools explain edge-on planes, switch to a visible plane and toggle source-neutral guides', {skip}, async t => {
  const source='#import "@preview/cetz:0.5.2"\n#cetz.canvas({import cetz.draw: *\northo(x:0deg,y:0deg,z:0deg,{rect((0,0),(2,1))})\n})';
  const f=await fixture(t,source), panel=f.ui.sidebar.wrapper;
  const plane=panel.querySelector('[aria-label="Base plane"]');
  plane.value='xz';plane.dispatchEvent(new f.w.Event('change'));
  assert.match(panel.querySelector('.cetz3DWorkspace [role="status"]').textContent,/edge-on/);
  f.paletteEntries['cetz-preview-primitives'][0].click();
  assert.equal(f.graph.container.querySelector('.cetzPlacementHint'),null);
  plane.value='xy';plane.dispatchEvent(new f.w.Event('change'));
  f.paletteEntries['cetz-preview-primitives'][0].click();
  assert.ok(f.graph.container.querySelector('.cetzPlacementHint'));
  f.graph.container.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  for(const label of ['3D grid','3D axes']){
    const toggle=panel.querySelector('[aria-label="'+label+'"]');toggle.checked=false;toggle.dispatchEvent(new f.w.Event('change'));
  }
  const guides=f.graph.view.getBackgroundPane().querySelector('[data-cetz-3d-guides]');
  assert.ok(guides);assert.equal(guides.children.length,0);
  const xml=f.w.mxUtils.getXml(new f.w.mxCodec().encode(f.graph.model));
  assert.deepEqual(patchesFromEditable(source,f.rendered,xml,readAllCells),[]);
});

async function loadWorkspaceScene(f,state,rendered){
  const {bindScene}=require('../src/scene');
  if(rendered.workspace){
    rendered.workspace.activePlaneKey=state.key||rendered.workspace.planes[0]?.key||null;
    rendered.xml=rendered.xml.replace(/cetzWorkspace=[^;]*;/,`cetzWorkspace=${encodeURIComponent(JSON.stringify(rendered.workspace))};`);
  }
  rendered.xml=bindScene(state.scene,state.source,rendered.xml,rendered);
  const doc=f.w.mxUtils.parseXml(rendered.xml),incoming=new f.w.mxGraphModel();
  new f.w.mxCodec(doc).decode(doc.getElementsByTagName('mxGraphModel')[0],incoming);
  if(!state.liveMerge)f.graph.clearSelection();f.graph.model.beginUpdate();
  try{
    f.rendered=rendered;
    if(!state.liveMerge)f.graph.model.setRoot(incoming.getRoot());
    else{
      for(const cell of Object.values(f.graph.model.cells))if(!['0','1'].includes(cell.id)&&!incoming.getCell(cell.id))f.graph.model.remove(cell);
      for(const wanted of Object.values(incoming.cells)){
        if(['0','1'].includes(wanted.id))continue;
        const cell=f.graph.model.getCell(wanted.id);
        if(!cell)f.graph.model.add(f.graph.model.getCell(wanted.parent.id),wanted);
        else{
          f.graph.model.setGeometry(cell,wanted.geometry&&wanted.geometry.clone());
          f.graph.model.setStyle(cell,wanted.style);f.graph.model.setVisible(cell,wanted.visible);
        }
      }
    }
  }finally{f.graph.model.endUpdate();}
  f.graph.view.validate();await new Promise(resolve=>setTimeout(resolve,20));
}
async function acceptWorkspaceUI(f,state){
  const {sourceAction,sourceActionPatches}=require('../src/source-actions');
  const editor=require('../src/plane-editor'),{sourceIndices}=require('../src/scene');
  const xml=f.w.mxUtils.getXml(new f.w.mxCodec().encode(f.graph.model));
  const action=sourceAction(readAllCells(xml),readAllCells(f.rendered.xml));
  const apply=patches=>{const before=state.source;state.source=patches.sort((a,b)=>b.start-a.start).reduce((s,p)=>s.slice(0,p.start)+p.text+s.slice(p.end),state.source);state.key=editor.rebasePlaneKey(state.key,before,state.source);};
  if(action)action.indices=sourceIndices(f.rendered,action.indices);
  if(action?.action==='workspace-mode'){
    apply(patchesFromEditable(state.source,f.rendered,xml,readAllCells));
    const payload=JSON.parse(decodeURIComponent(action.value));state.mode=payload.mode;state.key=payload.planeKey||state.key;
    if(state.mode==='3d'&&!require('../src/three-dimensional').is3DCanvas(state.source,parseCanvas(state.source).canvas)){
      const conversion=editor.convertTo3D(state.source,parseCanvas(state.source).canvas);apply(conversion);state.key=conversion.activePlaneKey;
    }
  }else if(action&&action.action!=='select'){
    const patches=sourceActionPatches(state.source,f.rendered,action);apply(patches);if(Object.hasOwn(patches,'activePlaneKey'))state.key=patches.activePlaneKey;
  }else apply(patchesFromEditable(state.source,f.rendered,xml,readAllCells));
  const canvas=parseCanvas(state.source).canvas,full=await renderEditable(state.source,canvas,path.resolve('examples/native.typ'));
  const rendered=state.mode==='2d'?await editor.renderPlane2D(state.source,canvas,state.key,path.resolve('examples/native.typ'),full):full;
  await loadWorkspaceScene(f,state,rendered);return action;
}

test('dimension tabs, plane icons, camera/plane panels and native 2D gestures share the same source', {skip},async t=>{
  const {planeCode}=require('../src/plane-editor');
  const source='#import "@preview/cetz:0.5.2"\n#cetz.canvas({import cetz.draw: *\northo({'+planeCode('','gui-plane-1',
    {kind:'xy',position:[2,3,4],angles:[25,15,-30]},'\nimport cetz.draw: *\nrect((0,0),(2,1))\n')+'})\n})';
  const f=await fixture(t,source),state={source,mode:'3d',key:'gui-plane-1',scene:{}};
  await loadWorkspaceScene(f,state,f.rendered);
  const tabs=()=>f.ui.container.querySelectorAll('[role="tab"]'),panel=f.ui.sidebar.wrapper;
  assert.equal(tabs()[1].textContent,'3D drawing');assert.equal(tabs()[1].getAttribute('aria-selected'),'true');
  assert.equal(f.graph.getSelectionModel().isSingleSelection(),true);
  assert.equal(panel.querySelector('.cetz3DWorkspace').style.display,'');assert.equal(panel.querySelector('.cetz2DWorkspace').style.display,'none');
  const rail=f.ui.formatContainer.querySelector('.cetzPlaneRail');assert.equal(rail.style.display,'flex');
  assert.ok(f.graph.view.getBackgroundPane().querySelector('[data-cetz-plane-surface="true"]'));
  const open=[...panel.querySelectorAll('.cetz3DWorkspace button')].find(button=>button.textContent==='Edit in 2D');open.click();
  await acceptWorkspaceUI(f,state);
  assert.equal(state.source,source);assert.equal(f.rendered.mode,'plane-2d');
  assert.equal(f.graph.getSelectionModel().isSingleSelection(),false,'2D retains multiple selection');
  assert.equal(f.graph.view.getBackgroundPane().querySelector('[data-cetz-3d-guides]').children.length,0,'3D guides are cleared in 2D');
  assert.equal(tabs()[0].getAttribute('aria-selected'),'true');assert.equal(panel.querySelector('.cetz3DWorkspace').style.display,'none');
  assert.equal(panel.querySelector('.cetz2DWorkspace').style.display,'');assert.equal(rail.style.display,'none');assert.equal(f.graph.gridEnabled,true);
  const owner='cetz-edit-'+f.rendered.cellIds[0],drag=f.drag(owner,f.rendered.calibration.unitX*2.5,0);
  f.send(drag.target,'up',drag.x+f.rendered.calibration.unitX*2.5,drag.y);
  await acceptWorkspaceUI(f,state);
  assert.match(state.source,/rect\(\(1, 0\),\s*\(3, 1\)\)/);
  tabs()[1].click();await acceptWorkspaceUI(f,state);
  assert.equal(f.rendered.mode,'3d');assert.ok(state.source.includes('rotate(x: 25deg, y: 15deg, z: -30deg)'));
  const x=panel.querySelector('[aria-label="Plane position X"]');x.value='10';x.dispatchEvent(new f.w.Event('change'));
  await acceptWorkspaceUI(f,state);assert.deepEqual(f.rendered.workspace.planes[0].position,[10,3,4]);
  const camera=panel.querySelector('[aria-label="Camera position X"]');camera.value='3';camera.dispatchEvent(new f.w.Event('change'));
  await acceptWorkspaceUI(f,state);assert.deepEqual(f.rendered.workspace.views[0].position,[3,0,0]);
  rail.querySelector('[aria-label="Drawing plane XZ"]').click();await acceptWorkspaceUI(f,state);
  assert.equal(state.key,'gui-plane-2');assert.equal(panel.querySelector('[aria-label="Selected plane"]').value,'gui-plane-2');
  const angle=panel.querySelector('[aria-label="Plane rotation Y °"]');angle.value='35';angle.dispatchEvent(new f.w.Event('change'));
  await acceptWorkspaceUI(f,state);
  assert.equal(f.rendered.workspace.planes.find(p=>p.key===state.key).angles[1],35);
  open.click();await acceptWorkspaceUI(f,state);assert.equal(f.rendered.calls.length,0);
  const circle=f.paletteEntries['cetz-preview-primitives'].find(entry=>entry.getAttribute('aria-label')==='circle');circle.click();
  const c=f.rendered.calibration;
  for(const p of [[0,0],[1,0]])f.graph.container.dispatchEvent(new f.w.MouseEvent('click',{bubbles:true,cancelable:true,clientX:c.originX+p[0]*c.unitX*2.5,clientY:c.originY-p[1]*c.unitY*2.5,button:0}));
  await acceptWorkspaceUI(f,state);assert.equal(f.rendered.calls[0].name,'circle');
  tabs()[1].click();await acceptWorkspaceUI(f,state);
  assert.ok(state.source.includes('circle((0, 0), radius: 1)'));assert.ok(state.source.includes('rotate(x: 0deg, y: 35deg, z: 0deg)'));
});

test('all 15 visible 2D drawing icons edit local coordinates on an arbitrary rotated plane', {skip},async t=>{
  const {planeCode,renderPlane2D}=require('../src/plane-editor'),fixtures=require('./placement-fixtures');
  const source='#import "@preview/cetz:0.5.2"\n#cetz.canvas({cetz.draw.ortho({'+planeCode('','gui-plane-1',{kind:'xz',position:[2,3,4],angles:[15,-25,35]})+'})})';
  const f=await fixture(t,source),state={source,mode:'2d',key:'gui-plane-1',scene:{}};
  const local=await renderPlane2D(source,parseCanvas(source).canvas,state.key,path.resolve('examples/native.typ'),f.rendered);
  await loadWorkspaceScene(f,state,local);
  const entries=f.paletteEntries['cetz-preview-primitives'].concat(f.paletteEntries['cetz-advanced']);
  assert.equal(f.ui.formatContainer.querySelector('.cetzPlaneRail').style.display,'none');
  for(const [name,points] of Object.entries(fixtures)){
    const entry=entries.find(entry=>entry.getAttribute('aria-label')===name);entry.click();
    assert.ok(f.graph.container.querySelector('.cetzPlacementHint'),name);
    const c=f.rendered.calibration;
    for(const p of points)f.graph.container.dispatchEvent(new f.w.MouseEvent('click',{bubbles:true,cancelable:true,clientX:c.originX+p[0]*c.unitX*2.5,clientY:c.originY-p[1]*c.unitY*2.5,button:0}));
    if(['hobby','catmull'].includes(name))f.graph.container.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
    await acceptWorkspaceUI(f,state);
    assert.ok(f.rendered.calls.some(call=>call.name===name),name);
    assert.ok(state.source.includes('rotate(x: 15deg, y: -25deg, z: 35deg)'));
    assert.equal(f.rendered.planeContext.key,'gui-plane-1');
  }
});

test('3D view and plane selection remain independent across multiple projections', {skip},async t=>{
  const {planeCode}=require('../src/plane-editor');
  const source='#import "@preview/cetz:0.5.2"\n#cetz.canvas({cetz.draw.ortho({'+planeCode('','gui-plane-1',{kind:'xy',position:[0,0,0],angles:[0,0,0]},'cetz.draw.rect((0,0),(2,1))')+'})\ncetz.draw.ortho(x:20deg,{cetz.draw.line((0,0,0),(1,2,3))})})';
  const f=await fixture(t,source),state={source,mode:'3d',key:'gui-plane-1',scene:{}};await loadWorkspaceScene(f,state,f.rendered);
  const select=f.ui.sidebar.wrapper.querySelector('[aria-label="3D view"]'),second=f.rendered.workspace.views[1];
  select.value=String(second.index);select.dispatchEvent(new f.w.Event('change'));
  assert.equal(select.value,String(second.index));
  f.ui.formatContainer.querySelector('[aria-label="Drawing plane ZY"]').click();await acceptWorkspaceUI(f,state);
  const created=f.rendered.workspace.planes.find(plane=>plane.key==='gui-plane-2');assert.ok(created);
  assert.equal(created.view,f.rendered.workspace.views[1].index);assert.equal(select.value,String(created.view));
});

test('workspace projection selector changes the chosen view, restores distance and keeps plane editing available', {skip},async t=>{
  const source='#import "@preview/cetz:0.5.3"\n#cetz.canvas({import cetz.draw: *\nperspective(distance:12,x:20deg,y:30deg,{on-xy({rect((0,0),(2,1))})})\northo({circle((5,5),radius:1)})\n})';
  const f=await fixture(t,source),state={source,mode:'3d',key:f.rendered.workspace.planes[0].key,scene:{}};
  await loadWorkspaceScene(f,state,f.rendered);
  const select=f.ui.sidebar.wrapper.querySelector('[aria-label="Projection"]');
  const body=f.rendered.calls.find(c=>c.name==='on-xy').call;
  assert.equal(select.value,'perspective');
  select.value='ortho';select.dispatchEvent(new f.w.Event('change'));
  assert.equal(select.disabled,true);assert.equal(select.value,'perspective','wait for validated source acknowledgement');
  let action=await acceptWorkspaceUI(f,state);assert.equal(action.action,'projection-kind');
  assert.equal(select.value,'ortho');assert.equal(select.disabled,false);assert.ok(!state.source.includes('distance:'));
  assert.equal(f.rendered.workspace.views[1].kind,'ortho');assert.ok(state.source.includes(body));
  assert.equal(f.ui.sidebar.wrapper.querySelector('[aria-label="3D view"]').value,String(f.rendered.workspace.views[0].index));
  select.value='perspective';select.dispatchEvent(new f.w.Event('change'));await acceptWorkspaceUI(f,state);
  assert.equal(select.value,'perspective');assert.match(state.source,/distance: 12/);assert.match(state.source,/x:20deg,y:30deg/);
  const tabs=f.ui.container.querySelector('.cetzDimensionTabs');assert.equal(tabs.parentNode,f.ui.container);
  assert.equal(f.ui.menubarContainer.querySelector('[role="tab"]'),null,'tabs occupy the canvas header, outside the menu');
  tabs.querySelector('[aria-label="2D drawing"]').click();await acceptWorkspaceUI(f,state);
  assert.equal(f.rendered.mode,'plane-2d');assert.equal(f.rendered.calls[0].name,'rect');
});

test('tab switching retains unfinished coordinates and resumes automatically after their validated update', {skip},async t=>{
  let source='#import "@preview/cetz:0.5.2"\n#cetz.canvas({import cetz.draw: *\nrect((0,0),(2,1))\n})';
  const f=await fixture(t,source);f.select('cetz-edit-0');
  const x=f.ui.sidebar.wrapper.querySelector('[aria-label="Corner 1 X"]');assert.ok(x);
  x.value='';x.dispatchEvent(new f.w.Event('input',{bubbles:true}));
  const tab=f.ui.container.querySelectorAll('[role="tab"]')[1];tab.click();
  assert.equal(Object.values(f.graph.model.cells).filter(cell=>/cetzAction=workspace-mode;/.test(cell.style||'')).length,0);
  assert.match(f.ui.container.querySelector('.cetzDimensionNotice').textContent,/Complete/);
  x.value='1';x.dispatchEvent(new f.w.Event('change',{bubbles:true}));
  await waitForInspector(()=>inspectorCommands(f).length===1);source=await acceptInspectorCommand(f,source);
  await waitForInspector(()=>Object.values(f.graph.model.cells).some(cell=>/cetzAction=workspace-mode;/.test(cell.style||'')));
  assert.match(source,/rect\(\(1, 0\),/);
});

test('a queued 2D tab follows the selected legacy plane across camera header edits', {skip},async t=>{
  const source='#import "@preview/cetz:0.5.2"\n#cetz.canvas({import cetz.draw: *\northo({on-xy({rect((0,0),(2,1))})\non-xz(y:2,{circle((3,1),radius:1)})})\n})';
  const f=await fixture(t,source),state={source,mode:'3d',key:f.rendered.workspace.planes[0].key,scene:{}};
  await loadWorkspaceScene(f,state,f.rendered);
  const select=f.ui.sidebar.wrapper.querySelector('[aria-label="Selected plane"]');select.value=f.rendered.workspace.planes[1].key;select.dispatchEvent(new f.w.Event('change'));
  const camera=f.ui.sidebar.wrapper.querySelector('[aria-label="Camera position X"]');camera.value='2';camera.dispatchEvent(new f.w.Event('change'));
  f.ui.container.querySelectorAll('[role="tab"]')[0].click();
  await acceptWorkspaceUI(f,state);
  await waitForInspector(()=>Object.values(f.graph.model.cells).some(cell=>/cetzAction=workspace-mode;/.test(cell.style||'')));
  const cmd=Object.values(f.graph.model.cells).find(cell=>/cetzAction=workspace-mode;/.test(cell.style||''));
  const payload=JSON.parse(decodeURIComponent(f.graph.getCellStyle(cmd).cetzValue));
  assert.equal(payload.planeKey,f.rendered.workspace.planes[1].key);
  await acceptWorkspaceUI(f,state);assert.equal(f.rendered.calls.length,1);assert.equal(f.rendered.calls[0].name,'circle');
});

test('late native refresh keeps the 2D viewport after the CeTZ rail layout settles', {skip},async t=>{
  const f=await fixture(t,undefined,{nativeCanvas:true,clampedScroll:true,nativeRefresh:true,loadedLayers:true}),g=f.graph;
  g.container.scrollLeft=123;g.container.scrollTop=157;
  const origin=()=>{const c=f.rendered.calibration,v=g.view;return [(c.originX+v.translate.x)*v.scale-g.container.scrollLeft,(c.originY+v.translate.y)*v.scale-g.container.scrollTop];};
  const before=origin();
  for(let i=0;i<5;i++){
    f.ui.boundNativeRefresh(true);
    f.ui.formatContainer.style.width='48px';
    // Validation/resize runs again after the native standard-panel width
    // has been replaced by the 48px CeTZ rail, outside the model event.
    g.view.validate();g.sizeDidChange();
    origin().forEach((value,j)=>assert.ok(Math.abs(value-before[j])<1e-5,`late refresh moved axis ${j} by ${value-before[j]} pixels`));
  }
});

test('native page patches preserve the viewport when shapes are added and deleted', {skip},async t=>{
  const source='#import "@preview/cetz:0.5.3"\n#cetz.canvas({import cetz.draw: *\ncircle((4,2),radius:1)\n})';
  const f=await fixture(t,source,{nativeCanvas:true,clampedScroll:true,loadedLayers:true,modelCoordinates:true,nativeFitWindow:true}),{w,graph:g,ui}=f;
  assert.equal(ui.fitWindowEnabled,false,'initial framing must not enable native automatic fitting');
  assert.equal(f.nativeFits(),1,'initial framing fits once');
  w.EditorUi=function(){};w.EditorUi.debug=function(){};w.Editor={guid:()=> 'fixture',config:{}};w.urlParams={};
  w.Graph=w.mxGraph;
  w.eval(fs.readFileSync(path.resolve(path.dirname(editorUi),'Pages.js'),'utf8'));
  w.eval(fs.readFileSync(path.resolve(path.dirname(editorUi),'DiffSync.js'),'utf8'));
  Object.setPrototypeOf(ui,w.EditorUi.prototype);
  g.setShadowVisible=function(){};g.setAdaptiveColors=function(){};
  const pageFor=xml=>{
    const doc=w.mxUtils.parseXml(xml),node=doc.getElementsByTagName('mxGraphModel')[0];
    const model=new w.mxGraphModel();new w.mxCodec(doc).decode(node,model);
    const page=new w.DiagramPage(doc.getElementsByTagName('diagram')[0]);
    page.root=model.root;
    page.viewState={...g.getViewState(),pageFormat:new w.mxRectangle(0,0,+node.getAttribute('pageWidth'),+node.getAttribute('pageHeight'))};
    return page;
  };
  let shadow=pageFor(f.rendered.xml);
  ui.currentPage=pageFor(f.rendered.xml);ui.currentPage.root=g.model.root;ui.pages=[ui.currentPage];
  g.view.validate();g.sizeDidChange();g.container.scrollLeft=123;g.container.scrollTop=157;
  const origin=()=>{const c=f.rendered.calibration,v=g.view;return [(c.originX+v.translate.x)*v.scale-g.container.scrollLeft,(c.originY+v.translate.y)*v.scale-g.container.scrollTop];};
  const before=origin(),scale=g.view.scale,fits=f.nativeFits();
  for(const addition of ['rect((-10,15),(-8,16))','', 'rect((30,-30),(32,-29))','']){
    const text=source.replace('circle(',addition+'\ncircle('),next=await renderEditable(text,parseCanvas(text).canvas,path.resolve('examples/basic.typ'));
    const incoming=pageFor(next.xml),patch=ui.diffPages([shadow],[incoming]);
    g.model.beginUpdate();
    try{ui.pages=ui.applyPatches(ui.pages,[patch],true);}finally{g.model.endUpdate();}
    f.rendered=next;shadow=incoming;
    g.view.validate();g.sizeDidChange();
    ui.fireEvent(new w.mxEventObject('pageFormatChanged'));
    await new Promise(resolve=>setTimeout(resolve,30));
    assert.equal(g.view.scale,scale,'native page patches keep the zoom');
    assert.equal(f.nativeFits(),fits,'bounds changes do not fit again');
    origin().forEach((value,i)=>assert.ok(Math.abs(value-before[i])<1e-5,`native page patch drifted axis ${i} by ${value-before[i]} pixels`));
  }
  for(let i=0;i<2;i++){
    ui.actions.get('fitWindow').funct();
    assert.equal(f.nativeFits(),fits+i+1,'explicit Fit view always fits once');
    assert.equal(ui.fitWindowEnabled,false,'explicit Fit view never enables automatic fitting');
    ui.fireEvent(new w.mxEventObject('pageFormatChanged'));
    assert.equal(f.nativeFits(),fits+i+1);
  }
  ui.getCurrentFile=()=>({getTitle:()=> 'ordinary.drawio',getData:()=> ''});g.model.clear();
  ui.actions.get('fitWindow').funct();
  assert.equal(ui.fitWindowEnabled,true,'ordinary Draw.io files retain native automatic fitting');
  ui.actions.get('fitWindow').funct();assert.equal(ui.fitWindowEnabled,false);
});

for(const nativeCanvas of [false,true])test(`source merges preserve the CeTZ viewport with ${nativeCanvas?'native infinite canvas':'bare mxGraph'}`, {skip},async t=>{
  const source='#import "@preview/cetz:0.5.3"\n#cetz.canvas({import cetz.draw: *\nrect((0,0),(2,1))\ncircle((4,2),radius:1)\n})';
  const f=await fixture(t,source,{nativeCanvas,clampedScroll:true}),g=f.graph,state={source,scene:{},liveMerge:true};
  if(!nativeCanvas)Object.defineProperties(g.container,{clientWidth:{value:800},clientHeight:{value:600}});
  await loadWorkspaceScene(f,state,f.rendered);
  g.view.setScale(1.25);g.view.validate();g.sizeDidChange();
  g.container.scrollLeft=123;g.container.scrollTop=157;
  const origin=()=>{const c=f.rendered.calibration,v=g.view;return [(c.originX+v.translate.x)*v.scale-g.container.scrollLeft,(c.originY+v.translate.y)*v.scale-g.container.scrollTop];};
  const before=origin();
  // Moving the left/top bound expands Typst's SVG and relocates the graph's
  // calibration origin. The unedited circle must stay at the same screen point.
  for(const [x,y] of [[1,1],[-10,15],[-20,30],[0,0],[-10,15]]){
    state.source=source.replace('rect((0,0),(2,1))',`rect((${x},${y}),(${x+2},${y+1}))`);
    const next=await renderEditable(state.source,parseCanvas(state.source).canvas,path.resolve('examples/basic.typ'));
    await loadWorkspaceScene(f,state,next);
    await new Promise(resolve=>f.w.requestAnimationFrame(resolve));g.view.validate();g.sizeDidChange();
    assert.equal(g.view.scale,1.25);
    origin().forEach((value,i)=>assert.ok(Math.abs(value-before[i])<1e-5,`axis ${i} drifted by ${value-before[i]} pixels`));
  }
  g.view.setScale(2);g.view.validate();g.sizeDidChange();
  g.container.scrollLeft+=37;g.container.scrollTop+=59;
  const navigated=origin();
  state.source=source;
  await loadWorkspaceScene(f,state,await renderEditable(source,parseCanvas(source).canvas,path.resolve('examples/basic.typ')));
  g.view.validate();g.sizeDidChange();
  assert.equal(g.view.scale,2,'source updates keep the latest user zoom');
  origin().forEach((value,i)=>assert.ok(Math.abs(value-navigated[i])<1e-5,`source updates keep the latest user scroll: axis ${i} drifted by ${value-navigated[i]} pixels`));
  if(nativeCanvas){
    state.source=source.replace('rect((0,0),(2,1))','rect((30,-30),(32,-29))');
    await loadWorkspaceScene(f,state,await renderEditable(state.source,parseCanvas(state.source).canvas,path.resolve('examples/basic.typ')));
    g.container.scrollLeft=g.container.scrollWidth-820;g.container.scrollTop=g.container.scrollHeight-620;
    const farCorner=origin();state.source=source;
    await loadWorkspaceScene(f,state,await renderEditable(source,parseCanvas(source).canvas,path.resolve('examples/basic.typ')));
    g.view.validate();g.sizeDidChange();
    origin().forEach((value,i)=>assert.ok(Math.abs(value-farCorner[i])<1e-5,`shrinking bounds must not clamp scroll: axis ${i} drifted by ${value-farCorner[i]} pixels`));
  }
});

for(const nativeCanvas of [false,true])test(`dimension switching restores center, zoom and scroll with ${nativeCanvas?'native infinite canvas':'bare mxGraph'}`, {skip},async t=>{
  const source='#import "@preview/cetz:0.5.3"\n#cetz.canvas({import cetz.draw: *\northo({on-xy({rect((30,40),(34,43))})\non-xz({circle((2,2),radius:1)})})\n})';
  const f=await fixture(t,source,{nativeCanvas}),state={source,mode:'3d',key:f.rendered.workspace.planes[0].key,scene:{}};
  const g=f.graph;if(!nativeCanvas)Object.defineProperties(g.container,{clientWidth:{value:800},clientHeight:{value:600}});
  f.w.document.body.appendChild(f.ui.container);
  await loadWorkspaceScene(f,state,f.rendered);
  const tabs=()=>f.ui.container.querySelectorAll('[role="tab"]');
  const center=()=>[(g.container.scrollLeft+400)/g.view.scale-g.view.translate.x,(g.container.scrollTop+300)/g.view.scale-g.view.translate.y];
  const centered=()=>{const b=g.model.getGeometry(g.model.getCell('cetz-preview-background')),c=center();assert.ok(Math.abs(c[0]-b.x-b.width/2)<1e-5);assert.ok(Math.abs(c[1]-b.y-b.height/2)<1e-5);};
  g.view.scaleAndTranslate(.8,-350,125);g.container.scrollLeft=53;g.container.scrollTop=71;
  const original3D={center:center(),scale:g.view.scale};
  tabs()[0].click();await acceptWorkspaceUI(f,state);await new Promise(resolve=>f.w.requestAnimationFrame(resolve));g.view.validate();g.sizeDidChange();centered();
  const nativeGet=f.ui.actions.get;let nativeFits=0;
  f.ui.actions.get=function(name){return name==='fitWindow'?{funct(){nativeFits++;g.view.scaleAndTranslate(3,0,0);}}:nativeGet.call(this,name);};
  g.view.scaleAndTranslate(3,0,0);f.ui.fileLoaded();await new Promise(resolve=>f.w.requestAnimationFrame(resolve));g.view.validate();g.sizeDidChange();
  centered();assert.equal(nativeFits,0,'a later native fileLoaded must not overwrite the restored viewport');
  g.view.scaleAndTranslate(1.2,-1000,-1300);g.container.scrollLeft=27;g.container.scrollTop=39;
  const original2D={center:center(),scale:g.view.scale};
  tabs()[1].click();await acceptWorkspaceUI(f,state);await new Promise(resolve=>f.w.requestAnimationFrame(resolve));g.view.validate();g.sizeDidChange();
  assert.equal(g.view.scale,original3D.scale);center().forEach((n,i)=>assert.ok(Math.abs(n-original3D.center[i])<1e-5));
  tabs()[0].click();await acceptWorkspaceUI(f,state);await new Promise(resolve=>f.w.requestAnimationFrame(resolve));g.view.validate();g.sizeDidChange();
  assert.equal(g.view.scale,original2D.scale);center().forEach((n,i)=>assert.ok(Math.abs(n-original2D.center[i])<1e-5));
  tabs()[1].click();await acceptWorkspaceUI(f,state);
  const planes=f.ui.sidebar.wrapper.querySelector('[aria-label="Selected plane"]');planes.value=f.rendered.workspace.planes[1].key;planes.dispatchEvent(new f.w.Event('change'));
  tabs()[0].click();await acceptWorkspaceUI(f,state);await new Promise(resolve=>f.w.requestAnimationFrame(resolve));g.view.validate();g.sizeDidChange();centered();
});

test('3D plane deletion handles Delete, list selection and native removeCells without deleting text input', {skip},async t=>{
  const {planeCode}=require('../src/plane-editor');
  const source='#import "@preview/cetz:0.5.3"\n#cetz.canvas({import cetz.draw: *\northo({on-xy({rect((0,0),(2,1))})\n'+planeCode('','gui-plane-1',{kind:'xz',position:[1,2,3],angles:[10,20,30]},'\nlet r=2\ncetz.draw.circle((1,1),radius:r)\n')+'\non-xz({circle((4,4),radius:1)})})\n})';
  const f=await fixture(t,source),state={source,mode:'3d',key:'gui-plane-1',scene:{}};
  await loadWorkspaceScene(f,state,f.rendered);f.w.document.body.appendChild(f.ui.sidebar.wrapper);
  const list=f.ui.sidebar.wrapper.querySelector('[aria-label="Selected plane"]');list.value='gui-plane-1';list.dispatchEvent(new f.w.Event('change'));
  const input=f.ui.sidebar.wrapper.querySelector('[aria-label="Camera position X"]');
  input.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Delete',bubbles:true,cancelable:true}));
  assert.equal(Object.values(f.graph.model.cells).some(c=>/cetzAction=plane-delete;/.test(c.style||'')),false);
  list.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Delete',bubbles:true,cancelable:true}));
  assert.ok(state.source.includes('let r=2'),'wait for validated source deletion');
  let action=await acceptWorkspaceUI(f,state);assert.equal(action.action,'plane-delete');
  assert.ok(!state.source.includes('let r=2'));assert.ok(!state.source.includes('radius:r'));assert.equal(f.rendered.workspace.planes.length,2);
  const plane=f.rendered.workspace.planes[0],cell=Object.values(f.graph.model.cells).find(c=>/^cetz-edit-/.test(c.id)&&Number(f.graph.getCellStyle(c).cetzSourceIndex)===plane.wrapperIndex);
  f.graph.setSelectionCell(cell);f.graph.removeCells(f.graph.getSelectionCells());
  action=await acceptWorkspaceUI(f,state);assert.equal(action.action,'plane-delete');assert.ok(!state.source.includes('rect('));assert.equal(f.rendered.workspace.planes.length,1);
  list.value=f.rendered.workspace.planes[0].key;list.dispatchEvent(new f.w.Event('change'));
  list.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Backspace',bubbles:true,cancelable:true}));
  await acceptWorkspaceUI(f,state);assert.equal(f.rendered.workspace.planes.length,0);assert.equal(f.rendered.mode,'3d');assert.ok(!state.source.includes('circle('));
});

for(const kind of ['ortho','perspective'])test(`3D ${kind} line tool guides six XYZ coordinates, snaps existing points and creates source geometry`,{skip},async t=>{
  const source='#import "@preview/cetz:0.5.3"\n#cetz.canvas({import cetz.draw: *\n'+kind+'(x:20deg,y:30deg,{line((1,2,3),(4,5,6))\non-xy({rect((0,0),(2,1))})})\n})';
  const f=await fixture(t,source),state={source,mode:'3d',scene:{}};await loadWorkspaceScene(f,state,f.rendered);
  f.w.document.body.appendChild(f.ui.container);f.w.document.body.appendChild(f.ui.formatContainer);
  const rail=f.ui.formatContainer.querySelector('.cetzPlaneRail');assert.equal(rail.querySelector('[aria-label="Drawing plane Free"]'),null);
  rail.querySelector('[aria-label="3D line"]').click();
  const hint=()=>f.graph.container.querySelector('.cetzSpatialHint'),preview=()=>f.graph.view.getOverlayPane().querySelector('[data-cetz-placement="3d-line"]');
  assert.ok(hint());assert.match(hint().textContent,/line: Start point · X/);assert.ok(preview().querySelector('[data-cetz-spatial-axis="X"]'));
  assert.equal(Object.values(f.graph.model.cells).some(c=>/cetzPlacement3D=/.test(c.style||'')),false,'live guides do not change the model');
  const matrix=f.rendered.workspace.views[0].matrix,project=require('../src/three-workspace').project;
  function pointer(point,type='mousemove'){
    const p=project(matrix,point),v=f.graph.view;
    f.graph.container.dispatchEvent(new f.w.MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:(p[0]+v.translate.x)*v.scale-f.graph.container.scrollLeft,clientY:(p[1]+v.translate.y)*v.scale-f.graph.container.scrollTop}));
  }
  const targets=[[1,0,0],[1,2,0],[1,2,3],[4,2,3],[4,5,3],[4,5,6]];
  f.graph.view.setScale(2);f.graph.view.setTranslate(12,-8);f.graph.container.scrollLeft=17;f.graph.container.scrollTop=23;
  pointer([2.34,0,0]);assert.equal(Number(hint().querySelector('[aria-label="3D coordinate"]').value),2.375,'grid snapping follows the zoom step');
  pointer([1.001,0,0]);assert.equal(Number(hint().querySelector('[aria-label="3D coordinate"]').value),1,'nearby coordinates snap to an existing point');
  for(let stage=0;stage<6;stage++){
    assert.match(hint().querySelector('.cetzSpatialStage').textContent,new RegExp('XYZ'[stage%3]+' \\('));
    pointer(targets[stage]);assert.equal(Number(hint().querySelector('[aria-label="3D coordinate"]').value),targets[stage][stage%3]);
    assert.ok(preview().querySelector('[data-cetz-spatial-snap="true"]'),'snap guides are visible');
    assert.ok(preview().querySelector('[data-cetz-spatial-guide]'),'XYZ construction guides are visible');
    pointer(targets[stage],'click');
  }
  assert.equal(hint(),null);assert.equal(preview(),null);
  const cells=Object.values(f.graph.model.cells).filter(c=>/cetzPlacement3D=/.test(c.style||''));assert.equal(cells.length,1);
  const payload=JSON.parse(decodeURIComponent(/cetzPlacement3D=([^;]+);/.exec(cells[0].style)[1]));
  assert.equal(payload.space,'xyz');assert.deepEqual(payload.points,[[1,2,3],[4,5,6]]);
  await acceptWorkspaceUI(f,state);assert.ok(state.source.includes('cetz.draw.line((1, 2, 3), (4, 5, 6))'));assert.equal(f.rendered.workspace.planes.length,1);
});

for(const projection of ['ortho(x:0deg,y:0deg,z:0deg','perspective(x:20deg,y:30deg'])test(`3D numeric input handles backtracking, cancellation and text in an empty ${projection.split('(')[0]} view`,{skip},async t=>{
  const source='#import "@preview/cetz:0.5.3"\n#cetz.canvas({cetz.draw.'+projection+',{ })})';
  const f=await fixture(t,source),state={source,mode:'3d',scene:{}};await loadWorkspaceScene(f,state,f.rendered);f.w.document.body.appendChild(f.ui.formatContainer);
  const rail=f.ui.formatContainer.querySelector('.cetzPlaneRail');rail.querySelector('[aria-label="3D line"]').click();
  const hint=()=>f.graph.container.querySelector('.cetzSpatialHint');
  function enter(value){const input=hint().querySelector('[aria-label="3D coordinate"]');input.value=value;input.dispatchEvent(new f.w.Event('input',{bubbles:true}));input.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));}
  enter('1');enter('2');assert.match(hint().querySelector('.cetzSpatialStage').textContent,/Z \(/);
  if(projection.startsWith('ortho'))assert.equal(f.graph.view.getOverlayPane().querySelector('[data-cetz-spatial-axis="Z"]'),null,'depth uses numeric input when edge-on');
  hint().querySelector('[data-action="back"]').click();assert.match(hint().querySelector('.cetzSpatialStage').textContent,/Y \(/);
  enter('3');enter('4');enter('2');enter('5');enter('6');await acceptWorkspaceUI(f,state);assert.ok(state.source.includes('cetz.draw.line((1, 3, 4), (2, 5, 6))'));assert.equal(f.rendered.workspace.planes.length,0);
  rail.querySelector('[aria-label="3D line"]').click();enter('NaN');assert.ok(hint());assert.equal(hint().querySelector('[aria-label="3D coordinate"]').getAttribute('aria-invalid'),'true');
  hint().querySelector('[aria-label="3D coordinate"]').dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(hint(),null);
  rail.querySelector('[aria-label="3D content"]').click();hint().querySelector('[aria-label="3D text"]').value='3D label';enter('2');enter('3');enter('4');await acceptWorkspaceUI(f,state);assert.ok(state.source.includes('cetz.draw.content((2, 3, 4), "3D label")'));
});

for(const projection of ['ortho','perspective'])test(`3D ${projection} objects can be selected and edited with endpoint handles, Properties and text`,{skip},async t=>{
  const source='#import "@preview/cetz:0.5.3"\n#cetz.canvas({import cetz.draw: *\n'+projection+'(x:20deg,y:30deg,{line((1,2,3),(4,5,6),stroke:red)\ncontent((2,1,3),"Label",anchor:"south")\non-xy({rect((0,0),(2,1))})})\n})';
  const f=await fixture(t,source),state={source,mode:'3d',scene:{}};await loadWorkspaceScene(f,state,f.rendered);
  f.w.document.body.appendChild(f.ui.sidebar.wrapper);
  const cellFor=object=>Object.values(f.graph.model.cells).find(cell=>/^cetz-edit-/.test(cell.id)&&Number(f.graph.getCellStyle(cell).cetzSourceIndex)===object.index);
  let object=f.rendered.workspace.objects.find(o=>o.kind==='line');const originalEnd=object.points[1].slice();
  const matrix=f.rendered.workspace.views[0].matrix,project=require('../src/three-workspace').project;
  const midpoint=project(matrix,object.points[0].map((n,i)=>(n+object.points[1][i])/2)),v=f.graph.view;
  const x=(midpoint[0]+v.translate.x)*v.scale,y=(midpoint[1]+v.translate.y)*v.scale;
  f.graph.container.dispatchEvent(new f.w.MouseEvent('mousemove',{bubbles:true,clientX:x,clientY:y}));
  assert.ok(f.graph.view.getOverlayPane().querySelector('[data-cetz-highlight-object]'));
  f.send(f.graph.container,'down',x,y);f.send(f.w.document,'up',x,y);
  assert.equal(f.graph.getSelectionCell(),cellFor(object));
  assert.equal(f.graph.isCellMovable(cellFor(object)),false,'body drag keeps orbiting; endpoint handles edit XYZ');
  const outline=f.ui.sidebar.wrapper.querySelector('.cetzOutline');assert.ok(outline.textContent.includes('line'));assert.ok(outline.textContent.includes('content'));
  let handles=f.graph.view.getOverlayPane().querySelectorAll('[data-cetz-spatial-handle]');assert.equal(handles.length,2);
  const hx=Number(handles[0].getAttribute('cx')),hy=Number(handles[0].getAttribute('cy'));
  f.send(handles[0],'down',hx,hy);assert.equal(f.graph.container.querySelector('.cetzSpatialHint'),null,'mousedown does not orbit or prematurely advance a coordinate');
  handles[0].dispatchEvent(new f.w.MouseEvent('click',{bubbles:true,cancelable:true}));
  const hint=()=>f.graph.container.querySelector('.cetzSpatialHint');assert.match(hint().textContent,/Edit · line: Start point · X/);
  function enter(value){const input=hint().querySelector('[aria-label="3D coordinate"]');input.value=String(value);input.dispatchEvent(new f.w.Event('input',{bubbles:true}));input.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));}
  enter(2);enter(3);enter(4);assert.equal(hint(),null);
  let action=await acceptWorkspaceUI(f,state);assert.equal(action.action,'spatial-edit');
  object=f.rendered.workspace.objects.find(o=>o.kind==='line');assert.deepEqual(object.points,[[2,3,4],originalEnd]);assert.ok(state.source.includes('stroke:red'));
  f.graph.setSelectionCell(cellFor(object));
  const input=f.ui.sidebar.wrapper.querySelector('[aria-label="End Z"]');assert.ok(input);input.value='7';input.dispatchEvent(new f.w.Event('input',{bubbles:true}));input.dispatchEvent(new f.w.Event('change',{bubbles:true}));
  action=await acceptWorkspaceUI(f,state);assert.equal(action.action,'properties');assert.equal(f.rendered.workspace.objects.find(o=>o.kind==='line').points[1][2],7);
  object=f.rendered.workspace.objects.find(o=>o.kind==='line');f.graph.setSelectionCell(cellFor(object));
  f.ui.sidebar.wrapper.querySelector('[aria-label="3D Move end"]').click();assert.match(hint().textContent,/Edit · line: End point · X/);assert.equal(hint().querySelector('[data-action="back"]').disabled,true);
  enter(4.5);enter(5.5);enter(7.5);await acceptWorkspaceUI(f,state);
  assert.deepEqual(f.rendered.workspace.objects.find(o=>o.kind==='line').points,[[2,3,4],[4.5,5.5,7.5]]);
  object=f.rendered.workspace.objects.find(o=>o.kind==='content');f.graph.setSelectionCell(cellFor(object));assert.equal(f.graph.view.getOverlayPane().querySelectorAll('[data-cetz-spatial-handle]').length,1);
  const textState=f.graph.view.getState(cellFor(object));f.graph.container.dispatchEvent(new f.w.MouseEvent('dblclick',{bubbles:true,cancelable:true,clientX:textState.getCenterX(),clientY:textState.getCenterY()}));
  assert.equal(f.w.document.activeElement,f.ui.sidebar.wrapper.querySelector('[aria-label="Text"]'));
  const text=f.ui.sidebar.wrapper.querySelector('[aria-label="Text"]');assert.ok(text);text.value='Edited XYZ';text.dispatchEvent(new f.w.Event('change',{bubbles:true}));
  await acceptWorkspaceUI(f,state);assert.equal(f.rendered.workspace.objects.find(o=>o.kind==='content').text,'Edited XYZ');assert.ok(state.source.includes('anchor:"south"'));
  object=f.rendered.workspace.objects.find(o=>o.kind==='content');f.graph.setSelectionCell(cellFor(object));
  f.graph.view.getOverlayPane().querySelector('[data-cetz-spatial-handle]').dispatchEvent(new f.w.MouseEvent('click',{bubbles:true,cancelable:true}));
  assert.match(hint().textContent,/Edit · content: Text position · X/);enter(4);enter(2);enter(3);await acceptWorkspaceUI(f,state);
  object=f.rendered.workspace.objects.find(o=>o.kind==='content');assert.deepEqual(object.points,[[4,2,3]]);assert.equal(object.text,'Edited XYZ');assert.equal(f.rendered.workspace.planes.length,1);
});

test('2D and 3D reuse English tool names, thumbnails and placement labels',{skip},async t=>{
  const source='#import "@preview/cetz:0.5.3"\n#cetz.canvas({import cetz.draw: *\northo({on-xy({rect((0,0),(2,1))})})\n})';
  const f=await fixture(t,source),state={source,mode:'3d',key:f.rendered.workspace.planes[0].key,scene:{}};await loadWorkspaceScene(f,state,f.rendered);
  const rail=f.ui.formatContainer.querySelector('.cetzPlaneRail'),tabs=f.ui.container.querySelectorAll('[role=tab]');
  assert.deepEqual([...tabs].map(tab=>tab.textContent),['2D drawing','3D drawing']);
  for(const name of ['line','content']){
    const flat=f.paletteEntries['cetz-preview-primitives'].find(entry=>entry.getAttribute('aria-label')===name),spatial=rail.querySelector('[aria-label="3D '+name+'"]');
    assert.equal(spatial.getAttribute('data-cetz-tool'),name);assert.equal(spatial.querySelector('img').src,flat.querySelector('img').src,'one icon asset for both modes');
    assert.equal(spatial.querySelector('img').style.cssText,flat.querySelector('img').style.cssText);
    assert.ok(spatial.title.startsWith(name+' · 3D:'));
  }
  const ui=f.ui.sidebar.wrapper.querySelector('.cetz3DWorkspace').textContent+f.ui.container.querySelector('.cetzDimensionTabs').textContent+rail.textContent;
  assert.ok(!/[ぁ-んァ-ヶ一-龯]/.test(ui),'workspace controls and plane labels use English');
  rail.querySelector('[aria-label="3D line"]').click();const spatialHint=f.graph.container.querySelector('.cetzSpatialHint');
  assert.match(spatialHint.textContent,/line: Start point/);assert.ok(!/[ぁ-んァ-ヶ一-龯]/.test(spatialHint.textContent));spatialHint.querySelector('[data-action="cancel"]').click();
  tabs[0].click();await acceptWorkspaceUI(f,state);
  const line=f.paletteEntries['cetz-preview-primitives'].find(entry=>entry.getAttribute('aria-label')==='line');line.click();
  assert.match(f.graph.container.querySelector('.cetzPlacementHint').textContent,/line: Start point/);
});

for(const projection of ['ortho','perspective'])test(`selected planes show their projected local origin and axes in ${projection}`,{skip},async t=>{
  const {planeCode}=require('../src/plane-editor'),{project}=require('../src/three-workspace');
  const source='#import "@preview/cetz:0.5.3"\n#cetz.canvas({cetz.draw.'+projection+'(x:20deg,y:30deg,{'+['xy','xz','zy'].map((kind,i)=>planeCode('','gui-plane-'+(i+1),{kind,position:[i+1,2,3],angles:[15,25,35]},'cetz.draw.rect((1,2),(3,4),fill:red)')).join('\n')+'})})';
  const f=await fixture(t,source),g=f.graph,panel=f.ui.sidebar.wrapper,planeSelect=panel.querySelector('[aria-label="Selected plane"]');
  const axes=()=>g.view.getOverlayPane().querySelector('[data-cetz-plane-axes]');
  for(const plane of f.rendered.workspace.planes){
    planeSelect.value=plane.key;planeSelect.dispatchEvent(new f.w.Event('change'));
    const cell=Object.values(g.model.cells).find(cell=>/^cetz-edit-/.test(cell.id)&&Number(g.getCellStyle(cell).cetzSourceIndex)===plane.wrapperIndex);g.setSelectionCell(cell);
    const xml=f.w.mxUtils.getXml(new f.w.mxCodec().encode(g.model));
    for(const scale of [.5,1,2]){
      g.view.setScale(scale);g.view.setTranslate(17,-9);
      const layer=axes(),origin=layer.querySelector('[data-cetz-plane-origin]'),expected=project(plane.matrix,[0,0,0]);
      assert.equal(layer.getAttribute('data-cetz-plane-axes'),plane.key);assert.equal(layer.getAttribute('pointer-events'),'none');assert.ok(Number(layer.getAttribute('opacity'))<.65);
      assert.equal(layer.getAttribute('transform'),'translate('+(17*scale)+' '+(-9*scale)+') scale('+scale+')');
      assert.ok(Math.abs(+origin.getAttribute('cx')-expected[0])<1e-6);assert.ok(Math.abs(+origin.getAttribute('cy')-expected[1])<1e-6);assert.equal(+origin.getAttribute('r')*scale,3);
      const bounds=plane.localBounds,ranges=[[Math.min(-2.5,bounds.x-.5),Math.max(2.5,bounds.x+bounds.width+.5)],[Math.min(-2.5,bounds.y-.5),Math.max(2.5,bounds.y+bounds.height+.5)]];
      for(let i=0;i<2;i++){
        const axis=layer.querySelector('[data-cetz-plane-axis="'+'XY'[i]+'"]'),values=axis.querySelector('path').getAttribute('d').match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi).map(Number);
        const a=project(plane.matrix,i?[0,ranges[i][0],0]:[ranges[i][0],0,0]),b=project(plane.matrix,i?[0,ranges[i][1],0]:[ranges[i][1],0,0]);
        values.forEach((value,j)=>assert.ok(Math.abs(value-a.concat(b)[j])<1e-6));assert.equal(axis.querySelector('text').textContent,'Local '+'XY'[i]);
      }
    }
    assert.equal(f.w.mxUtils.getXml(new f.w.mxCodec().encode(g.model)),xml,'local guides never change source or model');
  }
  const toggles=panel.querySelectorAll('.cetzWorkspaceToggle input'),grid=toggles[0],axisToggle=toggles[1];
  grid.checked=false;grid.dispatchEvent(new f.w.Event('change'));assert.equal(axes().style.display,'','local coordinates remain visible without the grid');
  axisToggle.checked=false;axisToggle.dispatchEvent(new f.w.Event('change'));assert.equal(axes().style.display,'none');
  axisToggle.checked=true;axisToggle.dispatchEvent(new f.w.Event('change'));assert.equal(axes().style.display,'');
});

for(const projection of ['ortho','perspective'])test(`plane manipulation in ${projection} previews XYZ movement and centered rotation and commits on release`,{skip},async t=>{
  const {planeCode}=require('../src/plane-editor'),project=require('../src/three-workspace').project;
  const source='#import "@preview/cetz:0.5.3"\n#cetz.canvas({cetz.draw.'+projection+'(x:20deg,y:30deg,{'+planeCode('','gui-plane-1',{kind:'xy',position:[1,2,3],angles:[0,0,0]},'cetz.draw.rect((0,0),(2,1),fill:red)')+'\ncetz.draw.line((0,0,0),(2,2,2))})})';
  const pointer=projection==='perspective',f=await fixture(t,source,{pointerEvents:pointer}),state={source,mode:'3d',key:'gui-plane-1',scene:{}};await loadWorkspaceScene(f,state,f.rendered);
  if(pointer){f.w.requestAnimationFrame=()=>123;f.w.cancelAnimationFrame=()=>{};}
  const send=(node,kind,x,y)=>pointer?node.dispatchEvent(new f.w.PointerEvent({down:'pointerdown',move:'pointermove',up:'pointerup'}[kind],{bubbles:true,cancelable:true,button:0,buttons:kind==='up'?0:1,pointerId:7,clientX:x,clientY:y})):f.send(node,kind,x,y);
  const choose=()=>{const plane=f.rendered.workspace.planes.find(p=>p.key===state.key);const cell=Object.values(f.graph.model.cells).find(cell=>/^cetz-edit-/.test(cell.id)&&Number(f.graph.getCellStyle(cell).cetzSourceIndex)===plane.wrapperIndex);f.graph.setSelectionCell(cell);return plane;};
  let plane=choose(),layer=()=>f.graph.view.getOverlayPane().querySelector('[data-cetz-plane-manipulator]');
  assert.ok(plane.parentMatrix);assert.ok(layer());assert.equal(layer().querySelectorAll('circle[r="5"][data-cetz-plane-handle^="rotate"]').length,3);
  let handle=layer().querySelector('circle[data-cetz-plane-handle="move-0"]'),x=+handle.getAttribute('cx'),y=+handle.getAttribute('cy');
  const bounds=plane.localBounds,pivot=[plane.position[0]+bounds.x+bounds.width/2,plane.position[1]+bounds.y+bounds.height/2,plane.position[2]],a=project(plane.parentMatrix,pivot),target=project(plane.parentMatrix,[pivot[0]+2,pivot[1],pivot[2]]);
  const dx=(target[0]-a[0])*f.graph.view.scale,dy=(target[1]-a[1])*f.graph.view.scale;
  const xml=()=>f.w.mxUtils.getXml(new f.w.mxCodec().encode(f.graph.model)),before=xml();
  send(handle,'down',x,y);send(f.w.document,'move',x+dx,y+dy);await waitForInspector(()=>f.graph.view.getOverlayPane().querySelector('[data-cetz-plane-preview]'));
  assert.equal(xml(),before,'plane preview is source/model neutral');let preview=f.graph.view.getOverlayPane().querySelector('[data-cetz-plane-preview]');assert.ok(preview);assert.equal(preview.getAttribute('data-cetz-plane-position'),'3,2,3');assert.ok(preview.querySelector('svg[data-cetz-live-preview]'));
  if(projection==='perspective')assert.ok(preview.querySelector('foreignObject'),'projective texture is warped without flattening');
  const guide=()=>f.graph.view.getOverlayPane().querySelector('[data-cetz-plane-axes]'),origin=()=>guide().querySelector('[data-cetz-plane-origin]');
  let projectedOrigin=project(plane.parentMatrix,[3,2,3]);assert.ok(Math.abs(+origin().getAttribute('cx')-projectedOrigin[0])<1e-5);assert.ok(Math.abs(+origin().getAttribute('cy')-projectedOrigin[1])<1e-5);
  send(f.w.document,'up',x+dx,y+dy);let action=await acceptWorkspaceUI(f,state);assert.equal(action.action,'plane-settings');plane=choose();assert.deepEqual(plane.position,[3,2,3]);assert.ok(state.source.includes('cetz.draw.rect((0,0),(2,1),fill:red)'));assert.ok(state.source.includes('cetz.draw.line((0,0,0),(2,2,2))'));
  handle=layer().querySelector('circle[r="5"][data-cetz-plane-handle="rotate-2"]');x=+handle.getAttribute('cx');y=+handle.getAttribute('cy');const center=layer().querySelector('circle[r="3"]'),cx=+center.getAttribute('cx'),cy=+center.getAttribute('cy');
  send(handle,'down',x,y);send(f.w.document,'move',cx-(y-cy),cy+(x-cx));await waitForInspector(()=>f.graph.view.getOverlayPane().querySelector('[data-cetz-plane-preview]'));preview=f.graph.view.getOverlayPane().querySelector('[data-cetz-plane-preview]');assert.equal(preview.getAttribute('data-cetz-plane-angles'),'0,0,90');
  const position=preview.getAttribute('data-cetz-plane-position').split(',').map(Number);projectedOrigin=project(plane.parentMatrix,position);assert.ok(Math.abs(+origin().getAttribute('cx')-projectedOrigin[0])<1e-5);assert.ok(Math.abs(+origin().getAttribute('cy')-projectedOrigin[1])<1e-5);
  send(f.w.document,'up',cx-(y-cy),cy+(x-cx));await acceptWorkspaceUI(f,state);plane=choose();assert.deepEqual(plane.angles,[0,0,90]);
  const centerBefore=[pivot[0]+2,pivot[1],pivot[2]],centerAfter=[plane.position[0]-(bounds.y+bounds.height/2),plane.position[1]+bounds.x+bounds.width/2,plane.position[2]];
  centerAfter.forEach((n,i)=>assert.ok(Math.abs(n-centerBefore[i])<1e-5,'rotation keeps the plane center fixed'));
  const original=xml();handle=layer().querySelector('circle[data-cetz-plane-handle="move-1"]');x=+handle.getAttribute('cx');y=+handle.getAttribute('cy');send(handle,'down',x,y);send(f.w.document,'move',x+40,y-20);await waitForInspector(()=>f.graph.view.getOverlayPane().querySelector('[data-cetz-plane-preview]'));
  f.w.document.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(xml(),original);assert.equal(f.graph.view.getOverlayPane().querySelector('[data-cetz-plane-preview]'),null);assert.ok(layer());
});

test('projection Properties and hierarchical Outline reorder planes, line and content without crossing views',{skip},async t=>{
  const {planeCode}=require('../src/plane-editor');
  const source='#import "@preview/cetz:0.5.3"\n#cetz.canvas({import cetz.draw: *\northo(x:20deg,y:30deg,{on-xy({rect((0,0),(2,1))})\nline((1,2,3),(2,3,4))\ncontent((2,1,3),"Label")\n'+planeCode('','gui-plane-1',{kind:'xz',position:[1,2,3],angles:[0,0,0]},'cetz.draw.circle((0,0),radius:1)')+'})\nperspective({line((0,0,0),(1,1,1))})})';
  const f=await fixture(t,source),state={source,mode:'3d',key:f.rendered.workspace.planes[0].key,scene:{}};await loadWorkspaceScene(f,state,f.rendered);
  const panel=f.ui.sidebar.wrapper;[...panel.querySelectorAll('.cetz3DWorkspace button')].find(b=>b.textContent==='Projection properties').click();assert.equal(f.graph.getCellStyle(f.graph.getSelectionCell()).cetzKind,'ortho');
  for(const key of ['x','y','z','sorted','cull-face','reset-transform','flatten'])assert.ok(panel.querySelector('[aria-label="'+key+'"]'));
  const sorted=panel.querySelector('[aria-label="sorted"]');sorted.value='false';sorted.dispatchEvent(new f.w.Event('input',{bubbles:true}));sorted.dispatchEvent(new f.w.Event('change',{bubbles:true}));await acceptWorkspaceUI(f,state);assert.ok(state.source.includes('sorted: false'));
  const row=index=>panel.querySelector('[data-cetz-outline-id="cetz-edit-'+f.rendered.cellIds[index]+'"]');
  let view=f.rendered.workspace.views[0];assert.equal(row(view.index).querySelector('.cetzOutlineGrip').draggable,false,'projection headers stay in place');
  let line=f.rendered.workspace.objects.find(o=>o.view===view.index&&o.kind==='line');const lineRow=row(line.index);assert.equal(lineRow.querySelector('.cetzOutlineGrip').draggable,true);assert.notEqual(lineRow.querySelector('[aria-label="Move layer down"]').style.display,'none');
  lineRow.querySelector('[aria-label="Move layer down"]').click();let action=await acceptWorkspaceUI(f,state);assert.equal(action.action,'move-after');assert.ok(state.source.indexOf('content((2,1,3)')<state.source.indexOf('line((1,2,3)'));
  let plane=f.rendered.workspace.planes.find(p=>!p.managed),target=f.rendered.workspace.planes.find(p=>p.managed),data={};
  const transfer={setData(type,value){data[type]=value;},getData(type){return data[type]||'';}};
  function dragEvent(type){const event=new f.w.MouseEvent(type,{bubbles:true,cancelable:true,clientY:1});Object.defineProperty(event,'dataTransfer',{value:transfer});return event;}
  row(plane.wrapperIndex).querySelector('.cetzOutlineGrip').dispatchEvent(dragEvent('dragstart'));row(target.wrapperIndex).dispatchEvent(dragEvent('dragover'));row(target.wrapperIndex).dispatchEvent(dragEvent('drop'));await acceptWorkspaceUI(f,state);
  assert.ok(state.source.indexOf('on-xy({rect(')>state.source.indexOf('gui-plane-1'));assert.ok(f.rendered.workspace.planes.some(p=>p.key===state.key),'active legacy plane identity follows a move');
  line=f.rendered.workspace.objects.find(o=>o.view===f.rendered.workspace.views[0].index&&o.kind==='line');const other=f.rendered.workspace.objects.find(o=>o.view===f.rendered.workspace.views[1].index);
  row(line.index).querySelector('.cetzOutlineGrip').dispatchEvent(dragEvent('dragstart'));row(other.index).dispatchEvent(dragEvent('drop'));
  assert.ok(!Object.values(f.graph.model.cells).some(cell=>/cetzAction=move-(?:before|after);/.test(cell.style||'')),'cross-projection drops are ignored');
});
