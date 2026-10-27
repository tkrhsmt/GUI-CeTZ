'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { MARK_NAMES } = require('../src/marks');

test('Draw.io HTML template embeds the complete CeTZ plugin without replacement expansion', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/cetz-drawio-plugin.js'), 'utf8');
  const template = '<script>const plugins = $$additionalCode$$;</script><body>Loading...</body>';
  const serialized = JSON.stringify([source]);
  const marker = '$$additionalCode$$';
  const offset = template.indexOf(marker);
  assert.equal(template.replace(marker, serialized),
    template.slice(0, offset) + serialized + template.slice(offset + marker.length));
});

test('CeTZ shows supported controls and restores standard Draw.io chrome afterward', () => {
  function element(display = '') {
    return {
      style: { display }, children: [], parentNode: null,
      appendChild(child) { this.children.push(child); child.parentNode = this; },
      insertBefore(child) { this.appendChild(child); },
      contains(child) { for (; child; child = child.parentNode) if (child === this) return true; return false; },
      setAttribute(name, value) { this[name] = value; },
      addEventListener(name, callback) { this.listeners ||= {}; this.listeners[name] = callback; }
    };
  }
  const wrapper = element(), container = element(), menubarContainer = element('block');
  const moreShapes = element('flex');
  moreShapes.className = 'geSidebarFooter';
  container.querySelector = selector => selector === '.geSidebarFooter' ? moreShapes : null;
  container.appendChild(wrapper);
  container.appendChild(moreShapes);
  const sidebarPanel = element();
  const libraryButton = element('inline-block');
  libraryButton.className = 'geButton';
  sidebarPanel.appendChild(libraryButton);
  sidebarPanel.appendChild(container);
  const toolbarContainer = element('flex'), formatContainer = element('block');
  const palettes = {
    general: [element(''), element('block')],
    scratchpad: [element(''), element('')]
  };
  const vertexTemplates = [], edgeTemplates = [], paletteFns = {};
  let paletteAdds = 0;
  let fileTitle = 'example.cetz-1.drawio', fileData = '', preview = false, editablePreview = false;
  let graphEnabled = false, rulerDestroyed = false, rulerVisible = false;
  let tooltipArgs;
  let fileLoaded;
  let selectionChanged, modelChanged, selectedCell = null, changedStyle = null, snappedBounds = null;
  let highlightedCell = null, insertedAction = null;
  let fitCalls = 0, viewValidations = 0;
  const imageLoads = [];
  const dragShapes = [];
  const cellStates = new Map();
  let nativePreviewCalls = 0, nativeResetCalls = 0;
  let deferTimeout = false;
  const pendingTimeouts = [];
  const mutationObservers = [];
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
    view: { scale: 1, translate: { x: 0, y: 0 }, getOverlayPane() { return {}; },
      invalidate() {}, validate() { viewValidations++; },
      getState(cell) { return cellStates.get(cell.id) ||
        { cell, x: 12, y: 24, width: 50, height: 30, style: {}, view: this }; } },
    getModel() { return graphModel; }, getSelectionCell() { return selectedCell; },
    getSelectionCells() { return selectedCell ? [selectedCell] : []; },
    setSelectionCell(cell) { selectedCell = cell; },
    getDefaultParent() { return { id: '1' }; },
    insertVertex(parent, id, value, x, y, width, height, style) {
      insertedAction = style; return { parent, id, style };
    },
    getCellStyle(cell) { return Object.fromEntries(cell.style.split(';').filter(Boolean).map(part => part.split('='))); },
    setCellStyles(key, value, cells) { changedStyle = { key, value, cells }; },
    snapDelta(delta, bounds) { snappedBounds = bounds; return delta; },
    getSelectionModel() { return { addListener(name, callback) { selectionChanged = callback; } }; },
    isCellDeletable() { return true; }, isCellSelectable() { return true; },
    isCellCloneable() { return true; },
    isCellVisible() { return true; },
    isCellConnectable() { return true; },
    isConstrainChild() { return true; },
    removeCells(cells) { removedTemplates.push(...cells); for (const cell of cells) delete graphModel.cells[cell.id]; },
    setEnabled(value) { graphEnabled = value; },
    popupMenuHandler: { isEnabled() { return true; } }
  };
  const originalHint = function () { this.hint = { textContent: 'Draw.io coordinates' }; };
  const originalUseGuides = function () { return true; };
  graph.graphHandler = { graph, updateHint: originalHint, bounds: { x: 533, y: 453 },
    currentDx: 0, currentDy: 0, useGuidesForEvent: originalUseGuides, maxLivePreview: 17,
    allowLivePreview: false,
    updatePreview() { nativePreviewCalls++; return 'native-preview'; },
    reset() { nativeResetCalls++; return 'native-reset'; } };
  const originalPreview = graph.graphHandler.updatePreview, originalReset = graph.graphHandler.reset;
  class VertexHandler {}
  const originalVertexHint = function () { this.hint = { textContent: 'Draw.io size' }; };
  VertexHandler.prototype.updateHint = originalVertexHint;
  const actions = { undo: { funct() {}, isEnabled() { return true; } },
    redo: { funct() {}, isEnabled() { return true; } },
    fitWindow: { funct() { fitCalls++; } } };
  const ui = {
    sidebar: {
      wrapper, container, palettes, sidebarTitles: true,
      addPaletteFunctions(id, title, expanded, fns) {
        paletteAdds++;
        palettes[id] = [element(), element()]; paletteFns[id] = fns;
      },
      createVertexTemplateEntry(style, width, height, value, title) {
        vertexTemplates.push({ style, width, height, value, title });
        return function () { return element(); };
      },
      createEdgeTemplateEntry(style, width, height, value, title) {
        edgeTemplates.push({ style, width, height, value, title });
        return function () { return element(); };
      },
      showTooltip(...args) { tooltipArgs = args; },
      getTooltipOffset() { return { x: 12, y: 34 }; },
      tooltip: { offsetWidth: 140, offsetHeight: 100, style: {} }
    },
    editor: { graph, addListener(name, callback) { if (name === 'fileLoaded') fileLoaded = callback; } },
    actions: { get(name) { return actions[name]; } },
    menubar: { container: menubarContainer, addMenu() {
      const menu = element(); menu.className = 'geMenubar'; menubarContainer.appendChild(menu); return menu;
    } },
    container: element(), menubarContainer, toolbarContainer, formatContainer,
    sidebarContainer: element(), hsplitPosition: 0, formatWidth: 240,
    toggleShapesPanel(visible) { this.hsplitPosition = visible ? 232 : 0; this.refresh(); },
    toggleFormatPanel(visible) { this.formatWidth = visible ? 240 : 0; this.refresh(); },
    tabContainer: element('flex'),
    updateTabContainer() { this.tabContainer.style.display = 'flex'; },
    ruler: { destroy() { rulerDestroyed = true; } },
    setRulerVisible(value) { rulerVisible = value; this.ruler = value ? { destroy() {} } : null; },
    getCurrentFile() { return { getTitle() { return fileTitle; }, getData() { return fileData; } }; },
    refresh() {
      this.sidebarContainer.style.width = this.hsplitPosition + 'px';
      this.formatContainer.style.width = this.formatWidth > 0 ? '' : '0';
    }
  };
  const standardMenu = element('inline-block');
  // Draw.io changes standard menu elements from geMenubar to geItem after creation.
  standardMenu.className = 'geItem';
  menubarContainer.appendChild(standardMenu);
  const statusContainer = element('flex');
  menubarContainer.appendChild(statusContainer);
  ui.statusContainer = statusContainer;
  const context = {
    Image: class { set src(value) { this.url = value; imageLoads.push(this); } },
    mxImageShape: class {
      constructor(bounds, image) { Object.assign(this, { bounds, image }); dragShapes.push(this); }
      init(pane) { this.pane = pane; }
      redraw() { this.redraws = (this.redraws || 0) + 1; }
      destroy() { this.destroyed = true; }
    },
    Draw: { loadPlugin(callback) { callback(ui); } },
    document: { createElement() { return element(); }, addEventListener() {} },
    mxCell: class { constructor(value, geometry, style) {
      this.value = value; this.geometry = geometry; this.style = style;
    } },
    mxGeometry: class { constructor(x, y, width, height) {
      Object.assign(this, { x, y, width, height });
    } },
    mxRectangle: class { constructor(x, y, width, height) {
      Object.assign(this, { x, y, width, height });
    } },
    mxRectangleShape: class {
      constructor(bounds, fill, stroke, strokeWidth) { Object.assign(this, { bounds, fill, stroke, strokeWidth }); }
      init(pane) { this.pane = pane; }
      redraw() { this.redrawn = true; }
    },
    mxConstants: { DIALECT_SVG: 'svg' },
    mxVertexHandler: VertexHandler,
    mxCellHighlight: class {
      createShape() { return { redraw() { this.redrawn = true; } }; }
      repaint() { this.shape.outline = true; }
      highlight(state) {
        highlightedCell = state && state.cell;
        this.state = state;
        this.shape = state ? this.createShape() : null;
        if (state) this.repaint();
        context.activeHighlight = this;
      }
    },
    mxEvent: { LABEL_HANDLE: -1, ROTATION_HANDLE: -2 },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; mutationObservers.push(this); }
      observe(target) { this.target = target; }
    }, setTimeout(callback) {
      if (deferTimeout) pendingTimeouts.push(callback);
      else callback();
    },
    setInterval(callback) { context.pollStatus = callback; }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/cetz-drawio-plugin.js'), 'utf8'), context);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/cetz-drawio-plugin.js'), 'utf8'), context);
  assert.equal(paletteAdds, 3);
  assert.equal(ui.hsplitPosition, 300);
  assert.equal(ui.formatWidth, 48);
  assert.equal(formatContainer.style.width, '48px');
  assert.equal(formatContainer.style.minWidth, '48px');
  assert.equal(formatContainer.style.maxWidth, '48px');
  assert.equal(formatContainer.style.overflowY, 'hidden');
  assert.equal(ui.sidebarContainer.style.width, '300px');
  assert.equal(ui.sidebarContainer.style.display, '');
  assert.equal(formatContainer.children[0].className, 'cetzRightRail');
  ui.toggleShapesPanel(false);
  assert.equal(ui.hsplitPosition, 300);
  ui.toggleFormatPanel(true);
  assert.equal(ui.formatWidth, 48);
  ui.refresh();
  assert.equal(formatContainer.style.width, '48px');
  assert.match(formatContainer.children[0].children[0].style.cssText, /scrollbar-width:none/);

  const icons = vertexTemplates.filter(entry => entry.style.startsWith('shape=image;'));
  assert.equal(icons.length, 10);
  assert.equal(new Set(icons.map(entry => entry.style)).size, 10);
  for (const icon of icons) {
    assert.match(icon.style, new RegExp(`cetzTemplate=${icon.title};`));
    const image = /image=(data:image\/svg\+xml,[^;]+);/.exec(icon.style)?.[1];
    assert.ok(image, icon.title);
    assert.match(decodeURIComponent(image), /<svg[^>]+viewBox="0 0 64 48"/);
  }
  for (const palette of ['cetz-primitives', 'cetz-preview-primitives']) {
    const entries = paletteFns[palette].map(factory => factory());
    const images = entries.map(entry => entry.children[0].src);
    assert.equal(new Set(images).size, 4);
    assert.ok(images.every(src => src.startsWith('data:image/svg+xml,')));
    assert.ok(images.every(src => decodeURIComponent(src).includes('stroke="#2563eb"')));
    assert.ok(entries.every(entry => entry.renderThumbFn && entry.children[0].draggable === false));
    assert.ok(entries.every(entry => entry.children.length === 1 && entry['aria-label']));
    assert.ok(entries.every(entry => entry.title === ''));
    ui.sidebar.showTooltip(entries[0], [{ style: 'original' }], 120, 80, 'rect', true);
    assert.match(tooltipArgs[1][0].style, /^shape=image;imageAspect=1;image=data:image\/svg\+xml,/);
    assert.equal(tooltipArgs[2], 80);
    assert.equal(tooltipArgs[3], 60);
    assert.equal(tooltipArgs[5], false);
    assert.equal(tooltipArgs[6], null);
    entries[0].getBoundingClientRect = () => ({ left: 900, top: 200, width: 44, height: 38 });
    const offset = ui.sidebar.getTooltipOffset(entries[0], { width: 80, height: 60 });
    assert.equal(offset.x, 752);
    assert.equal(offset.y, 169);
    assert.deepEqual(ui.sidebar.getTooltipOffset({}, { width: 80, height: 60 }), { x: 12, y: 34 });
  }
  assert.match(vertexTemplates[0].style, /^rounded=0;/);
  assert.match(vertexTemplates[3].style, /cetzTemplate=rect;/);
  assert.match(edgeTemplates[0].style, /^rounded=0;html=1;/);
  assert.match(edgeTemplates[1].style, /cetzTemplate=line;/);
  assert.equal(palettes.general[0].style.display, 'none');
  assert.equal(palettes.general[1].style.display, 'none');
  assert.equal(palettes.scratchpad[0].style.display, 'none');
  assert.equal(palettes['cetz-primitives'][0].style.display, 'none');
  assert.equal(palettes['cetz-primitives'][1].style.display, '');
  assert.equal(palettes['cetz-preview-primitives'][0].style.display, 'none');
  assert.equal(palettes['cetz-advanced'][0].style.display, 'none');
  assert.equal(palettes['cetz-advanced'][1].style.display, '');
  assert.equal(toolbarContainer.style.display, 'none');
  assert.equal(formatContainer.style.display, '');
  assert.equal(ui.tabContainer.style.display, 'none');
  assert.equal(ui.container.children[0].style.display, 'none');
  ui.updateTabContainer();
  assert.equal(ui.tabContainer.style.display, 'none');
  fileData = '<mxfile host="GUI-CeTZ" cetzStatus="' + encodeURIComponent('invalid syntax\nline 3') + '">';
  context.pollStatus();
  assert.equal(ui.container.children[0].textContent, 'CeTZ error: invalid syntax\nline 3');
  assert.equal(ui.container.children[0].style.display, 'block');
  fileData = '<mxfile host="GUI-CeTZ">';
  context.pollStatus();
  assert.equal(ui.container.children[0].style.display, 'none');
  assert.equal(menubarContainer.style.display, 'block');
  assert.equal(standardMenu.style.display, 'none');
  assert.equal(statusContainer.style.display, 'flex');
  assert.equal(libraryButton.style.display, 'none');
  assert.equal(rulerDestroyed, true);
  assert.equal(ui.ruler, null);
  ui.setRulerVisible(true);
  assert.equal(ui.ruler, null);
  assert.equal(moreShapes.style.display, 'none');
  assert.equal(graphEnabled, true);

  preview = true;
  fileLoaded();
  assert.equal(palettes['cetz-primitives'][0].style.display, 'none');
  assert.equal(palettes['cetz-preview-primitives'][0].style.display, 'none');
  assert.equal(palettes['cetz-preview-primitives'][1].style.display, '');
  assert.equal(palettes.general[0].style.display, 'none');
  assert.equal(graphEnabled, true);

  preview = false;
  editablePreview = true;
  graphModel.cells[editCell.id] = editCell;
  graphModel.cells[previewImageCell.id] = previewImageCell;
  selectedCell = editCell;
  fileLoaded();
  const contextItems = [];
  graph.popupMenuHandler.factoryMethod({ addItem(label) { contextItems.push(label); }, addSeparator() {} }, editCell);
  assert.ok(contextItems.includes('Duplicate'));
  assert.ok(contextItems.includes('Go to Typst call'));
  assert.ok(contextItems.includes('Export PDF, SVG or PNG'));
  selectedCell = null;
  graphModel.cells['cetz-select-123'] = { id: 'cetz-select-123', style: 'cetzSelect=0;' };
  modelChanged();
  assert.equal(selectedCell, editCell);
  selectedCell = pointCell;
  fileLoaded();
  selectionChanged();
  assert.match(insertedAction, /cetzAction=select;cetzTargets=0;/,
    'selecting a point selects its owning source call');
  insertedAction = null;
  selectionChanged();
  assert.equal(insertedAction, null, 'repeated selection does not notify again');
  const controls = wrapper.children[0];
  const rail = formatContainer.children[0];
  assert.equal(rail.children[0].children.includes(palettes['cetz-preview-primitives'][1]), true);
  assert.equal(rail.children[0].children.includes(palettes['cetz-advanced'][1]), true);
  assert.match(palettes['cetz-advanced'][1].style.cssText, /flex-direction:column/);
  assert.match(palettes['cetz-advanced'][1].style.cssText, /padding:0/);
  assert.equal(wrapper.children.includes(controls), true);
  assert.equal(controls.style.display, '');
  assert.match(controls.style.cssText, /box-sizing:border-box;width:100%/);
  assert.match(controls.children[1].style.cssText, /grid-template-columns:76px minmax\(0,1fr\)/);
  assert.match(controls.children[1].children[1].style.cssText, /max-width:100%/);
  assert.equal(controls.children[0].style.display, 'none');
  assert.equal(controls.children[1].style.display, 'grid');
  assert.equal(controls.children[2].style.display, 'grid');
  assert.equal(controls.children.some(child => child.textContent === 'Layer order'), false);
  const anchorCell = { id: 'cetz-edit-3', style: 'cetzKind=anchor;cetzLabel=very_long_anchor_name_that_needs_wrapping;' };
  graphModel.cells[anchorCell.id] = anchorCell;
  selectedCell = anchorCell;
  selectionChanged();
  assert.match(insertedAction, /cetzAction=select;cetzTargets=3;/);
  const anchorRow = controls.children.find(child => child.children.some(item => item['aria-label'] === 'Anchor name'));
  assert.equal(anchorRow.style.display, '');
  assert.match(anchorRow.children[0].style.cssText, /max-width:100%/);
  assert.match(anchorRow.children[1].style.cssText, /max-width:100%/);
  assert.ok(controls.children.some(child => /overflow-wrap:anywhere/.test(child.style.cssText) &&
    /very_long_anchor_name/.test(child.textContent)));
  const fromAnchorRow = controls.children.find(child => child.textContent === 'From anchor ');
  assert.match(fromAnchorRow.style.cssText, /grid-template-columns:minmax\(0,1fr\)/);
  assert.match(fromAnchorRow.children[0].style.cssText, /max-width:100%/);
  delete graphModel.cells[anchorCell.id];
  selectedCell = pointCell;
  selectionChanged();
  const rotateRight = controls.children.find(child => child.textContent === '↻ 15°');
  rotateRight.listeners.click({ stopPropagation() {} });
  assert.match(insertedAction, /cetzAction=rotate;cetzTargets=0;cetzValue=15;/);
  const sizeRow = controls.children.find(child => child.children.some(item => item.type === 'range'));
  const sizeSlider = sizeRow.children.find(item => item.type === 'range');
  sizeSlider.value = '1.5'; sizeSlider.listeners.change();
  assert.match(insertedAction, /cetzAction=scale;cetzTargets=0;cetzValue=1.5;/);
  const strokeInput = controls.children[1].children[1];
  strokeInput.value = '#ff0000';
  strokeInput.listeners.change();
  assert.equal(changedStyle.key, 'cetzStrokeColor');
  assert.equal(changedStyle.value, '#ff0000');
  assert.equal(changedStyle.cells[0], editCell);
  selectedCell = lineCell;
  selectionChanged();
  editCell.style += 'cetzStart=10;';
  lineCell.style += 'cetzStart=20;';
  lineCell.geometry = { x: 500, y: 503, width: 440, height: 14 };
  graphModel.cells[lineCell.id] = lineCell;
  graphModel.cells['cetz-point-1-0'] = { id: 'cetz-point-1-0',
    geometry: { x: 493, y: 503, width: 14, height: 14 } };
  graphModel.cells['cetz-point-1-1'] = { id: 'cetz-point-1-1',
    geometry: { x: 933, y: 503, width: 14, height: 14 } };
  selectionChanged();
  const outline = wrapper.children[1];
  const rows = outline.children.filter(child => child.className === 'cetzOutlineList').at(-1).children.slice(-2);
  assert.match(outline.style.cssText, /border-bottom:1px solid/);
  assert.equal(rows[1].children[1].title, 'line pos: (0, -0.25) size: 11');
  const sidebarObserver = mutationObservers.find(observer => observer.target === container);
  deferTimeout = true;
  sidebarObserver.callback([{ target: outline }]);
  assert.equal(pendingTimeouts.length, 0);
  sidebarObserver.callback([{ target: container }]);
  assert.equal(pendingTimeouts.length, 1);
  pendingTimeouts.splice(0);
  deferTimeout = false;
  rows[0].listeners.mouseenter();
  assert.equal(highlightedCell, null, 'outline hover does not draw a native rectangle');
  rows[0].listeners.mouseleave();
  assert.equal(highlightedCell, null);
  deferTimeout = true;
  rows[0].children[1].listeners.click({ preventDefault() {}, stopPropagation() {} });
  assert.equal(selectedCell, lineCell);
  deferTimeout = false;
  pendingTimeouts.splice(0).forEach(callback => callback());
  assert.equal(selectedCell, editCell);
  assert.equal(rows[0].draggable, false);
  assert.equal(rows[0].children[0].draggable, true);
  rows[0].children[3].listeners.click({ stopPropagation() {} });
  assert.match(insertedAction, /cetzAction=move-after;cetzTargets=0,1;/);
  rows[0].offsetHeight = 20;
  rows[1].children[0].listeners.dragstart({ stopPropagation() {}, dataTransfer: { setData() {} } });
  rows[0].listeners.dragover({ preventDefault() {}, stopPropagation() {}, offsetY: 2 });
  assert.equal(rows[0].style.boxShadow, 'inset 0 3px 0 #2563eb');
  rows[0].listeners.dragover({ preventDefault() {}, stopPropagation() {}, offsetY: 18 });
  assert.equal(rows[0].style.boxShadow, 'inset 0 -3px 0 #2563eb');
  rows[0].listeners.dragleave({ relatedTarget: null });
  assert.equal(rows[0].style.boxShadow, '');
  rows[0].listeners.drop({ preventDefault() {}, stopPropagation() {}, offsetY: 2,
    dataTransfer: { getData() { return 'cetz:1'; } } });
  assert.match(insertedAction, /cetzAction=move-before;cetzTargets=1,0;/);
  delete graphModel.cells[lineCell.id];
  selectedCell = lineCell;
  selectionChanged();
  const markStart = controls.children[6].children[1];
  const markEnd = controls.children[7].children[1];
  assert.equal(controls.children[6].style.display, 'grid');
  assert.equal(controls.children[7].style.display, 'grid');
  assert.equal(markStart.children.length, 18);
  assert.deepEqual(markStart.children.slice(1, -1).map(option => option.value), MARK_NAMES);
  assert.equal(markEnd.value, 'triangle');
  markStart.value = 'curved-stealth';
  markStart.listeners.change();
  assert.equal(changedStyle.key, 'cetzStartMark');
  assert.equal(changedStyle.value, 'curved-stealth');
  selectedCell = pointCell;
  assert.equal(graph.graphHandler.useGuidesForEvent(), true);
  const pointSnap = graph.snapDelta({ x: 16, y: -7 }, { x: 533, y: 453, width: 14, height: 14 });
  assert.equal(pointSnap.x, 20);
  assert.equal(pointSnap.y, -10);
  graphModel.cells['cetz-edit-2'] = { id: 'cetz-edit-2', style: 'cetzKind=content;cetzAngle=0;' };
  selectedCell = { id: 'cetz-point-2-0', style: 'ellipse;' };
  const contentSnap = graph.snapDelta({ x: 16, y: -7 }, { x: 533, y: 453, width: 14, height: 14 });
  assert.equal(contentSnap.x, 20);
  assert.equal(contentSnap.y, -10);
  graphModel.cells['cetz-edit-2'].style = 'cetzKind=content;cetzAngle=45;cetzRotationCx=0;cetzRotationCy=0;';
  const rotatedSnap = graph.snapDelta({ x: 16, y: -7 }, { x: 533, y: 453, width: 14, height: 14 });
  const rotatedX = (533 + rotatedSnap.x + 7 - 500) / 40;
  const rotatedY = (500 - 453 - rotatedSnap.y - 7) / 40;
  const radians = Math.PI / 4;
  const localX = rotatedX * Math.cos(radians) + rotatedY * Math.sin(radians);
  const localY = -rotatedX * Math.sin(radians) + rotatedY * Math.cos(radians);
  assert.ok(Math.abs(localX * 4 - Math.round(localX * 4)) < 0.00001);
  assert.ok(Math.abs(localY * 4 - Math.round(localY * 4)) < 0.00001);
  assert.equal(snappedBounds, null);
  selectedCell = { id: 'cetz-point-0-1', style: 'ellipse;cetzArcHandle=center;' };
  const arcSnap = graph.snapDelta({ x: 15, y: 13 },
    { x: 133, y: 53, width: 14, height: 14 });
  assert.equal(133 + arcSnap.x + 7, 160);
  assert.equal(53 + arcSnap.y + 7, 70);
  selectedCell = { id: 'cetz-point-0-2', style: 'ellipse;cetzArcHandle=end;' +
    'cetzArcCenterX=100;cetzArcCenterY=100;cetzArcRadiusX=80;cetzArcRadiusY=40;' };
  const endSnap = graph.snapDelta({ x: 12, y: -6 },
    { x: 143, y: 63, width: 14, height: 14 });
  const projectedX = 143 + endSnap.x + 7;
  const projectedY = 63 + endSnap.y + 7;
  assert.ok(Math.abs(((projectedX - 100) / 80) ** 2 + ((projectedY - 100) / 40) ** 2 - 1) < 0.00001);
  const endAngle = Math.atan2((projectedY - 100) / 40, (projectedX - 100) / 80) * 180 / Math.PI;
  assert.ok(Math.abs(endAngle - Math.round(endAngle)) < 0.00001);
  selectedCell = { id: 'cetz-point-0-1', style: 'ellipse;cetzArcHandle=center;' };
  graph.graphHandler.updateHint();
  assert.match(graph.graphHandler.hint.textContent, /^CeTZ arc center .* start fixed$/);
  selectedCell = pointCell;
  graph.graphHandler.updateHint();
  assert.equal(graph.graphHandler.hint.textContent, 'CeTZ (1, 1)');
  const resizeHandler = new VertexHandler();
  resizeHandler.state = { cell: editCell, view: graph.view };
  resizeHandler.bounds = { x: 540, y: 420, width: 80, height: 40 };
  resizeHandler.index = 0;
  resizeHandler.updateHint();
  assert.equal(resizeHandler.hint.textContent, 'CeTZ bounds (1, 1), size (2, 1)');
  graph.view.scale = 2;
  graph.view.translate = { x: 3, y: -2 };
  const zoomedPointSnap = graph.snapDelta({ x: 32, y: -14 },
    { x: 1072, y: 902, width: 28, height: 28 });
  assert.equal(zoomedPointSnap.x, 30);
  assert.equal(zoomedPointSnap.y, -10);
  graph.graphHandler.bounds = { x: 1072, y: 902 };
  graph.graphHandler.currentDx = 20;
  graph.graphHandler.updateHint();
  assert.equal(graph.graphHandler.hint.textContent, 'CeTZ (1.25, 1)');
  resizeHandler.bounds = { x: 1086, y: 836, width: 160, height: 80 };
  resizeHandler.updateHint();
  assert.equal(resizeHandler.hint.textContent, 'CeTZ bounds (1, 1), size (2, 1)');
  resizeHandler.index = -2;
  resizeHandler.updateHint();
  assert.equal(resizeHandler.hint.textContent, 'Draw.io size');
  resizeHandler.index = 0;
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
  const otherPoint = { id: 'cetz-point-1-0', style: 'ellipse;' };
  assert.equal(graph.isCellVisible(otherPoint), false);
  selectedCell = lineCell;
  assert.equal(graph.isCellVisible(otherPoint), true);
  selectedCell = pointCell;
  assert.equal(graph.isCellVisible({ id: 'cetz-point-0-0', style: 'ellipse;' }), true);
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
  assert.equal(graph.isCellDeletable({ id: 'cetz-render-0' }), false);
  assert.equal(graph.isCellSelectable({ id: 'cetz-render-0' }), false);
  assert.equal(graph.isConstrainChild({ id: 'cetz-render-0' }), false);
  assert.equal(graph.isConstrainChild(editCell), true);
  assert.equal(graph.graphHandler.maxLivePreview, Number.MAX_SAFE_INTEGER);
  assert.equal(graph.graphHandler.allowLivePreview, true);
  const fitsBeforeLoad = fitCalls;
  fileLoaded();
  assert.equal(fitCalls, fitsBeforeLoad + 1, 'a freshly loaded diagram is fitted into view');
  const artwork = { id: 'cetz-render-0', visible: false, parent: editCell,
    style: 'shape=image;image=data:image/svg+xml,%3Csvg%2F%3E;',
    geometry: { x: -2, y: -2, width: 80, height: 40 } };
  graphModel.cells[artwork.id] = artwork;
  const unchangedStyle = artwork.style;
  modelChanged();
  assert.equal(graph.isCellVisible(previewImageCell), true, 'full drawing remains visible while images load');
  assert.equal(graph.isCellVisible(artwork), false);
  const sourceNode = { style: { visibility: 'visible' } };
  graph.view.scale = 1;
  cellStates.set(artwork.id, { cell: artwork, shape: { node: sourceNode } });
  graph.graphHandler.cells = [editCell];
  graph.graphHandler.currentDx = 25;
  graph.graphHandler.currentDy = -15;
  const unchangedGeometry = JSON.stringify(artwork.geometry);
  assert.equal(graph.graphHandler.updatePreview(), 'native-preview');
  assert.equal(nativePreviewCalls, 1);
  assert.equal(dragShapes.length, 1, 'drag draws the SVG even before fragment preloading completes');
  const dragImage = dragShapes[0];
  assert.equal(dragImage.bounds.x, 35);
  assert.equal(dragImage.bounds.y, 7);
  assert.equal(dragImage.bounds.width, 80);
  assert.equal(dragImage.bounds.height, 40);
  assert.equal(dragImage.pointerEvents, false);
  assert.equal(dragImage.preserveImageAspect, false);
  assert.equal(sourceNode.style.visibility, 'hidden');
  graph.view.scale = 2;
  graph.graphHandler.currentDx = 40;
  graph.graphHandler.currentDy = 30;
  graph.graphHandler.updatePreview();
  assert.equal(dragShapes.length, 1, 'frames reuse the preview image');
  assert.equal(dragImage.redraws, 2);
  assert.equal(dragImage.bounds.x, 48);
  assert.equal(dragImage.bounds.y, 50);
  assert.equal(dragImage.bounds.width, 160);
  assert.equal(dragImage.bounds.height, 80);
  assert.equal(JSON.stringify(artwork.geometry), unchangedGeometry, 'dragging does not edit SVG geometry');
  assert.equal(graph.graphHandler.reset(), 'native-reset');
  assert.equal(nativeResetCalls, 1);
  assert.equal(dragImage.destroyed, true);
  assert.equal(sourceNode.style.visibility, 'visible');
  const secondArtwork = { id: 'cetz-render-1', parent: lineCell,
    style: artwork.style, geometry: { x: 5, y: 6, width: 20, height: 30 } };
  graphModel.cells[secondArtwork.id] = secondArtwork;
  cellStates.set(lineCell.id, { cell: lineCell, x: 200, y: 300 });
  graph.view.scale = 1;
  graph.graphHandler.cells = [editCell, lineCell];
  graph.graphHandler.currentDx = -10;
  graph.graphHandler.currentDy = 20;
  graph.graphHandler.updatePreview();
  const multiImages = dragShapes.slice(-2);
  assert.equal(multiImages[0].bounds.x, 0);
  assert.equal(multiImages[0].bounds.y, 42);
  assert.equal(multiImages[1].bounds.x, 195);
  assert.equal(multiImages[1].bounds.y, 326);
  assert.equal(graph.graphHandler.cetzDragImages.length, 2, 'multiple selected elements draw together');
  graph.graphHandler.updatePreview(true);
  assert.ok(multiImages.every(shape => shape.destroyed), 'a remote refresh removes transient previews');
  assert.equal(sourceNode.style.visibility, 'visible');
  graph.graphHandler.cells = [pointCell];
  graph.graphHandler.updatePreview();
  assert.equal(graph.graphHandler.cetzDragImages.length, 0, 'a control point with no geometry leaves the element untouched');
  delete graphModel.cells[secondArtwork.id];
  cellStates.delete(lineCell.id);
  graph.view.scale = 1;
  delete graph.graphHandler.cells;
  graph.graphHandler.currentDx = 0;
  graph.graphHandler.currentDy = 0;
  const validationsBeforeLoad = viewValidations;
  imageLoads.at(-1).onload();
  assert.equal(graph.isCellVisible(previewImageCell), false);
  assert.equal(graph.isCellVisible(artwork), true, 'loaded fragments replace the complete drawing');
  assert.ok(viewValidations > validationsBeforeLoad, 'switching representations rebuilds the graph view');
  assert.equal(artwork.style, unchangedStyle, 'view switching does not edit the document');
  assert.equal(artwork.visible, false);
  const restoredArtwork = { ...artwork, geometry: { ...artwork.geometry } };
  const validationsBeforeRestore = viewValidations;
  graphModel.cells[artwork.id] = restoredArtwork;
  cellStates.delete(artwork.id);
  modelChanged();
  assert.ok(viewValidations > validationsBeforeRestore,
    'undo must rebuild restored fragment cells even when their SVG image is unchanged');
  graphModel.cells[artwork.id] = artwork;
  modelChanged();
  assert.equal(fitCalls, fitsBeforeLoad + 1, 'image load and model edits preserve the current view');
  artwork.style += 'strokeColor=none;';
  // Change the image itself to exercise failure during a subsequent source render.
  artwork.style = artwork.style.replace('%3Csvg%2F%3E', '%3Csvg%3E%3C%2Fsvg%3E');
  modelChanged();
  assert.equal(graph.isCellVisible(previewImageCell), true);
  imageLoads.at(-1).onerror();
  assert.equal(graph.isCellVisible(previewImageCell), true, 'an image error keeps the full drawing visible');
  assert.equal(graph.isCellVisible(artwork), false);
  delete graphModel.cells[artwork.id];
  modelChanged();
  assert.equal(graph.isCellVisible(previewImageCell), true, 'old diagrams without fragments still display');
  graph.view.scale = 1;
  graph.view.translate = { x: 0, y: 0 };
  selectedCell = editCell;
  assert.equal(graph.graphHandler.useGuidesForEvent(), true);
  graph.snapDelta({ x: 0, y: 0 }, { x: 10, y: 20, width: 40, height: 40 });
  assert.equal(snappedBounds.x, 45);
  assert.equal(snappedBounds.y, 40);

  fileTitle = 'ordinary.drawio';
  fileData = '';
  preview = false;
  editablePreview = false;
  selectedCell = null;
  fileLoaded();
  assert.equal(ui.hsplitPosition, 0);
  assert.equal(ui.formatWidth, 240);
  assert.equal(formatContainer.style.width, '');
  assert.equal(formatContainer.style.overflowY, '');
  assert.equal(palettes.general[0].style.display, '');
  assert.equal(palettes.general[1].style.display, 'block');
  assert.equal(palettes.scratchpad[0].style.display, '');
  assert.equal(palettes['cetz-primitives'][0].style.display, 'none');
  assert.equal(palettes['cetz-preview-primitives'][0].style.display, 'none');
  assert.equal(palettes['cetz-advanced'][0].style.display, 'none');
  assert.equal(moreShapes.style.display, 'flex');
  assert.equal(toolbarContainer.style.display, 'flex');
  assert.equal(formatContainer.style.display, 'block');
  assert.equal(ui.tabContainer.style.display, 'flex');
  assert.equal(ui.container.children[0].style.display, 'none');
  assert.equal(standardMenu.style.display, 'inline-block');
  assert.equal(statusContainer.style.display, 'flex');
  assert.equal(libraryButton.style.display, 'inline-block');
  assert.equal(rulerVisible, true);
  assert.equal(graph.graphHandler.updateHint, originalHint);
  assert.equal(graph.graphHandler.useGuidesForEvent, originalUseGuides);
  assert.equal(graph.graphHandler.maxLivePreview, 17);
  assert.equal(graph.graphHandler.allowLivePreview, false);
  assert.equal(graph.graphHandler.updatePreview, originalPreview);
  assert.equal(graph.graphHandler.reset, originalReset);
  assert.equal(graph.isConstrainChild({ id: 'cetz-render-0' }), true);
  resizeHandler.updateHint();
  assert.equal(resizeHandler.hint.textContent, 'Draw.io size');
  assert.equal(graph.isCellSelectable({ id: 'cetz-axis-x' }), true);
  graph.snapDelta({ x: 0, y: 0 }, { x: 10, y: 20 });
  assert.equal(snappedBounds.x, 10);
  assert.equal(graphEnabled, true);
  ui.toggleShapesPanel(true);
  assert.equal(ui.hsplitPosition, 232);
});
