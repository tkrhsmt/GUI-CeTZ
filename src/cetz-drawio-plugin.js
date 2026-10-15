/* global Draw */
// Loaded by Draw.io Integration only after its normal plugin trust prompt.
Draw.loadPlugin(function (ui) {
  var sidebar = ui.sidebar;
  if (!sidebar) return;

  var palette = sidebar.addPaletteFunctions('cetz-primitives', 'CeTZ', true, [
    sidebar.createVertexTemplateEntry('rounded=0;whiteSpace=wrap;html=1;', 120, 80, '', 'rect'),
    sidebar.createVertexTemplateEntry('ellipse;whiteSpace=wrap;html=1;', 80, 80, '', 'circle'),
    sidebar.createVertexTemplateEntry('text;html=0;whiteSpace=wrap;align=center;verticalAlign=middle;strokeColor=none;', 120, 36, 'Text', 'content'),
    sidebar.createEdgeTemplateEntry('rounded=0;html=1;startArrow=none;endArrow=none;', 120, 60, '', 'line')
  ]);
  var title = sidebar.palettes['cetz-primitives'][0];
  var controls = document.createElement('div');
  controls.style.cssText = 'padding:10px;display:none;font:12px sans-serif;';
  sidebar.container.appendChild(controls);

  function field(label, type, values, key) {
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin:6px 0;padding:0 6px;min-height:28px;';
    var caption = document.createElement('span');
    caption.textContent = label;
    row.appendChild(caption);
    var input = document.createElement(type === 'select' ? 'select' : 'input');
    if (type === 'select') values.forEach(function (entry) {
      var option = document.createElement('option');
      option.value = entry[0]; option.textContent = entry[1]; input.appendChild(option);
    });
    else {
      input.type = type; input.min = '0.25'; input.step = '0.25';
      input.style.cssText = type === 'color'
        ? 'width:48px;height:24px;border:1px solid #888;vertical-align:middle;'
        : 'width:65px;padding:2px;border:1px solid #888;background:white;color:#111;';
    }
    input.addEventListener('change', function () {
      var graph = ui.editor.graph;
      var cells = graph.getSelectionCells();
      if (!cells.length) return;
      graph.getModel().beginUpdate();
      try {
        if (key === 'dash') {
          graph.setCellStyles('dashed', input.value === 'solid' ? '0' : '1', cells);
          graph.setCellStyles('dashPattern', input.value === 'dotted' ? '1 3' : input.value === 'dashed' ? '8 4' : '', cells);
        } else graph.setCellStyles(key, input.value, cells);
      } finally { graph.getModel().endUpdate(); }
    });
    row.appendChild(input); controls.appendChild(row);
    return input;
  }
  var fill = field('Fill', 'color', null, 'fillColor');
  var stroke = field('Stroke', 'color', null, 'strokeColor');
  var width = field('Width', 'number', null, 'strokeWidth');
  var dash = field('Line', 'select', [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']], 'dash');
  var start = field('Start', 'select', [['none', 'None'], ['classic', 'Arrow'], ['diamond', 'Diamond']], 'startArrow');
  var end = field('End', 'select', [['none', 'None'], ['classic', 'Arrow'], ['diamond', 'Diamond']], 'endArrow');
  var graph = ui.editor.graph;
  var original = {
    deletable: graph.isCellDeletable, cloneable: graph.isCellCloneable,
    connectable: graph.isCellConnectable, popup: graph.popupMenuHandler && graph.popupMenuHandler.isEnabled
  };
  var saved = null;
  function setDisplay(element, visible) {
    if (element) element.style.display = visible ? '' : 'none';
  }
  function isCetz() {
    var file = ui.getCurrentFile();
    if (!file) return false;
    var data = file.getData && file.getData();
    var cells = graph.getModel().cells || {};
    return /\.cetz-\d+\.drawio$/i.test(file.getTitle()) ||
      typeof data === 'string' && /<mxfile\b[^>]*\bhost="GUI-CeTZ"/.test(data) ||
      !!graph.getModel().getCell('preview-image') ||
      Object.keys(cells).some(function (id) { return /^cetz-\d+-\d+$/.test(id); });
  }
  function isPreview() { return !!graph.getModel().getCell('preview-image'); }
  if (ui.inlineToolbar) {
    var updateInlineToolbar = ui.inlineToolbar.updateSelection;
    ui.inlineToolbar.updateSelection = function () {
      if (isCetz()) return this.hide();
      return updateInlineToolbar.apply(this, arguments);
    };
  }
  function updateControls() {
    if (isCetz()) {
      ui.formatWidth = 0;
      setDisplay(ui.formatContainer, false);
    }
    var cell = graph.getSelectionCell();
    var textCell = cell && !graph.getModel().isEdge(cell) && (cell.style || '').split(';')[0] === 'text';
    controls.style.display = isCetz() && !isPreview() && cell && !textCell ? '' : 'none';
    if (!cell) return;
    var style = graph.getCellStyle(cell);
    fill.value = /^#[0-9a-f]{6}$/i.test(style.fillColor) ? style.fillColor : '#ffffff';
    stroke.value = /^#[0-9a-f]{6}$/i.test(style.strokeColor) ? style.strokeColor : '#000000';
    width.value = style.strokeWidth || '1';
    dash.value = style.dashed === '1' ? (style.dashPattern === '1 3' ? 'dotted' : 'dashed') : 'solid';
    start.value = ['classic', 'diamond'].includes(style.startArrow) ? style.startArrow : 'none';
    end.value = ['classic', 'diamond'].includes(style.endArrow) ? style.endArrow : 'none';
    var edge = graph.getModel().isEdge(cell);
    var content = !edge && (cell.style || '').split(';')[0] === 'text';
    fill.parentNode.style.display = edge || content ? 'none' : '';
    stroke.parentNode.style.display = content ? 'none' : '';
    width.parentNode.style.display = content ? 'none' : '';
    dash.parentNode.style.display = content ? 'none' : '';
    start.parentNode.style.display = edge ? '' : 'none';
    end.parentNode.style.display = edge ? '' : 'none';
  }
  function update() {
    var active = isCetz(), preview = active && isPreview();
    if (active && !saved) {
      saved = { formatWidth: ui.formatWidth, format: ui.formatContainer.style.display,
        menu: ui.menubarContainer.style.display,
        toolbar: ui.toolbarContainer.style.display, tabs: ui.tabContainer && ui.tabContainer.style.display,
        sidebarChildren: [] };
      Array.prototype.forEach.call(sidebar.container.children, function (child) {
        if (child !== sidebar.wrapper && child !== controls)
          saved.sidebarChildren.push([child, child.style.display]);
      });
      Array.prototype.forEach.call(sidebar.wrapper.children, function (child) {
        if (child !== title && child !== palette.parentNode)
          saved.sidebarChildren.push([child, child.style.display]);
      });
      Object.keys(sidebar.palettes).forEach(function (id) {
        if (id === 'cetz-primitives') return;
        var pair = sidebar.palettes[id];
        if (!saved.sidebarChildren.some(function (entry) { return entry[0] === pair[0]; }))
          saved.sidebarChildren.push([pair[0], pair[0].style.display]);
        if (!saved.sidebarChildren.some(function (entry) { return entry[0] === pair[1]; }))
          saved.sidebarChildren.push([pair[1], pair[1].style.display]);
      });
    }
    if (active) {
      saved.sidebarChildren.forEach(function (p) { setDisplay(p[0], false); });
      Array.prototype.forEach.call(sidebar.wrapper.children, function (child) {
        if (child === title || child === palette.parentNode) return;
        if (!saved.sidebarChildren.some(function (p) { return p[0] === child; }))
          saved.sidebarChildren.push([child, child.style.display]);
        setDisplay(child, false);
      });
      Array.prototype.forEach.call(sidebar.container.children, function (child) {
        if (child === sidebar.wrapper || child === controls) return;
        if (!saved.sidebarChildren.some(function (p) { return p[0] === child; }))
          saved.sidebarChildren.push([child, child.style.display]);
        setDisplay(child, false);
      });
      setDisplay(ui.menubarContainer, false);
      setDisplay(ui.toolbarContainer, false);
      setDisplay(ui.tabContainer, false);
      setDisplay(ui.formatContainer, false);
      if (ui.inlineToolbar) ui.inlineToolbar.hide();
      ui.formatWidth = 0;
      graph.isCellDeletable = function () { return false; };
      graph.isCellCloneable = function () { return false; };
      graph.isCellConnectable = function () { return false; };
      if (graph.popupMenuHandler) graph.popupMenuHandler.isEnabled = function () { return false; };
      setDisplay(title, !preview); setDisplay(palette.parentNode, !preview);
      graph.setEnabled(!preview);
    } else if (saved) {
      saved.sidebarChildren.forEach(function (p) { p[0].style.display = p[1]; });
      ui.menubarContainer.style.display = saved.menu;
      ui.toolbarContainer.style.display = saved.toolbar;
      if (ui.tabContainer) ui.tabContainer.style.display = saved.tabs;
      ui.formatWidth = saved.formatWidth;
      ui.formatContainer.style.display = saved.format;
      graph.isCellDeletable = original.deletable;
      graph.isCellCloneable = original.cloneable;
      graph.isCellConnectable = original.connectable;
      if (graph.popupMenuHandler) graph.popupMenuHandler.isEnabled = original.popup;
      setDisplay(title, false); setDisplay(palette.parentNode, false);
      graph.setEnabled(true);
      saved = null;
    } else { setDisplay(title, false); setDisplay(palette.parentNode, false); }
    if (ui.refresh) ui.refresh(true);
    updateControls();
  }
  ui.editor.addListener('fileLoaded', update);
  graph.getSelectionModel().addListener('change', updateControls);
  graph.getModel().addListener('change', function () { setTimeout(update, 0); });
  new MutationObserver(function () { setTimeout(update, 0); }).observe(sidebar.wrapper, { childList: true, subtree: true });
  update();
});
