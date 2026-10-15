'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

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
  let selectionChanged, selectedCell = null, changedStyle = null;
  const editCell = { id: 'cetz-edit-0', style: 'cetzKind=arc;cetzFillColor=#ffffff;cetzStrokeColor=#000000;cetzStrokeWidth=1;cetzDash=solid;' };
  const pointCell = { id: 'cetz-point-0-1', style: 'ellipse;' };
  const graphModel = { cells: {}, getCell(id) {
    if (preview && id === 'preview-image' || editablePreview && id === 'cetz-preview-background') return {};
    return editablePreview && id === editCell.id ? editCell : null;
  },
  isEdge() { return false; }, addListener() {}, beginUpdate() {}, endUpdate() {} };
  const graph = {
    getModel() { return graphModel; }, getSelectionCell() { return selectedCell; },
    getSelectionCells() { return selectedCell ? [selectedCell] : []; },
    getCellStyle(cell) { return Object.fromEntries(cell.style.split(';').filter(Boolean).map(part => part.split('='))); },
    setCellStyles(key, value, cells) { changedStyle = { key, value, cells }; },
    getSelectionModel() { return { addListener(name, callback) { selectionChanged = callback; } }; },
    isCellDeletable() { return true; }, isCellCloneable() { return true; },
    isCellConnectable() { return true; },
    setEnabled(value) { graphEnabled = value; },
    popupMenuHandler: { isEnabled() { return true; } }
  };
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
    MutationObserver: class { observe() {} }, setTimeout() {}
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
  assert.equal(graphEnabled, true);
});
