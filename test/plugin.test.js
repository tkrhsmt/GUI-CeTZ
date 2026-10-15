'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { MARK_NAMES } = require('../src/marks');

test('CeTZ hides unrelated palettes without hiding editor controls and restores them afterward', () => {
  function element(display = '') {
    return {
      style: { display }, children: [], parentNode: null,
      appendChild(child) { this.children.push(child); child.parentNode = this; },
      insertBefore(child) { this.appendChild(child); },
      addEventListener(name, callback) { this.listeners ||= {}; this.listeners[name] = callback; }
    };
  }
  const wrapper = element(), container = element(), menubarContainer = element('block');
  const moreShapes = element('flex');
  moreShapes.className = 'geSidebarFooter';
  container.querySelector = selector => selector === '.geSidebarFooter' ? moreShapes : null;
  container.appendChild(wrapper);
  container.appendChild(moreShapes);
  const toolbarContainer = element('flex'), formatContainer = element('block');
  const palettes = {
    general: [element(''), element('block')],
    scratchpad: [element(''), element('')]
  };
  const vertexTemplates = [];
  let fileTitle = 'example.cetz-1.drawio', preview = false, editablePreview = false;
  let graphEnabled = false;
  let fileLoaded;
  let selectionChanged, modelChanged, selectedCell = null, changedStyle = null, snappedBounds = null;
  const removedTemplates = [];
  const editCell = { id: 'cetz-edit-0', style: 'cetzKind=arc;cetzFillColor=#ffffff;cetzStrokeColor=#000000;cetzStrokeWidth=1;cetzDash=solid;cetzSnapOffsetX=35;cetzSnapOffsetY=20;' };
  const lineCell = { id: 'cetz-edit-1', style: 'cetzKind=line;cetzFillColor=#ffffff;cetzStrokeColor=#000000;cetzStrokeWidth=1;cetzDash=solid;cetzStartMark=none;cetzEndMark=triangle;' };
  const pointCell = { id: 'cetz-point-0-1', style: 'ellipse;' };
  const backgroundCell = { id: 'cetz-preview-background', style: 'cetzOriginX=500;cetzOriginY=500;cetzUnitX=40;cetzUnitY=40;' };
  const previewImageCell = { id: 'cetz-preview-image', style: 'image=before;' };
  const graphModel = { cells: {}, getCell(id) {
    if (this.cells[id]) return this.cells[id];
    if (preview && id === 'preview-image') return {};
    if (editablePreview && id === 'cetz-preview-background') return backgroundCell;
    return editablePreview && id === editCell.id ? editCell : editablePreview && id === lineCell.id ? lineCell : null;
  },
  contains(cell) { return !!cell && this.cells[cell.id] === cell; },
  isEdge() { return false; }, addListener(name, callback) { if (name === 'change') modelChanged = callback; },
  beginUpdate() {}, endUpdate() {} };
  const graph = {
    view: { scale: 1, translate: { x: 0, y: 0 } },
    getModel() { return graphModel; }, getSelectionCell() { return selectedCell; },
    getSelectionCells() { return selectedCell ? [selectedCell] : []; },
    getCellStyle(cell) { return Object.fromEntries(cell.style.split(';').filter(Boolean).map(part => part.split('='))); },
    setCellStyles(key, value, cells) { changedStyle = { key, value, cells }; },
    snapDelta(delta, bounds) { snappedBounds = bounds; return delta; },
    getSelectionModel() { return { addListener(name, callback) { selectionChanged = callback; } }; },
    isCellDeletable() { return true; }, isCellSelectable() { return true; },
    isCellCloneable() { return true; },
    isCellVisible() { return true; },
    isCellConnectable() { return true; },
    removeCells(cells) { removedTemplates.push(...cells); for (const cell of cells) delete graphModel.cells[cell.id]; },
    setEnabled(value) { graphEnabled = value; },
    popupMenuHandler: { isEnabled() { return true; } }
  };
  const originalHint = function () { this.hint = { textContent: 'Draw.io coordinates' }; };
  graph.graphHandler = { graph, updateHint: originalHint, bounds: { x: 533, y: 453 },
    currentDx: 0, currentDy: 0 };
  const actions = { undo: { funct() {}, isEnabled() { return true; } },
    redo: { funct() {}, isEnabled() { return true; } } };
  const ui = {
    sidebar: {
      wrapper, container, palettes,
      addPaletteFunctions(id) { palettes[id] = [element(), element()]; },
      createVertexTemplateEntry(style, width, height, value, title) {
        vertexTemplates.push({ style, width, height, value, title });
        return function () {};
      },
      createEdgeTemplateEntry() { return function () {}; }
    },
    editor: { graph, addListener(name, callback) { if (name === 'fileLoaded') fileLoaded = callback; } },
    actions: { get(name) { return actions[name]; } },
    menubar: { container: menubarContainer, addMenu() {
      const menu = element(); menubarContainer.appendChild(menu); return menu;
    } },
    menubarContainer, toolbarContainer, formatContainer,
    getCurrentFile() { return { getTitle() { return fileTitle; }, getData() { return ''; } }; },
    refresh() { graphEnabled = false; }
  };
  const context = {
    Draw: { loadPlugin(callback) { callback(ui); } },
    document: { createElement() { return element(); } },
    MutationObserver: class { observe() {} }, setTimeout(callback) { callback(); }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/cetz-drawio-plugin.js'), 'utf8'), context);

  const icons = vertexTemplates.filter(entry => entry.style.startsWith('shape=image;'));
  assert.equal(icons.length, 10);
  assert.equal(new Set(icons.map(entry => entry.style)).size, 10);
  for (const icon of icons) {
    assert.match(icon.style, new RegExp(`cetzTemplate=${icon.title};`));
    const image = /image=(data:image\/svg\+xml,[^;]+);/.exec(icon.style)?.[1];
    assert.ok(image, icon.title);
    assert.match(decodeURIComponent(image), /<svg[^>]+viewBox="0 0 64 48"/);
  }
  assert.equal(palettes.general[0].style.display, 'none');
  assert.equal(palettes.general[1].style.display, 'none');
  assert.equal(palettes.scratchpad[0].style.display, 'none');
  assert.equal(palettes['cetz-primitives'][0].style.display, '');
  assert.equal(palettes['cetz-preview-primitives'][0].style.display, 'none');
  assert.equal(palettes['cetz-advanced'][0].style.display, '');
  assert.equal(toolbarContainer.style.display, 'flex');
  assert.equal(formatContainer.style.display, 'block');
  assert.equal(menubarContainer.style.display, 'block');
  assert.equal(moreShapes.style.display, 'none');
  assert.equal(graphEnabled, true);

  preview = true;
  fileLoaded();
  assert.equal(palettes['cetz-primitives'][0].style.display, 'none');
  assert.equal(palettes['cetz-preview-primitives'][0].style.display, '');
  assert.equal(palettes['cetz-preview-primitives'][1].style.display, '');
  assert.equal(palettes.general[0].style.display, 'none');
  assert.equal(graphEnabled, true);

  preview = false;
  editablePreview = true;
  graphModel.cells[editCell.id] = editCell;
  graphModel.cells[previewImageCell.id] = previewImageCell;
  selectedCell = pointCell;
  fileLoaded();
  selectionChanged();
  const controls = wrapper.children[0];
  assert.equal(controls.style.display, '');
  assert.equal(controls.children[0].style.display, 'none');
  assert.equal(controls.children[1].style.display, '');
  const strokeInput = controls.children[1].children[1];
  strokeInput.value = '#ff0000';
  strokeInput.listeners.change();
  assert.equal(changedStyle.key, 'cetzStrokeColor');
  assert.equal(changedStyle.value, '#ff0000');
  assert.equal(changedStyle.cells[0], editCell);
  selectedCell = lineCell;
  selectionChanged();
  const markStart = controls.children[6].children[1];
  const markEnd = controls.children[7].children[1];
  assert.equal(controls.children[6].style.display, '');
  assert.equal(controls.children[7].style.display, '');
  assert.equal(markStart.children.length, 18);
  assert.deepEqual(markStart.children.slice(1, -1).map(option => option.value), MARK_NAMES);
  assert.equal(markEnd.value, 'triangle');
  markStart.value = 'curved-stealth';
  markStart.listeners.change();
  assert.equal(changedStyle.key, 'cetzStartMark');
  assert.equal(changedStyle.value, 'curved-stealth');
  selectedCell = pointCell;
  graph.snapDelta({ x: 0, y: 0 }, { x: 10, y: 20, width: 14, height: 14 });
  assert.equal(snappedBounds.x, 17);
  assert.equal(snappedBounds.y, 27);
  graph.graphHandler.updateHint();
  assert.equal(graph.graphHandler.hint.textContent, 'CeTZ (1, 1)');
  graph.view.scale = 2;
  graph.view.translate = { x: 3, y: -2 };
  graph.graphHandler.bounds = { x: 1072, y: 902 };
  graph.graphHandler.currentDx = 20;
  graph.graphHandler.updateHint();
  assert.equal(graph.graphHandler.hint.textContent, 'CeTZ (1.25, 1)');
  assert.equal(graph.isCellSelectable({ id: 'cetz-axis-x' }), false);
  assert.equal(graph.isCellSelectable({ id: 'cetz-origin-dot' }), false);
  assert.equal(graph.isCellSelectable({ id: 'cetz-preview-image' }), false);
  assert.equal(graph.isCellSelectable(pointCell), true);
  assert.equal(graph.isCellCloneable({ style: 'ellipse;cetzTemplate=circle;' }), true);
  assert.equal(graph.isCellCloneable(editCell), false);
  const pendingTemplate = { id: 'palette-circle', style: 'ellipse;cetzTemplate=circle;' };
  graphModel.cells[pendingTemplate.id] = pendingTemplate;
  assert.equal(graph.isCellVisible(pendingTemplate), false);
  assert.equal(graph.isCellVisible({ style: pendingTemplate.style }), true);
  assert.equal(graph.isCellSelectable(pendingTemplate), false);
  assert.equal(graph.isCellCloneable(pendingTemplate), false);
  modelChanged();
  assert.equal(removedTemplates.length, 0);
  graphModel.cells['cetz-edit-1'] = { id: 'cetz-edit-1', style: 'cetzKind=circle;' };
  previewImageCell.style = 'image=after;';
  modelChanged();
  assert.deepEqual(removedTemplates, [pendingTemplate]);
  assert.equal(graphModel.cells[pendingTemplate.id], undefined);
  assert.equal(graph.isCellDeletable({ id: 'cetz-axis-y' }), false);
  assert.equal(graph.isCellDeletable({ id: 'cetz-preview-image' }), false);
  graph.view.scale = 1;
  graph.view.translate = { x: 0, y: 0 };
  selectedCell = editCell;
  graph.snapDelta({ x: 0, y: 0 }, { x: 10, y: 20, width: 40, height: 40 });
  assert.equal(snappedBounds.x, 45);
  assert.equal(snappedBounds.y, 40);

  fileTitle = 'ordinary.drawio';
  preview = false;
  editablePreview = false;
  selectedCell = null;
  fileLoaded();
  assert.equal(palettes.general[0].style.display, '');
  assert.equal(palettes.general[1].style.display, 'block');
  assert.equal(palettes.scratchpad[0].style.display, '');
  assert.equal(palettes['cetz-primitives'][0].style.display, 'none');
  assert.equal(palettes['cetz-preview-primitives'][0].style.display, 'none');
  assert.equal(palettes['cetz-advanced'][0].style.display, 'none');
  assert.equal(moreShapes.style.display, 'flex');
  assert.equal(graph.graphHandler.updateHint, originalHint);
  assert.equal(graph.isCellSelectable({ id: 'cetz-axis-x' }), true);
  graph.snapDelta({ x: 0, y: 0 }, { x: 10, y: 20 });
  assert.equal(snappedBounds.x, 10);
  assert.equal(graphEnabled, true);
});
