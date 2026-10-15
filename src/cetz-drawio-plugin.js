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
  var shapeGlyphs = {
    arc: '<path d="M10 34 A22 22 0 0 1 54 34"/><circle cx="32" cy="34" r="2" fill="#e28b23" stroke="none"/>',
    mark: '<path d="M9 34 H48 M39 25 L51 34 L39 43"/>',
    'n-star': '<path d="M32 5 L38 20 L54 20 L41 30 L46 45 L32 36 L18 45 L23 30 L10 20 L26 20 Z"/>',
    grid: '<path d="M10 8 V42 M21 8 V42 M32 8 V42 M43 8 V42 M54 8 V42 M10 8 H54 M10 19 H54 M10 30 H54 M10 42 H54"/>',
    'rect-around': '<rect x="11" y="8" width="42" height="34" rx="5"/><path d="M21 18 H43 V32 H21 Z" stroke-dasharray="3 3"/>',
    bezier: '<path d="M8 36 C18 4 43 44 56 12"/><path d="M8 36 L18 10 M56 12 L43 40" stroke="#e28b23" stroke-dasharray="3 3"/>',
    hobby: '<path d="M7 34 C19 12 25 13 33 25 S48 39 57 10"/><circle cx="7" cy="34" r="2"/><circle cx="33" cy="25" r="2"/><circle cx="57" cy="10" r="2"/>',
    catmull: '<path d="M7 36 C17 35 18 8 30 11 S43 36 57 13"/><circle cx="7" cy="36" r="2"/><circle cx="30" cy="11" r="2"/><circle cx="57" cy="13" r="2"/>',
    'merge-path': '<path d="M9 38 H28 V10 H51 V38 H28"/><circle cx="28" cy="38" r="2"/>',
    'compound-path': '<rect x="10" y="9" width="34" height="30"/><circle cx="42" cy="28" r="13" fill="#dbeafe"/>'
  };
  function shapeIcon(name) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48" viewBox="0 0 64 48">' +
      '<g fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
      shapeGlyphs[name] + '</g></svg>';
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }
  sidebar.addPaletteFunctions('cetz-advanced', 'CeTZ shapes', true,
    shapeNames.map(function (name) {
      return sidebar.createVertexTemplateEntry(
        'shape=image;imageAspect=1;image=' + shapeIcon(name) + ';cetzTemplate=' + name + ';',
        80, 60, '', name, false, true);
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
      if (entry[0] === 'custom') option.disabled = true;
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
      if ((key === 'cetzStartMark' || key === 'cetzEndMark') && input.value === 'custom') return;
      if (isEditablePreview()) {
        var selected = cells[0];
        var point = /^cetz-point-(\d+)-\d+$/.exec(selected.id || '');
        if (point) selected = graph.getModel().getCell('cetz-edit-' + point[1]);
        if (!selected || !/^cetz-edit-\d+$/.test(selected.id || '')) return;
        var previewKeys = { fillColor: 'cetzFillColor', strokeColor: 'cetzStrokeColor',
          strokeWidth: 'cetzStrokeWidth', dash: 'cetzDash',
          cetzStartMark: 'cetzStartMark', cetzEndMark: 'cetzEndMark' };
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
  var markNames = ['triangle', 'stealth', 'curved-stealth', 'bar', 'ellipse', 'circle',
    'bracket', 'diamond', 'rect', 'hook', 'straight', 'barbed', 'plus', 'x', 'star',
    'parenthesis'];
  var markOptions = [['none', 'None']].concat(markNames.map(function (name) { return [name, name]; }),
    [['custom', 'Custom (Typst)']]);
  var markStart = field('Start mark', 'select', markOptions, 'cetzStartMark');
  var markEnd = field('End mark', 'select', markOptions, 'cetzEndMark');
  markStart.style.width = markEnd.style.width = '145px';
  var graph = ui.editor.graph;
  var cetzMenu = null;
  function sendHistoryAction(name) {
    var token = Date.now().toString(36) + Math.random().toString(36).slice(2);
    graph.insertVertex(graph.getDefaultParent(), null, '', -1000, -1000, 1, 1,
      'opacity=0;strokeColor=none;fillColor=none;cetzAction=' + name +
      ';cetzActionToken=' + token + ';');
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
    deletable: graph.isCellDeletable, selectable: graph.isCellSelectable,
    cloneable: graph.isCellCloneable, visible: graph.isCellVisible,
    connectable: graph.isCellConnectable, snapDelta: graph.snapDelta,
    updateHint: graph.graphHandler && graph.graphHandler.updateHint,
    popup: graph.popupMenuHandler && graph.popupMenuHandler.isEnabled,
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
  var lastPreviewStyle = null;
  var lastEditCount = 0;
  function isTemplate(cell) {
    return !!cell && /(?:^|;)cetzTemplate=[\w-]+(?:;|$)/.test(cell.style || '');
  }
  function clearRenderedTemplates() {
    if (!isEditablePreview()) {
      lastPreviewStyle = null;
      lastEditCount = 0;
      return;
    }
    var model = graph.getModel();
    var cells = model.cells || {};
    var previewImage = model.getCell('cetz-preview-image');
    var style = previewImage && previewImage.style;
    var editCount = Object.keys(cells).filter(function (id) { return /^cetz-edit-\d+$/.test(id); }).length;
    if (lastPreviewStyle != null && style !== lastPreviewStyle && editCount > lastEditCount) {
      var templates = Object.keys(cells).map(function (id) { return cells[id]; }).filter(isTemplate);
      if (templates.length) graph.removeCells(templates, false);
    }
    lastPreviewStyle = style;
    lastEditCount = editCount;
  }
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
      var moreShapes = sidebar.container.querySelector && sidebar.container.querySelector('.geSidebarFooter');
      if (moreShapes) {
        if (!hiddenPalettes.has(moreShapes)) hiddenPalettes.set(moreShapes, moreShapes.style.display);
        moreShapes.style.display = 'none';
      }
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
  function cetzAnchor(cell) {
    if (!cell) return null;
    if (/^cetz-point-\d+-\d+$/.test(cell.id || '')) return { x: 7, y: 7 };
    if (/^cetz-edit-\d+$/.test(cell.id || '')) {
      var style = graph.getCellStyle(cell);
      return { x: Number(style.cetzSnapOffsetX) || 0, y: Number(style.cetzSnapOffsetY) || 0 };
    }
    return null;
  }
  function cetzFrame() {
    var background = graph.getModel().getCell('cetz-preview-background');
    var style = background && graph.getCellStyle(background);
    var frame = {
      originX: Number(style && style.cetzOriginX),
      originY: Number(style && style.cetzOriginY),
      unitX: Number(style && style.cetzUnitX),
      unitY: Number(style && style.cetzUnitY)
    };
    return Object.values(frame).every(Number.isFinite) && frame.unitX > 0 && frame.unitY > 0
      ? frame : null;
  }
  function quarter(value) { return Math.round(value * 4) / 4; }
  if (typeof mxVertexHandler !== 'undefined' && mxVertexHandler.prototype.updateHint) {
    var originalVertexHint = mxVertexHandler.prototype.updateHint;
    mxVertexHandler.prototype.updateHint = function () {
      originalVertexHint.apply(this, arguments);
      if (!isEditablePreview() || !this.hint || !this.bounds ||
        !/^cetz-edit-\d+$/.test(this.state && this.state.cell && this.state.cell.id || '') ||
        typeof mxEvent !== 'undefined' &&
          (this.index === mxEvent.LABEL_HANDLE || this.index === mxEvent.ROTATION_HANDLE)) return;
      var frame = cetzFrame();
      if (!frame) return;
      var view = this.state.view, scale = view.scale || 1;
      var translate = view.translate || { x: 0, y: 0 };
      var left = this.bounds.x / scale - translate.x;
      var bottom = (this.bounds.y + this.bounds.height) / scale - translate.y;
      var x = quarter((left - frame.originX) / frame.unitX);
      var y = quarter((frame.originY - bottom) / frame.unitY);
      var width = quarter(this.bounds.width / scale / frame.unitX);
      var height = quarter(this.bounds.height / scale / frame.unitY);
      this.hint.textContent = 'CeTZ bounds (' + x + ', ' + y + '), size (' + width + ', ' + height + ')';
    };
  }
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
      markStart.value = style.cetzStartMark || 'none';
      markEnd.value = style.cetzEndMark || 'none';
      fill.parentNode.style.display = ['rect', 'circle', 'polygon', 'n-star', 'rect-around',
        'merge-path', 'compound-path'].includes(style.cetzKind) ? '' : 'none';
      stroke.parentNode.style.display = '';
      width.parentNode.style.display = '';
      dash.parentNode.style.display = '';
      start.parentNode.style.display = end.parentNode.style.display = 'none';
      markStart.parentNode.style.display = markEnd.parentNode.style.display =
        style.cetzKind === 'line' ? '' : 'none';
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
    markStart.parentNode.style.display = markEnd.parentNode.style.display = 'none';
  }
  function update() {
    var active = isCetz(), preview = active && isPreview();
    if (active) ensureCetzMenu();
    if (active && !activeMode) {
      graph.isCellDeletable = function (cell) {
        return !!cell && !['0', '1', 'preview-image', 'cetz-preview-background'].includes(cell.id) &&
          !/^cetz-(?:point|guide|axis|origin)-/.test(cell.id) && cell.id !== 'cetz-preview-image';
      };
      graph.isCellSelectable = function (cell) {
        return !!cell && !['preview-image', 'cetz-preview-background'].includes(cell.id) &&
          !/^cetz-(?:guide|axis|origin)-/.test(cell.id) && cell.id !== 'cetz-preview-image' &&
          !isTemplate(cell) &&
          original.selectable.apply(this, arguments);
      };
      graph.isCellCloneable = function (cell) {
        return isTemplate(cell) && !graph.getModel().contains(cell);
      };
      graph.isCellVisible = function (cell) {
        return !(isTemplate(cell) && graph.getModel().contains(cell)) &&
          original.visible.apply(this, arguments);
      };
      graph.isCellConnectable = function () { return false; };
      if (original.snapDelta) graph.snapDelta = function (delta, bounds) {
        var cells = graph.getSelectionCells();
        var cell = isEditablePreview() && cells.length === 1 ? cells[0] : null;
        var anchor = cetzAnchor(cell);
        var x = anchor ? anchor.x : 0, y = anchor ? anchor.y : 0;
        if (x || y) {
          var scale = graph.view && graph.view.scale || 1;
          var adjusted = { x: bounds.x + x * scale, y: bounds.y + y * scale,
            width: bounds.width, height: bounds.height };
          var args = Array.prototype.slice.call(arguments);
          args[1] = adjusted;
          return original.snapDelta.apply(this, args);
        }
        return original.snapDelta.apply(this, arguments);
      };
      if (original.updateHint) graph.graphHandler.updateHint = function () {
        original.updateHint.apply(this, arguments);
        if (!isEditablePreview() || !this.hint || !this.bounds) return;
        var cells = graph.getSelectionCells();
        var anchor = cells.length === 1 ? cetzAnchor(cells[0]) : null;
        if (!anchor) return;
        var frame = cetzFrame();
        if (!frame) return;
        var view = graph.view, scale = view.scale || 1, translate = view.translate || { x: 0, y: 0 };
        var modelX = (this.bounds.x + this.currentDx) / scale - translate.x + anchor.x;
        var modelY = (this.bounds.y + this.currentDy) / scale - translate.y + anchor.y;
        var x = quarter((modelX - frame.originX) / frame.unitX);
        var y = quarter((frame.originY - modelY) / frame.unitY);
        this.hint.textContent = 'CeTZ (' + x + ', ' + y + ')';
      };
      if (graph.popupMenuHandler) graph.popupMenuHandler.isEnabled = function () { return false; };
    } else if (!active && activeMode) {
      graph.isCellDeletable = original.deletable;
      graph.isCellSelectable = original.selectable;
      graph.isCellCloneable = original.cloneable;
      graph.isCellVisible = original.visible;
      graph.isCellConnectable = original.connectable;
      graph.snapDelta = original.snapDelta;
      if (graph.graphHandler) graph.graphHandler.updateHint = original.updateHint;
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
    clearRenderedTemplates();
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
