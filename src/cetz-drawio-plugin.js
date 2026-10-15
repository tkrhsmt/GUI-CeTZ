/* global Draw */
// Loaded by Draw.io Integration only after its normal plugin trust prompt.
Draw.loadPlugin(function (ui) {
  var sidebar = ui.sidebar;
  if (!sidebar) return;

  sidebar.addPaletteFunctions('cetz-primitives', 'CeTZ primitives', true, [
    sidebar.createVertexTemplateEntry('rounded=0;whiteSpace=wrap;html=1;', 120, 80, '', 'rect'),
    sidebar.createVertexTemplateEntry('ellipse;whiteSpace=wrap;html=1;', 80, 80, '', 'circle'),
    sidebar.createVertexTemplateEntry('text;html=0;whiteSpace=wrap;align=center;verticalAlign=middle;strokeColor=none;', 120, 36, 'Text', 'content'),
    sidebar.createEdgeTemplateEntry('rounded=0;html=1;startArrow=none;endArrow=none;', 120, 60, '', 'line')
  ]);
  sidebar.addPaletteFunctions('cetz-preview-primitives', 'CeTZ primitives', true, [
    sidebar.createVertexTemplateEntry('rounded=0;cetzTemplate=rect;', 120, 80, '', 'rect'),
    sidebar.createVertexTemplateEntry('ellipse;cetzTemplate=circle;', 80, 80, '', 'circle'),
    sidebar.createVertexTemplateEntry('text;cetzTemplate=content;', 120, 36, 'Text', 'content'),
    sidebar.createEdgeTemplateEntry('rounded=0;startArrow=none;endArrow=none;cetzTemplate=line;', 120, 60, '', 'line')
  ]);
  var shapeNames = ['arc', 'mark', 'n-star', 'grid', 'rect-around', 'bezier',
    'hobby', 'catmull', 'merge-path', 'compound-path'];
  sidebar.addPaletteFunctions('cetz-advanced', 'CeTZ shapes', true,
    shapeNames.map(function (name) {
      return sidebar.createVertexTemplateEntry(
        'rounded=0;dashed=1;fillColor=none;strokeColor=#4f79ff;cetzTemplate=' + name + ';',
        120, 80, name, name);
    }));
  var basicPair = sidebar.palettes['cetz-primitives'];
  var previewBasicPair = sidebar.palettes['cetz-preview-primitives'];
  var advancedPair = sidebar.palettes['cetz-advanced'];
  var controls = document.createElement('div');
  controls.style.cssText = 'padding:10px;display:none;font:12px sans-serif;';
  sidebar.wrapper.insertBefore(controls, sidebar.wrapper.firstChild);

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
      if (isEditablePreview()) {
        var selected = cells[0];
        var point = /^cetz-point-(\d+)-\d+$/.exec(selected.id || '');
        if (point) selected = graph.getModel().getCell('cetz-edit-' + point[1]);
        if (!selected || !/^cetz-edit-\d+$/.test(selected.id || '')) return;
        var previewKeys = { fillColor: 'cetzFillColor', strokeColor: 'cetzStrokeColor',
          strokeWidth: 'cetzStrokeWidth', dash: 'cetzDash' };
        if (!previewKeys[key]) return;
        graph.getModel().beginUpdate();
        try { graph.setCellStyles(previewKeys[key], input.value, [selected]); }
        finally { graph.getModel().endUpdate(); }
        return;
      }
      graph.getModel().beginUpdate();
      try {
        if (key === 'dash') {
          var patterns = { solid: '', dotted: '1 2', dashed: '3 3',
            'densely-dotted': '1 1', 'loosely-dotted': '1 4',
            'densely-dashed': '3 2', 'loosely-dashed': '3 6',
            'dash-dotted': '3 2 1 2' };
          graph.setCellStyles('dashed', input.value === 'solid' ? '0' : '1', cells);
          graph.setCellStyles('dashPattern', patterns[input.value], cells);
        } else graph.setCellStyles(key, input.value, cells);
      } finally { graph.getModel().endUpdate(); }
    });
    row.appendChild(input); controls.appendChild(row);
    return input;
  }
  var fill = field('Fill', 'color', null, 'fillColor');
  var stroke = field('Stroke', 'color', null, 'strokeColor');
  var width = field('Width', 'number', null, 'strokeWidth');
  var dash = field('Line', 'select', [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted'],
    ['densely-dashed', 'Dense dash'], ['loosely-dashed', 'Loose dash'],
    ['densely-dotted', 'Dense dots'], ['loosely-dotted', 'Loose dots'],
    ['dash-dotted', 'Dash dot']], 'dash');
  var start = field('Start', 'select', [['none', 'None'], ['classic', 'Arrow'], ['diamond', 'Diamond']], 'startArrow');
  var end = field('End', 'select', [['none', 'None'], ['classic', 'Arrow'], ['diamond', 'Diamond']], 'endArrow');
  var graph = ui.editor.graph;
  var cetzMenu = null;
  function sendHistoryAction(name) {
    graph.insertVertex(graph.getDefaultParent(), null, '', -1000, -1000, 1, 1,
      'opacity=0;strokeColor=none;fillColor=none;cetzAction=' + name + ';');
  }
  function ensureCetzMenu() {
    if (!ui.menubar || cetzMenu && cetzMenu.parentNode) return;
    cetzMenu = ui.menubar.addMenu('CeTZ', function (menu, parent) {
      shapeNames.forEach(function (name) {
        menu.addItem(name, null, function () {
          if (!isCetz()) return;
          var bounds = graph.view.getGraphBounds();
          var x = Math.max(0, Math.round(bounds.x + bounds.width / 2));
          var y = Math.max(0, Math.round(bounds.y + bounds.height / 2));
          var cell = graph.insertVertex(graph.getDefaultParent(), null, name, x, y, 120, 80,
            'rounded=0;dashed=1;fillColor=none;strokeColor=#4f79ff;cetzTemplate=' + name + ';');
          graph.setSelectionCell(cell);
        }, parent);
      });
      menu.addSeparator(parent);
      menu.addItem('Undo', null, function () { if (isCetz()) sendHistoryAction('undo'); }, parent);
      menu.addItem('Redo', null, function () { if (isCetz()) sendHistoryAction('redo'); }, parent);
      menu.addItem('Delete selected', null, function () {
        if (isCetz()) graph.removeCells(graph.getSelectionCells());
      }, parent);
    });
  }
  ensureCetzMenu();
  var original = {
    deletable: graph.isCellDeletable, cloneable: graph.isCellCloneable,
    connectable: graph.isCellConnectable, popup: graph.popupMenuHandler && graph.popupMenuHandler.isEnabled,
    undo: ui.actions.get('undo').funct, redo: ui.actions.get('redo').funct,
    undoEnabled: ui.actions.get('undo').isEnabled, redoEnabled: ui.actions.get('redo').isEnabled
  };
  ui.actions.get('undo').isEnabled = function () {
    return isCetz() || original.undoEnabled.apply(this, arguments);
  };
  ui.actions.get('redo').isEnabled = function () {
    return isCetz() || original.redoEnabled.apply(this, arguments);
  };
  ui.actions.get('undo').funct = function () {
    if (isCetz()) sendHistoryAction('undo');
    else original.undo.apply(this, arguments);
  };
  ui.actions.get('redo').funct = function () {
    if (isCetz()) sendHistoryAction('redo');
    else original.redo.apply(this, arguments);
  };
  var activeMode = false;
  var hiddenPalettes = new Map();
  function setDisplay(element, visible) {
    if (element) element.style.display = visible ? '' : 'none';
  }
  function updateStandardPalettes(active) {
    if (active) {
      Object.keys(sidebar.palettes).forEach(function (id) {
        if (id === 'cetz-primitives' || id === 'cetz-preview-primitives' || id === 'cetz-advanced') return;
        sidebar.palettes[id].forEach(function (element) {
          if (!hiddenPalettes.has(element)) hiddenPalettes.set(element, element.style.display);
          element.style.display = 'none';
        });
      });
    } else {
      hiddenPalettes.forEach(function (display, element) { element.style.display = display; });
      hiddenPalettes.clear();
    }
  }
  function isCetz() {
    var file = ui.getCurrentFile();
    if (!file) return false;
    var data = file.getData && file.getData();
    var cells = graph.getModel().cells || {};
    return /\.cetz-\d+\.drawio$/i.test(file.getTitle()) ||
      typeof data === 'string' && /<mxfile\b[^>]*\bhost="GUI-CeTZ"/.test(data) ||
      !!graph.getModel().getCell('preview-image') ||
      !!graph.getModel().getCell('cetz-preview-background') ||
      Object.keys(cells).some(function (id) { return /^cetz-\d+-\d+$/.test(id); });
  }
  function isPreview() { return !!graph.getModel().getCell('preview-image') ||
    !!graph.getModel().getCell('cetz-preview-background'); }
  function isEditablePreview() { return !!graph.getModel().getCell('cetz-preview-background'); }
  function updateControls() {
    var cell = graph.getSelectionCell();
    var previewCell = false;
    if (isEditablePreview() && cell) {
      var point = /^cetz-point-(\d+)-\d+$/.exec(cell.id || '');
      if (point) cell = graph.getModel().getCell('cetz-edit-' + point[1]);
      previewCell = !!cell && /^cetz-edit-\d+$/.test(cell.id || '');
    }
    var textCell = cell && !graph.getModel().isEdge(cell) && (cell.style || '').split(';')[0] === 'text';
    controls.style.display = isCetz() && (previewCell || !isPreview() && cell && !textCell) ? '' : 'none';
    if (!cell || controls.style.display === 'none') return;
    var style = graph.getCellStyle(cell);
    if (previewCell) {
      fill.value = /^#[0-9a-f]{6}$/i.test(style.cetzFillColor) ? style.cetzFillColor : '#ffffff';
      stroke.value = /^#[0-9a-f]{6}$/i.test(style.cetzStrokeColor) ? style.cetzStrokeColor : '#000000';
      width.value = style.cetzStrokeWidth || '1';
      dash.value = style.cetzDash || 'solid';
      fill.parentNode.style.display = ['rect', 'circle', 'n-star', 'rect-around',
        'merge-path', 'compound-path'].includes(style.cetzKind) ? '' : 'none';
      stroke.parentNode.style.display = '';
      width.parentNode.style.display = '';
      dash.parentNode.style.display = '';
      start.parentNode.style.display = 'none';
      end.parentNode.style.display = 'none';
      return;
    }
    fill.value = /^#[0-9a-f]{6}$/i.test(style.fillColor) ? style.fillColor : '#ffffff';
    stroke.value = /^#[0-9a-f]{6}$/i.test(style.strokeColor) ? style.strokeColor : '#000000';
    width.value = style.strokeWidth || '1';
    var names = { '1 2': 'dotted', '3 3': 'dashed', '1 1': 'densely-dotted',
      '1 4': 'loosely-dotted', '3 2': 'densely-dashed', '3 6': 'loosely-dashed',
      '3 2 1 2': 'dash-dotted' };
    dash.value = String(style.dashed) === '1' ? names[style.dashPattern] || 'dashed' : 'solid';
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
    if (active) ensureCetzMenu();
    if (active && !activeMode) {
      graph.isCellDeletable = function (cell) {
        return !!cell && !['0', '1', 'preview-image', 'cetz-preview-background'].includes(cell.id) &&
          !/^cetz-(?:point|guide)-/.test(cell.id);
      };
      graph.isCellCloneable = function () { return false; };
      graph.isCellConnectable = function () { return false; };
      if (graph.popupMenuHandler) graph.popupMenuHandler.isEnabled = function () { return false; };
    } else if (!active && activeMode) {
      graph.isCellDeletable = original.deletable;
      graph.isCellCloneable = original.cloneable;
      graph.isCellConnectable = original.connectable;
      if (graph.popupMenuHandler) graph.popupMenuHandler.isEnabled = original.popup;
    }
    var changed = active !== activeMode;
    activeMode = active;
    if (changed && ui.refresh) ui.refresh(true);
    if (active || changed) graph.setEnabled(true);
    updateStandardPalettes(active);
    setDisplay(cetzMenu, active);
    setDisplay(basicPair[0], active && !preview); setDisplay(basicPair[1], active && !preview);
    setDisplay(previewBasicPair[0], active && preview); setDisplay(previewBasicPair[1], active && preview);
    setDisplay(advancedPair[0], active); setDisplay(advancedPair[1], active);
    updateControls();
  }
  ui.editor.addListener('fileLoaded', update);
  graph.getSelectionModel().addListener('change', updateControls);
  graph.getModel().addListener('change', function () { setTimeout(update, 0); });
  new MutationObserver(function () { setTimeout(update, 0); }).observe(sidebar.container, { childList: true, subtree: true });
  if (ui.menubar) new MutationObserver(function () { setTimeout(update, 0); })
    .observe(ui.menubar.container, { childList: true });
  update();
});
