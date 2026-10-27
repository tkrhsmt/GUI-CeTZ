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
  w.mxLoadResources = false; w.mxLoadStylesheets = false;
  w.eval(fs.readFileSync(mxClient, 'utf8'));
  const graph = new w.mxGraph(w.document.getElementById('graph'));
  graph.getCompositeParent = cell => cell;
  const element = () => w.document.createElement('div');
  const palettes = {};
  const sidebar = { wrapper: element(), container: element(), palettes, sidebarTitles: true,
    addPaletteFunctions(id) { palettes[id] = [element(), element()]; },
    createVertexTemplateEntry() { return element; }, createEdgeTemplateEntry() { return element; } };
  sidebar.container.appendChild(sidebar.wrapper);
  const actions = { undo: { funct() {}, isEnabled() { return true; } },
    redo: { funct() {}, isEnabled() { return true; } },
    copy: { funct() {}, isEnabled() { return false; } },
    paste: { funct() {}, isEnabled() { return false; } } };
  const ui = { sidebar, editor: { graph, addListener(name, callback) { ui[name] = callback; } },
    actions: { get(name) { return actions[name]; } }, container: element(), formatContainer: element(),
    sidebarContainer: element(), menubarContainer: element(), toolbarContainer: element(),
    hsplitPosition: 0, formatWidth: 240, refresh() {},
    getCurrentFile() { return { getTitle() { return 'test.cetz-1.drawio'; }, getData() { return ''; } }; } };
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
  return { w, graph, ui, source, rendered, send, select, drag, imageDocument, initialHandler };
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
  const button = Array.from(f.ui.sidebar.wrapper.querySelectorAll('button')).find(button => button.textContent.startsWith('line pos:'));
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
  assert.equal(handler, f.initialHandler, 'the native selection handler is reused');
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
