/* global Draw, mxCell, mxGeometry */
// Loaded by Draw.io Integration only after its normal plugin trust prompt.
Draw.loadPlugin(function (ui) {
  var sidebar = ui.sidebar;
  if (!sidebar) return;
  // The same plugin can be listed by both workspace and user settings.
  // Draw.io invokes each entry, so guard the UI before adding palettes.
  if (ui.guiCetzPluginLoaded) return;
  ui.guiCetzPluginLoaded = true;

  var shapeNames = ['arc', 'mark', 'n-star', 'grid', 'rect-around', 'bezier',
    'hobby', 'catmull', 'merge-path', 'compound-path'];
  var shapeGlyphs = {
    rect: '<rect x="10" y="10" width="44" height="28" rx="2"/>',
    circle: '<circle cx="32" cy="24" r="17"/>',
    content: '<rect x="8" y="10" width="48" height="28" rx="3" stroke="#93c5fd"/><path d="M18 18 H46 M18 25 H41 M18 32 H35"/>',
    line: '<path d="M8 36 L25 11 L42 28 L56 12"/><circle cx="8" cy="36" r="2" fill="#ffffff"/><circle cx="56" cy="12" r="2" fill="#ffffff"/>',
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
  var originalShowTooltip = sidebar.showTooltip;
  var originalGetTooltipOffset = sidebar.getTooltipOffset;
  if (originalGetTooltipOffset) sidebar.getTooltipOffset = function (element, bounds) {
    if (!element.cetzPrimitiveIcon || !element.getBoundingClientRect || !this.tooltip)
      return originalGetTooltipOffset.apply(this, arguments);
    var icon = element.getBoundingClientRect();
    var popupWidth = this.tooltip.offsetWidth || parseFloat(this.tooltip.style.width) ||
      bounds.width + 2 * this.tooltipBorder + 4;
    var popupHeight = this.tooltip.offsetHeight || parseFloat(this.tooltip.style.height) ||
      bounds.height + 2 * this.tooltipBorder;
    return { x: Math.max(0, icon.left - popupWidth - 8),
      y: Math.max(0, icon.top + icon.height / 2 - popupHeight / 2) };
  };
  if (originalShowTooltip) sidebar.showTooltip = function (element) {
    if (!element.cetzPrimitiveIcon || typeof mxCell === 'undefined' ||
        typeof mxGeometry === 'undefined') return originalShowTooltip.apply(this, arguments);
    // The palette thumbnail is an icon; show that same icon in Draw.io's own
    // delayed preview while keeping the actual drag template untouched.
    var preview = new mxCell('', new mxGeometry(0, 0, 80, 60),
      'shape=image;imageAspect=1;image=' + element.cetzPrimitiveIcon + ';');
    preview.vertex = true;
    var args = Array.prototype.slice.call(arguments);
    args[1] = [preview]; args[2] = 80; args[3] = 60; args[5] = false;
    args[6] = null;
    return originalShowTooltip.apply(this, args);
  };
  function iconEntry(factory, name) {
    return function (content) {
      var element = factory(content);
      if (!element) return element;
      // Keep the original template and its drag behavior; replace only its thumbnail.
      element.renderThumbFn = function () {};
      element.textContent = '';
      element.style.display = 'inline-flex';
      element.style.alignItems = 'center';
      element.style.justifyContent = 'center';
      element.style.flexDirection = 'column';
      element.style.width = '44px';
      element.style.minHeight = '38px';
      element.style.margin = '0';
      var icon = document.createElement('img');
      element.cetzPrimitiveIcon = shapeIcon(name);
      icon.src = element.cetzPrimitiveIcon;
      icon.alt = '';
      icon.draggable = false;
      icon.style.cssText = 'display:block;width:34px;height:27px;object-fit:contain;pointer-events:none;';
      element.appendChild(icon);
      element.setAttribute('aria-label', name);
      // Draw.io uses an empty native title so its own delayed preview can appear.
      element.setAttribute('title', '');
      ['pointerdown', 'mousedown', 'touchstart'].forEach(function (type) {
        element.addEventListener(type, function (event) {
          if (!isCetz() || !isEditablePreview() || event.button > 0) return;
          event.preventDefault(); event.stopImmediatePropagation();
        }, true);
      });
      element.addEventListener('click', function (event) {
        if (!isCetz() || !isEditablePreview()) return;
        event.preventDefault(); event.stopImmediatePropagation();
        beginPlacement(name, element);
      }, true);
      return element;
    };
  }
  sidebar.addPaletteFunctions('cetz-primitives', 'CeTZ primitives', true, [
    iconEntry(sidebar.createVertexTemplateEntry('rounded=0;whiteSpace=wrap;html=1;', 120, 80, '', 'rect'), 'rect'),
    iconEntry(sidebar.createVertexTemplateEntry('ellipse;whiteSpace=wrap;html=1;', 80, 80, '', 'circle'), 'circle'),
    iconEntry(sidebar.createVertexTemplateEntry('text;html=0;whiteSpace=wrap;align=center;verticalAlign=middle;strokeColor=none;', 120, 36, 'Text', 'content'), 'content'),
    iconEntry(sidebar.createEdgeTemplateEntry('rounded=0;html=1;startArrow=none;endArrow=none;', 120, 60, '', 'line'), 'line')
  ]);
  sidebar.addPaletteFunctions('cetz-preview-primitives', 'CeTZ primitives', true, [
    iconEntry(sidebar.createVertexTemplateEntry('rounded=0;cetzTemplate=rect;', 120, 80, '', 'rect'), 'rect'),
    iconEntry(sidebar.createVertexTemplateEntry('ellipse;cetzTemplate=circle;', 80, 80, '', 'circle'), 'circle'),
    iconEntry(sidebar.createVertexTemplateEntry('text;cetzTemplate=content;', 120, 36, 'Text', 'content'), 'content'),
    iconEntry(sidebar.createEdgeTemplateEntry('rounded=0;startArrow=none;endArrow=none;cetzTemplate=line;', 120, 60, '', 'line'), 'line')
  ]);
  sidebar.addPaletteFunctions('cetz-advanced', 'CeTZ shapes', true,
    shapeNames.map(function (name) {
      return iconEntry(sidebar.createVertexTemplateEntry(
        'shape=image;imageAspect=1;image=' + shapeIcon(name) + ';cetzTemplate=' + name + ';',
        80, 60, '', name, false, true), name);
    }));
  var basicPair = sidebar.palettes['cetz-primitives'];
  var previewBasicPair = sidebar.palettes['cetz-preview-primitives'];
  var advancedPair = sidebar.palettes['cetz-advanced'];
  var controls = document.createElement('div');
  controls.style.cssText = 'box-sizing:border-box;width:100%;min-width:0;padding:10px 8px 12px;display:none;font:12px sans-serif;color:inherit;';
  sidebar.wrapper.insertBefore(controls, sidebar.wrapper.firstChild);
  var outline = document.createElement('div');
  outline.style.cssText = 'box-sizing:border-box;width:100%;max-height:220px;overflow:auto;' +
    'padding:8px;border-bottom:1px solid #888;display:none;font:12px sans-serif;';
  sidebar.wrapper.insertBefore(outline, controls);
  // Keep the Outline and inspector in Draw.io's left sidebar; the right
  // format column holds only the compact icon palette.
  var rail = document.createElement('div');
  rail.className = 'cetzRightRail';
  rail.style.cssText = 'box-sizing:border-box;display:none;width:48px;height:100%;overflow:hidden;' +
    'background:var(--ge-panel-background,#fff);color:inherit;';
  var paletteStrip = document.createElement('div');
  paletteStrip.style.cssText = 'box-sizing:border-box;width:48px;height:100%;overflow-y:auto;' +
    'overflow-x:hidden;scrollbar-width:none;padding:1px;';
  rail.appendChild(paletteStrip);
  var railStyle = document.createElement('style');
  railStyle.textContent = '.cetzRightRail ::-webkit-scrollbar{width:0;height:0}';
  rail.appendChild(railStyle);
  function placePalette(pair) {
    if (!pair) return;
    if (pair[0]) pair[0].style.display = 'none';
    if (pair[1]) {
      paletteStrip.appendChild(pair[1]);
      pair[1].style.cssText = (pair[1].style.cssText || '') + ';box-sizing:border-box;width:46px;display:flex;flex-direction:column;' +
        'align-items:center;gap:0;margin:0;padding:0;';
      var content = pair[1].firstChild || pair[1].children && pair[1].children[0];
      // Draw.io may defer an expanded palette until its old sidebar viewport
      // intersects; initialize it here after moving it into the right rail.
      if (content && content.initPaletteFn) content.initPaletteFn();
      if (content) content.style.cssText = (content.style.cssText || '') +
        ';box-sizing:border-box;width:46px;display:flex;flex-direction:column;align-items:center;' +
        'gap:0;margin:0;padding:0;overflow:visible;';
    }
  }
  placePalette(basicPair);
  placePalette(previewBasicPair);
  placePalette(advancedPair);
  if (ui.formatContainer) ui.formatContainer.appendChild(rail);

  function field(label, type, values, key) {
    var row = document.createElement('div');
    row.style.cssText = 'box-sizing:border-box;display:grid;grid-template-columns:76px minmax(0,1fr);align-items:center;column-gap:10px;width:100%;margin:0;padding:5px 2px;min-height:36px;';
    var caption = document.createElement('span');
    caption.textContent = label;
    caption.style.cssText = 'min-width:0;white-space:nowrap;';
    row.appendChild(caption);
    var input = document.createElement(type === 'select' ? 'select' : 'input');
    input.setAttribute('aria-label', label);
    input.style.cssText = 'box-sizing:border-box;width:100%;max-width:100%;height:28px;min-width:0;padding:2px 6px;border:1px solid #888;border-radius:4px;background:transparent;color:inherit;font:inherit;';
    if (type === 'select') values.forEach(function (entry) {
      var option = document.createElement('option');
      option.value = entry[0]; option.textContent = entry[1]; input.appendChild(option);
      if (entry[0] === 'custom') option.disabled = true;
    });
    else {
      input.type = type; input.min = '0.25'; input.step = '0.25';
      if (type === 'color') input.style.padding = '2px';
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
          cetzStartMark: 'cetzStartMark', cetzEndMark: 'cetzEndMark', cetzText: 'cetzText' };
        if (!previewKeys[key]) return;
        graph.getModel().beginUpdate();
        try { graph.setCellStyles(previewKeys[key], key === 'cetzText' ? encodeURIComponent(input.value) : input.value, [selected]); }
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
  var textValue = field('Text', 'text', null, 'cetzText');
  var details = document.createElement('div');
  details.style.cssText = 'padding:6px 2px;line-height:1.5;white-space:pre-line;overflow-wrap:anywhere;opacity:.85;';
  controls.insertBefore(details, controls.firstChild);
  function actionField(label, action, initial, min, step) {
    var row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:76px minmax(0,1fr);align-items:center;gap:10px;padding:5px 2px;';
    var caption = document.createElement('span'); caption.textContent = label;
    var input = document.createElement('input');
    input.type = 'number'; input.value = initial; input.min = min; input.step = step;
    input.setAttribute('aria-label', label);
    input.style.cssText = 'box-sizing:border-box;width:100%;height:28px;padding:2px 6px;border:1px solid #888;border-radius:4px;background:transparent;color:inherit;font:inherit;';
    input.addEventListener('change', function () { sendSourceAction(action, input.value); });
    row.appendChild(caption); row.appendChild(input); controls.appendChild(row);
    return input;
  }
  var rotation = actionField('Rotation °', 'rotate', '0', '-360', '15');
  var scaling = actionField('Scale ×', 'scale', '1', '0.05', '0.05');
  function panelButton(label, action, value) {
    var button = document.createElement('button');
    button.type = 'button'; button.textContent = label;
    button.style.cssText = 'box-sizing:border-box;min-height:28px;margin:3px 2px;padding:3px 7px;' +
      'border:1px solid #888;border-radius:4px;background:transparent;color:inherit;cursor:pointer;';
    button.addEventListener('click', function (event) {
      if (event && event.stopPropagation) event.stopPropagation();
      sendSourceAction(typeof action === 'function' ? action() : action,
        typeof value === 'function' ? value() : value);
    });
    controls.appendChild(button);
    return button;
  }
  var rotateLeft = panelButton('↺ 15°', 'rotate', function () {
    var cell = selectedEditableCells()[0];
    return cell ? (Number(graph.getCellStyle(cell).cetzAngle) || 0) - 15 : -15;
  });
  var rotateRight = panelButton('↻ 15°', 'rotate', function () {
    var cell = selectedEditableCells()[0];
    return cell ? (Number(graph.getCellStyle(cell).cetzAngle) || 0) + 15 : 15;
  });
  var sizeRow = document.createElement('div');
  sizeRow.style.cssText = 'padding:7px 2px;';
  var sizeLabel = document.createElement('label'); sizeLabel.textContent = 'Size ×1.00';
  var sizeSlider = document.createElement('input');
  sizeSlider.type = 'range'; sizeSlider.min = '0.25'; sizeSlider.max = '3';
  sizeSlider.step = '0.05'; sizeSlider.value = '1';
  sizeSlider.setAttribute('aria-label', 'Scale selected shape');
  sizeSlider.style.cssText = 'display:block;width:100%;';
  sizeSlider.addEventListener('input', function () { sizeLabel.textContent = 'Size ×' + Number(sizeSlider.value).toFixed(2); });
  sizeSlider.addEventListener('change', function () { sendSourceAction('scale', sizeSlider.value); });
  sizeRow.appendChild(sizeLabel); sizeRow.appendChild(sizeSlider); controls.appendChild(sizeRow);
  var groupButton = document.createElement('button');
  groupButton.textContent = 'Group selection';
  groupButton.addEventListener('click', function () { sendSourceAction('group'); });
  controls.appendChild(groupButton);
  var ungroupButton = document.createElement('button');
  ungroupButton.textContent = 'Ungroup';
  ungroupButton.addEventListener('click', function () { sendSourceAction('ungroup'); });
  controls.appendChild(ungroupButton);
  var shareButton = panelButton('Share point', 'share-point');
  var autoShareButton = panelButton('Auto-share matching points', 'auto-share');
  var detachButton = panelButton('Detach shared point', 'detach-point');
  var anchorRenameRow = document.createElement('div');
  anchorRenameRow.style.cssText = 'box-sizing:border-box;width:100%;min-width:0;padding:6px 2px;';
  var anchorName = document.createElement('input');
  anchorName.type = 'text'; anchorName.setAttribute('aria-label', 'Anchor name');
  anchorName.style.cssText = 'box-sizing:border-box;display:block;width:100%;max-width:100%;min-width:0;height:28px;';
  anchorName.addEventListener('input', function () {
    if (anchorName.setCustomValidity) anchorName.setCustomValidity('');
  });
  var renameButton = document.createElement('button'); renameButton.textContent = 'Rename anchor';
  renameButton.style.cssText = 'box-sizing:border-box;display:block;max-width:100%;min-width:0;margin-top:6px;white-space:normal;overflow-wrap:anywhere;';
  renameButton.addEventListener('click', function () {
    if (!/^[A-Za-z_][\w-]*$/.test(anchorName.value)) {
      if (anchorName.setCustomValidity) anchorName.setCustomValidity('Use letters, digits, _ or -.');
      if (anchorName.reportValidity) anchorName.reportValidity();
      return;
    }
    sendSourceAction('rename-anchor', anchorName.value);
  });
  anchorRenameRow.appendChild(anchorName); anchorRenameRow.appendChild(renameButton);
  controls.appendChild(anchorRenameRow);
  function optionSelect(label, options) {
    var row = document.createElement('label');
    row.style.cssText = 'box-sizing:border-box;display:grid;grid-template-columns:minmax(0,1fr);' +
      'row-gap:4px;width:100%;min-width:0;padding:4px 2px;overflow-wrap:anywhere;';
    row.textContent = label + ' ';
    var select = document.createElement('select');
    select.style.cssText = 'box-sizing:border-box;width:100%;max-width:100%;min-width:0;height:28px;';
    options.forEach(function (entry) {
      var option = document.createElement('option'); option.value = entry;
      option.textContent = entry; select.appendChild(option);
    });
    select.value = options[0];
    row.appendChild(select); controls.appendChild(row);
    return { row: row, select: select };
  }
  var anchorSides = ['auto', 'north', 'east', 'south', 'west'];
  var fromAnchor = optionSelect('From anchor', anchorSides);
  var toAnchor = optionSelect('To anchor', anchorSides);
  var connectorRoute = optionSelect('Route', ['straight', 'elbow']);
  var connectButton = panelButton('Connect selected shapes', function () {
    return 'connect-' + connectorRoute.select.value;
  }, function () {
    return fromAnchor.select.value + '-' + toAnchor.select.value;
  });
  var reconnectEnd = optionSelect('Reconnect end', ['start', 'end']);
  var reconnectSide = optionSelect('Target anchor', anchorSides);
  var reconnectButton = panelButton('Reconnect to selected shape', 'reconnect', function () {
    return reconnectEnd.select.value + '-' + reconnectSide.select.value;
  });
  var graph = ui.editor.graph;
  var pointScreenSize = 14;
  function isPointState(state) {
    return state && state.view.graph === graph && isEditablePreview() &&
      /^cetz-point-\d+-\d+$/.test(state.cell.id || '');
  }
  function fixPointShape(state) {
    var shape = state && state.shape;
    if (!shape || shape.cetzFixedPoint) return;
    var redraw = shape.redraw, createCanvas = shape.createCanvas, minimumStroke = shape.minSvgStrokeWidth;
    if (createCanvas) shape.createCanvas = function () {
      var canvas = createCanvas.apply(this, arguments);
      if (isPointState(state) && canvas && canvas.format)
        canvas.format = function (value) { return Number(value.toFixed(8)); };
      return canvas;
    };
    shape.redraw = function () {
      if (isPointState(state) && this.bounds) {
        // Keep the model/state bounds intact: snapping, guides and source
        // mapping still use the mathematical center of the 14-unit cell.
        this.bounds = new mxRectangle(this.bounds.getCenterX() - pointScreenSize / 2,
          this.bounds.getCenterY() - pointScreenSize / 2, pointScreenSize, pointScreenSize);
        this.strokewidth = (Number(state.style.strokeWidth) || 2) / (state.view.scale || 1);
        this.minSvgStrokeWidth = 0;
      } else {
        this.strokewidth = Number(state.style.strokeWidth) || 1;
        this.minSvgStrokeWidth = minimumStroke;
      }
      return redraw.apply(this, arguments);
    };
    shape.cetzFixedPoint = true;
  }
  if (graph.cellRenderer && graph.cellRenderer.doRedrawShape) {
    var nativeRedrawPoint = graph.cellRenderer.doRedrawShape;
    graph.cellRenderer.doRedrawShape = function (state) {
      if (isPointState(state)) fixPointShape(state);
      return nativeRedrawPoint.apply(this, arguments);
    };
    // Recent Draw.io versions zoom the entire SVG draw pane without repainting
    // individual cells. Repaint just the point markers for that path as well.
    var nativeScreenBounds = graph.cellRenderer.updateScreenBounds;
    if (nativeScreenBounds) graph.cellRenderer.updateScreenBounds = function (state) {
      var result = nativeScreenBounds.apply(this, arguments);
      if (isPointState(state) && state.shape) {
        fixPointShape(state);
        state.shape.redraw();
      }
      return result;
    };
  }
  if (graph.intersects) {
    var nativeIntersects = graph.intersects;
    graph.intersects = function (state, x, y) {
      if (isPointState(state)) {
        var radius = pointScreenSize / 2 + 2;
        return Math.hypot(x - state.getCenterX(), y - state.getCenterY()) <= radius;
      }
      return nativeIntersects.apply(this, arguments);
    };
  }
  var placement = null;
  var placementSteps = {
    content: ['Text position'], line: ['Start point', 'End point'], mark: ['Start point', 'End point'],
    rect: ['First corner', 'Opposite corner'], grid: ['First corner', 'Opposite corner'],
    'rect-around': ['First corner', 'Opposite corner'],
    circle: ['Center', 'Point on circle'], 'n-star': ['Center', 'Point at outer radius'],
    arc: ['Center', 'Arc start (sets radius)', 'Arc end direction (counterclockwise)'],
    bezier: ['Start point', 'End point', 'First control point', 'Second control point'],
    'compound-path': ['First outer corner', 'Opposite outer corner', 'Hole center', 'Point on hole'],
    hobby: ['First knot', 'Next knot'], catmull: ['First knot', 'Next knot'],
    'merge-path': ['First vertex', 'Next vertex']
  };
  function variablePlacement(name) { return /^(hobby|catmull|merge-path)$/.test(name); }
  function cancelPlacement() {
    if (!placement) return;
    if (placement.hint.parentNode) placement.hint.parentNode.removeChild(placement.hint);
    if (placement.preview.parentNode) placement.preview.parentNode.removeChild(placement.preview);
    graph.container.style.cursor = placement.cursor;
    if (placement.icon) {
      placement.icon.style.outline = placement.outline;
      placement.icon.setAttribute('aria-pressed', 'false');
    }
    placement = null;
  }
  function placementHint(message) {
    if (!placement) return;
    var steps = placementSteps[placement.name], count = placement.points.length;
    placement.hint.textContent = placement.name + ': ' + (message || steps[Math.min(count, steps.length - 1)]) +
      ' · ' + count + ' points · step ' + snapStep() + ' · ' + (variablePlacement(placement.name) ? 'Enter / double-click to finish · ' : '') + 'Esc to cancel';
  }
  function beginPlacement(name, icon) {
    if (!isEditablePreview() || !cetzFrame() || !placementSteps[name] || !graph.container) return;
    cancelPlacement();
    var hint = document.createElement('div');
    hint.className = 'cetzPlacementHint';
    hint.setAttribute('role', 'status'); hint.setAttribute('aria-live', 'polite');
    hint.style.cssText = 'position:absolute;left:12px;top:12px;z-index:20;pointer-events:none;' +
      'padding:7px 10px;border:1px solid #2563eb;border-radius:4px;background:#eff6ff;color:#1e3a8a;font:12px sans-serif;';
    var preview = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    preview.setAttribute('data-cetz-placement', name); preview.setAttribute('pointer-events', 'none');
    graph.view.getOverlayPane().appendChild(preview);
    graph.container.appendChild(hint);
    placement = { name: name, points: [], hint: hint, preview: preview, icon: icon,
      cursor: graph.container.style.cursor, outline: icon && icon.style.outline };
    graph.container.style.cursor = 'crosshair';
    if (icon) { icon.style.outline = '2px solid #2563eb'; icon.setAttribute('aria-pressed', 'true'); }
    if (graph.container.tabIndex < 0) graph.container.tabIndex = 0;
    graph.container.focus(); placementHint();
  }
  function placementPoint(event) {
    var frame = cetzFrame(), view = graph.view, scale = view.scale || 1;
    var local = mxUtils.convertPoint(graph.container, event.clientX, event.clientY);
    return [snapValue((local.x / scale - view.translate.x - frame.originX) / frame.unitX),
      snapValue((frame.originY - local.y / scale + view.translate.y) / frame.unitY)];
  }
  function previewPlacement(cursor) {
    if (!placement) return;
    var frame = cetzFrame(), view = graph.view, scale = view.scale || 1;
    var points = placement.points.concat(cursor ? [cursor] : []).map(function (p) {
      return [(frame.originX + p[0] * frame.unitX + view.translate.x) * scale,
        (frame.originY - p[1] * frame.unitY + view.translate.y) * scale];
    });
    var a = points[0], b = points[1], c = points[2], d = points[3], name = placement.name, shapes = '';
    function rectangle(p, q) { return '<rect x="' + Math.min(p[0], q[0]) + '" y="' + Math.min(p[1], q[1]) +
      '" width="' + Math.abs(p[0] - q[0]) + '" height="' + Math.abs(p[1] - q[1]) + '"/>'; }
    function circle(p, q) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + Math.hypot(p[0] - q[0], p[1] - q[1]) + '"/>'; }
    if (a && b && /^(rect|grid|rect-around|compound-path)$/.test(name)) shapes = rectangle(a, b);
    else if (a && b && /^(circle|n-star|arc)$/.test(name)) shapes = circle(a, b);
    else if (a && b) shapes = '<polyline points="' + points.map(function (p) { return p.join(','); }).join(' ') + '"/>';
    if (name === 'arc' && c) {
      var radius = Math.hypot(b[0] - a[0], b[1] - a[1]);
      var start = Math.atan2(b[1] - a[1], b[0] - a[0]);
      var stop = Math.atan2(c[1] - a[1], c[0] - a[0]);
      var span = (start - stop + 2 * Math.PI) % (2 * Math.PI);
      if (span > 0.00001) shapes = '<path d="M ' + b.join(' ') + ' A ' + radius + ' ' + radius +
        ' 0 ' + (span > Math.PI ? 1 : 0) + ' 0 ' +
        [a[0] + radius * Math.cos(stop), a[1] + radius * Math.sin(stop)].join(' ') + '"/>';
    }
    if (name === 'bezier' && d) shapes = '<path d="M ' + a.join(' ') + ' C ' + c.join(' ') + ' ' + d.join(' ') + ' ' + b.join(' ') + '"/>';
    if (name === 'compound-path' && d) shapes += circle(c, d);
    placement.preview.innerHTML = '<g fill="none" stroke="#2563eb" stroke-width="1.5" stroke-dasharray="5 3">' + shapes + '</g>' +
      points.map(function (p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3.5" fill="white" stroke="#2563eb"/>'; }).join('');
  }
  function finishPlacement() {
    if (!placement) return;
    var name = placement.name, points = placement.points;
    if (variablePlacement(name) && points.length < 2) { placementHint('Add at least two points'); return; }
    var pair = name === 'compound-path' ? points.slice(2) : points;
    var zeroRadius = /^(circle|n-star|arc|compound-path)$/.test(name) &&
      Math.hypot(pair[0][0] - pair[1][0], pair[0][1] - pair[1][1]) < 0.00001;
    var flatRectangle = /^(rect|grid|rect-around|compound-path)$/.test(name) &&
      (points[0][0] === points[1][0] || points[0][1] === points[1][1]);
    var invalidArcEnd = name === 'arc' && points[0][0] === points[2][0] && points[0][1] === points[2][1];
    if (zeroRadius || flatRectangle || invalidArcEnd) {
      points.pop(); placementHint('Choose a different point'); return;
    }
    var encoded = encodeURIComponent(JSON.stringify(points));
    cancelPlacement();
    graph.insertVertex(graph.getDefaultParent(), null, '', -1000, -1000, 1, 1,
      'opacity=0;strokeColor=none;fillColor=none;cetzTemplate=' + name + ';cetzPoints=' + encoded + ';');
  }
  if (graph.container && graph.container.addEventListener) {
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup'].forEach(function (type) {
      graph.container.addEventListener(type, function (event) {
        if (!placement || event.button > 0) return;
        event.preventDefault(); event.stopImmediatePropagation();
      }, true);
    });
    ['pointermove', 'mousemove'].forEach(function (type) {
      graph.container.addEventListener(type, function (event) {
        if (!placement) return;
        event.stopImmediatePropagation(); previewPlacement(placementPoint(event));
      }, true);
    });
    graph.container.addEventListener('click', function (event) {
      if (!placement || event.button > 0) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.detail > 1) return;
      var p = placementPoint(event), previous = placement.points[placement.points.length - 1];
      if (variablePlacement(placement.name) && previous && p[0] === previous[0] && p[1] === previous[1]) return;
      var name = placement.name, points = placement.points, count = points.length;
      var flatCorner = count === 1 && /^(rect|grid|rect-around|compound-path)$/.test(name) &&
        (p[0] === points[0][0] || p[1] === points[0][1]);
      var samePoint = previous && p[0] === previous[0] && p[1] === previous[1];
      var zeroRadius = samePoint && (count === 1 && /^(circle|n-star|arc|line|mark)$/.test(name) ||
        count === 3 && name === 'compound-path');
      var invalidArcEnd = name === 'arc' && count === 2 && p[0] === points[0][0] && p[1] === points[0][1];
      if (flatCorner || zeroRadius || invalidArcEnd) { placementHint('Choose a different point'); return; }
      placement.points.push(p); previewPlacement(); placementHint();
      if (!variablePlacement(placement.name) && placement.points.length === placementSteps[placement.name].length) finishPlacement();
    }, true);
    graph.container.addEventListener('dblclick', function (event) {
      if (!placement) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (variablePlacement(placement.name)) finishPlacement();
    }, true);
    graph.container.addEventListener('contextmenu', function (event) {
      if (!placement) return;
      event.preventDefault(); event.stopImmediatePropagation(); cancelPlacement();
    }, true);
  }
  document.addEventListener('keydown', function (event) {
    if (!placement || isTextTarget(event.target)) return;
    if (event.key !== 'Escape' && event.key !== 'Enter') return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.key === 'Escape') cancelPlacement();
    else if (variablePlacement(placement.name)) finishPlacement();
  }, true);
  var cetzMenu = null;
  function sendHistoryAction(name) {
    var token = Date.now().toString(36) + Math.random().toString(36).slice(2);
    graph.insertVertex(graph.getDefaultParent(), null, '', -1000, -1000, 1, 1,
      'opacity=0;strokeColor=none;fillColor=none;cetzAction=' + name +
      ';cetzActionToken=' + token + ';');
  }
  function selectedEditableCells() {
    var model = graph.getModel();
    var found = {};
    graph.getSelectionCells().forEach(function (cell) {
      var id = cell.id || '';
      var point = /^cetz-point-(\d+)-\d+$/.exec(id);
      if (point) id = 'cetz-edit-' + point[1];
      if (/^cetz-edit-\d+$/.test(id) && model.getCell(id)) found[id] = model.getCell(id);
    });
    return Object.keys(found).map(function (id) { return found[id]; });
  }
  function sendSourceAction(name, value, overrideIndices) {
    var cells = selectedEditableCells();
    if (name !== 'export' && (!isEditablePreview() || name !== 'paste' && !cells.length && !overrideIndices)) return;
    var indices = overrideIndices || cells.map(function (cell) { return Number(cell.id.slice('cetz-edit-'.length)); });
    var token = Date.now().toString(36) + Math.random().toString(36).slice(2);
    graph.insertVertex(graph.getDefaultParent(), null, '', -1000, -1000, 1, 1,
      'opacity=0;strokeColor=none;fillColor=none;cetzAction=' + name +
      ';' + (indices.length ? 'cetzTargets=' + indices.join(',') + ';' : '') +
      (value == null ? '' : 'cetzValue=' + String(value).replace(/[^\w.%-]/g, '') + ';') +
      'cetzActionToken=' + token + ';');
  }
  function arrangeSelected(axis, mode) {
    var cells = selectedEditableCells();
    if (!isEditablePreview() || cells.length < (mode === 'distribute' ? 3 : 2)) return;
    var model = graph.getModel();
    var entries = cells.map(function (cell) {
      var g = model.getGeometry(cell);
      return { cell: cell, geometry: g, start: axis === 'x' ? g.x : g.y,
        size: axis === 'x' ? g.width : g.height };
    });
    if (mode === 'distribute') {
      entries.sort(function (a, b) { return a.start + a.size / 2 - b.start - b.size / 2; });
      var first = entries[0].start + entries[0].size / 2;
      var last = entries[entries.length - 1].start + entries[entries.length - 1].size / 2;
      entries.forEach(function (entry, i) {
        entry.target = first + (last - first) * i / (entries.length - 1) - entry.size / 2;
      });
    } else {
      var starts = entries.map(function (entry) { return entry.start; });
      var ends = entries.map(function (entry) { return entry.start + entry.size; });
      var target = mode === 'start' ? Math.min.apply(null, starts) :
        mode === 'end' ? Math.max.apply(null, ends) :
          (Math.min.apply(null, starts) + Math.max.apply(null, ends)) / 2;
      entries.forEach(function (entry) {
        entry.target = target - (mode === 'start' ? 0 : mode === 'end' ? entry.size : entry.size / 2);
      });
    }
    model.beginUpdate();
    try {
      entries.forEach(function (entry) {
        if (Math.abs(entry.target - entry.start) < 0.001) return;
        var geometry = entry.geometry.clone();
        geometry[axis] = entry.target;
        model.setGeometry(entry.cell, geometry);
      });
    } finally { model.endUpdate(); }
  }
  function ensureCetzMenu() {
    if (!ui.menubar || cetzMenu && cetzMenu.parentNode) return;
    cetzMenu = ui.menubar.addMenu('CeTZ', function (menu, parent) {
      shapeNames.forEach(function (name) {
        menu.addItem(name, null, function () {
          if (!isCetz()) return;
          beginPlacement(name);
        }, parent);
      });
      menu.addSeparator(parent);
      menu.addItem('Copy', null, function () { if (isCetz()) sendSourceAction('copy'); }, parent);
      menu.addItem('Paste', null, function () { if (isCetz()) sendSourceAction('paste'); }, parent);
      menu.addItem('Duplicate', null, function () { if (isCetz()) sendSourceAction('duplicate'); }, parent);
      menu.addItem('Group selected', null, function () { if (isCetz()) sendSourceAction('group'); }, parent);
      menu.addItem('Ungroup selected', null, function () { if (isCetz()) sendSourceAction('ungroup'); }, parent);
      menu.addItem('Share first literal point', null, function () { if (isCetz()) sendSourceAction('share-point'); }, parent);
      menu.addItem('Auto-share coincident points', null, function () { if (isCetz()) sendSourceAction('auto-share'); }, parent);
      menu.addItem('Go to Typst call', null, function () { if (isCetz()) sendSourceAction('focus'); }, parent);
      menu.addItem('Export PDF, SVG or PNG', null, function () { if (isCetz()) sendSourceAction('export'); }, parent);
      menu.addItem('Bring forward', null, function () { if (isCetz()) sendSourceAction('forward'); }, parent);
      menu.addItem('Send backward', null, function () { if (isCetz()) sendSourceAction('backward'); }, parent);
      menu.addItem('Connect selected (straight)', null, function () { if (isCetz()) sendSourceAction('connect-straight'); }, parent);
      menu.addItem('Connect selected (elbow)', null, function () { if (isCetz()) sendSourceAction('connect-elbow'); }, parent);
      menu.addItem('Reconnect start to selected shape', null, function () { if (isCetz()) sendSourceAction('reconnect', 'start'); }, parent);
      menu.addItem('Reconnect end to selected shape', null, function () { if (isCetz()) sendSourceAction('reconnect', 'end'); }, parent);
      menu.addSeparator(parent);
      [['Align left', 'x', 'start'], ['Align centers', 'x', 'center'],
        ['Align right', 'x', 'end'], ['Align top', 'y', 'start'],
        ['Align middles', 'y', 'center'], ['Align bottom', 'y', 'end'],
        ['Distribute horizontally', 'x', 'distribute'],
        ['Distribute vertically', 'y', 'distribute']].forEach(function (entry) {
        menu.addItem(entry[0], null, function () {
          if (isCetz()) arrangeSelected(entry[1], entry[2]);
        }, parent);
      });
      menu.addSeparator(parent);
      [['Zoom in', 'zoomIn'], ['Zoom out', 'zoomOut'], ['Fit view', 'fitWindow']]
        .forEach(function (entry) {
          menu.addItem(entry[0], null, function () {
            var action = ui.actions.get(entry[1]);
            if (isCetz() && action) action.funct();
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
  function isClipboardTarget(target) {
    return [ui.clipboardElt, ui.typingShim].some(function (element) {
      return element && (element === target || element.contains && element.contains(target));
    });
  }
  function isTextTarget(target) {
    if (isClipboardTarget(target)) return false;
    for (var node = target; node; node = node.parentNode) {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(node.tagName || '') || node.isContentEditable ||
        node.contentEditable === 'true' || node.getAttribute && node.getAttribute('contenteditable') === 'true') return true;
    }
    return false;
  }
  // Native macOS/webview paste can arrive as a clipboard event rather than a
  // V keydown. Draw.io directs these events through its hidden editable div.
  ['copy', 'paste'].forEach(function (name) {
    document.addEventListener(name, function (event) {
      if (!isCetz() || !isEditablePreview() || isTextTarget(event.target) || ui.dialog ||
        graph.isEditing && graph.isEditing() || name === 'copy' && !selectedEditableCells().length) return;
      event.preventDefault(); event.stopImmediatePropagation();
      sendSourceAction(name);
    }, true);
  });
  document.addEventListener('keydown', function (event) {
    if (!isCetz() || !isEditablePreview() || !(event.metaKey || event.ctrlKey) ||
      isTextTarget(event.target) || ui.dialog || graph.isEditing && graph.isEditing()) return;
    if (event.key.toLowerCase() === 'z') {
      event.preventDefault(); event.stopImmediatePropagation();
      sendHistoryAction(event.shiftKey ? 'redo' : 'undo');
      return;
    }
    var action = event.key.toLowerCase() === 'c' ? 'copy' :
      event.key.toLowerCase() === 'v' ? 'paste' : event.key.toLowerCase() === 'd' ? 'duplicate' :
      event.key.toLowerCase() === 'g' ? event.shiftKey ? 'ungroup' : 'group' :
      event.key === ']' ? 'forward' : event.key === '[' ? 'backward' : null;
    if (!action || action !== 'paste' && !selectedEditableCells().length) return;
    // Let the native clipboard event handle the hidden input, once per gesture.
    if ((action === 'copy' || action === 'paste') && isClipboardTarget(event.target)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    sendSourceAction(action);
  }, true);
  var original = {
    deletable: graph.isCellDeletable, selectable: graph.isCellSelectable,
    cloneable: graph.isCellCloneable, visible: graph.isCellVisible,
    connectable: graph.isCellConnectable, snapDelta: graph.snapDelta, gridSize: graph.gridSize,
    constrainChild: graph.isConstrainChild,
    updateHint: graph.graphHandler && graph.graphHandler.updateHint,
    useGuidesForEvent: graph.graphHandler && graph.graphHandler.useGuidesForEvent,
    maxLivePreview: graph.graphHandler && graph.graphHandler.maxLivePreview,
    allowLivePreview: graph.graphHandler && graph.graphHandler.allowLivePreview,
    updatePreview: graph.graphHandler && graph.graphHandler.updatePreview,
    createPreviewShape: graph.graphHandler && graph.graphHandler.createPreviewShape,
    createHandler: graph.createHandler,
    updateMouseEvent: graph.updateMouseEvent,
    resetDrag: graph.graphHandler && graph.graphHandler.reset,
    moveCells: graph.graphHandler && graph.graphHandler.moveCells,
    popup: graph.popupMenuHandler && graph.popupMenuHandler.isEnabled,
    popupFactory: graph.popupMenuHandler && graph.popupMenuHandler.factoryMethod,
    undo: ui.actions.get('undo').funct, redo: ui.actions.get('redo').funct,
    undoEnabled: ui.actions.get('undo').isEnabled, redoEnabled: ui.actions.get('redo').isEnabled
  };
  ['copy', 'paste'].forEach(function (name) {
    var action = ui.actions.get(name);
    if (!action) return;
    var nativeAction = action.funct, nativeEnabled = action.isEnabled;
    action.funct = function () {
      if (isCetz() && isEditablePreview() && !(graph.isEditing && graph.isEditing())) return sendSourceAction(name);
      return nativeAction.apply(this, arguments);
    };
    action.isEnabled = function () {
      return isCetz() && isEditablePreview() && !(graph.isEditing && graph.isEditing()) ? name === 'paste' || selectedEditableCells().length > 0 :
        nativeEnabled.apply(this, arguments);
    };
  });
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
  var previousSidebarWidth = null;
  var previousSidebarDisplay = null;
  var previousFormatWidth = null;
  var previousFormatDisplay = null;
  var previousFormatOverflow = null;
  var previousFormatGutter = null;
  var previousFormatMinWidth = null;
  var previousFormatMaxWidth = null;
  var originalRefresh = ui.refresh;
  if (originalRefresh) ui.refresh = function () {
    var result = originalRefresh.apply(this, arguments);
    // Draw.io's refresh clears the inline width back to its 240px CSS rule.
    if (activeMode && ui.formatContainer) ui.formatContainer.style.width = '48px';
    return result;
  };
  var originalToggleShapesPanel = ui.toggleShapesPanel;
  if (originalToggleShapesPanel) ui.toggleShapesPanel = function () {
    if (isCetz()) return;
    return originalToggleShapesPanel.apply(this, arguments);
  };
  var originalToggleFormatPanel = ui.toggleFormatPanel;
  if (originalToggleFormatPanel) ui.toggleFormatPanel = function () {
    if (isCetz()) return;
    return originalToggleFormatPanel.apply(this, arguments);
  };
  var lastPreviewStyle = null;
  var lastEditCount = 0;
  var lastSelectionToken = null;
  var lastSourceSelection = '';
  var applyingCodeSelection = false;
  var renderedLayersReady = false;
  var renderedLayerSignature = null;
  var renderedLayerCells = [];
  var renderedLayerParents = [];
  var renderedLayerLayout = null;
  var renderedImageLoads = [];
  var fitOnLoad = true;
  var dragSvgId = 0;
  function createDragShape(bounds, image) {
    if (typeof DOMParser === 'undefined' || !document.importNode) return new mxImageShape(bounds, image);
    // An <image href="data:..."> is decoded asynchronously, and redrawing it
    // on every pointer event can replace it before it ever paints. Keep the
    // actual SVG paths in the overlay instead; movement and resizing then
    // update synchronous vector attributes, with no image-loading phase.
    return { bounds: bounds, image: image, node: null, pane: null, source: null,
      prefix: 'cetz-live-' + (++dragSvgId) + '-',
      init: function (pane) { this.pane = pane; },
      redraw: function () {
        if (this.source !== this.image) {
          var xml;
          try { xml = new DOMParser().parseFromString(decodeURIComponent(
            this.image.slice('data:image/svg+xml,'.length)), 'image/svg+xml'); }
          catch (error) { return; }
          if (xml.documentElement.localName !== 'svg' || xml.querySelector('parsererror')) return;
          var node = document.importNode(xml.documentElement, true), names = {}, prefix = this.prefix;
          Array.prototype.forEach.call(node.querySelectorAll('script'), function (script) { script.remove(); });
          Array.prototype.forEach.call(node.querySelectorAll('[id]'), function (element) {
            var id = element.getAttribute('id'); names[id] = prefix + id; element.setAttribute('id', names[id]);
          });
          [node].concat(Array.prototype.slice.call(node.querySelectorAll('*'))).forEach(function (element) {
            Array.prototype.slice.call(element.attributes).forEach(function (attribute) {
              if (/^on/i.test(attribute.name) || /^(?:javascript|vbscript):/i.test(attribute.value.trim())) {
                element.removeAttributeNode(attribute); return;
              }
              var value = attribute.value.replace(/url\(#([^)]+)\)/g, function (match, id) {
                return names[id] ? 'url(#' + names[id] + ')' : match;
              });
              if (value[0] === '#' && names[value.slice(1)]) value = '#' + names[value.slice(1)];
              attribute.value = value;
            });
          });
          node.setAttribute('pointer-events', 'none');
          node.setAttribute('preserveAspectRatio', 'none');
          node.setAttribute('data-cetz-live-preview', 'true');
          if (this.node && this.node.parentNode) this.node.parentNode.replaceChild(node, this.node);
          else this.pane.appendChild(node);
          this.node = node; this.source = this.image;
        }
        if (this.node) {
          this.node.setAttribute('x', this.bounds.x); this.node.setAttribute('y', this.bounds.y);
          this.node.setAttribute('width', this.bounds.width); this.node.setAttribute('height', this.bounds.height);
        }
      },
      destroy: function () { if (this.node && this.node.parentNode) this.node.parentNode.removeChild(this.node); this.node = null; }
    };
  }
  function restoreDragImages(handler) {
    (handler.cetzHiddenImages || []).forEach(function (entry) {
      entry.node.style.visibility = entry.visibility;
    });
    handler.cetzHiddenImages = [];
  }
  function clearDragImages(handler) {
    (handler.cetzDragImages || []).forEach(function (entry) { entry.shape.destroy(); });
    restoreDragImages(handler);
    handler.cetzDragImages = [];
  }
  // Typst emits relative SVG paths. Convert them to absolute commands before
  // moving their coordinates, so unchanged vertices do not inherit a delta.
  function deformPath(data, move) {
    var tokens = data.match(/[a-z]|[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/ig) || [];
    var counts = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7 };
    var x = 0, y = 0, startX = 0, startY = 0, command = null, output = [];
    var format = function (n) { return Number(n.toFixed(6)); };
    for (var i = 0; i < tokens.length;) {
      if (/^[a-z]$/i.test(tokens[i])) command = tokens[i++];
      if (!command) return data;
      var type = command.toUpperCase(), relative = command !== type;
      if (type === 'Z') { output.push('Z'); x = startX; y = startY; command = null; continue; }
      var count = counts[type];
      if (!count || i + count > tokens.length) return data;
      var args = tokens.slice(i, i + count).map(Number); i += count;
      if (!args.every(Number.isFinite)) return data;
      if (type === 'H') { args = [args[0] + (relative ? x : 0), y]; type = 'L'; relative = false; }
      if (type === 'V') { args = [x, args[0] + (relative ? y : 0)]; type = 'L'; relative = false; }
      var first = type === 'A' ? 5 : 0;
      var converted = args.slice(0, first);
      var lastX = x, lastY = y;
      for (var j = first; j < args.length; j += 2) {
        lastX = args[j] + (relative ? x : 0); lastY = args[j + 1] + (relative ? y : 0);
        var point = move(lastX, lastY, !(type === 'M' && /^[mM]$/.test(tokens[i] || '')));
        converted.push(format(point.x), format(point.y));
      }
      x = lastX; y = lastY;
      if (type === 'M') { startX = x; startY = y; command = relative ? 'l' : 'L'; }
      output.push(type + ' ' + converted.join(' '));
    }
    return output.join(' ');
  }
  // Recompute spline control vertices from knots, rather than warping the
  // old vertices with distance weights (which breaks down on large edits).
  function curveSegments(kind, points, style) {
    function linear() { return points.slice(1).map(function (point, i) { return [points[i], point, points[i], point]; }); }
    function lerp(a, b, t) { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }
    var closed = String(style.cetzCurveClose) === '1', p = points.slice(), count = p.length;
    if (count < 2) return [];
    if (kind === 'bezier') {
      if (count === 3) return [[p[0], p[1], lerp(p[0], p[2], 2 / 3), lerp(p[1], p[2], 2 / 3)]];
      return count >= 4 ? [[p[0], p[1], p[2], p[3]]] : linear();
    }
    if (kind === 'catmull') {
      var rawTension = Number(style.cetzCurveTension);
      var tension = Math.max(0.1, Number.isFinite(rawTension) ? rawTension : 0.5);
      var k = tension < 0.5 ? 1 / (1 + (0.5 - tension) * 18) : 1 + (tension - 0.5) * 18;
      if (count === 2) return linear();
      return Array.from({ length: closed ? count : count - 1 }, function (_, i) {
        var a = p[i], b = p[(i + 1) % count];
        var before = p[i === 0 ? closed ? count - 1 : 0 : i - 1];
        var after = p[i + 2 < count ? i + 2 : closed ? (i + 2) % count : count - 1];
        return [a, b, { x: a.x + (b.x - before.x) / (6 * k), y: a.y + (b.y - before.y) / (6 * k) },
          { x: b.x - (after.x - a.x) / (6 * k), y: b.y - (after.y - a.y) / (6 * k) }];
      });
    }
    if (kind !== 'hobby' || count === 2 && !closed) return linear();
    if (closed && Math.hypot(p[0].x - p[count - 1].x, p[0].y - p[count - 1].y) < 1e-9) p.pop();
    if (closed) p.push(p[0]);
    var n = p.length - 1, size = closed ? n : n + 1;
    var vectors = [], distances = [], gamma = [];
    for (var i = 0; i < n; i++) {
      vectors.push({ x: p[i + 1].x - p[i].x, y: p[i + 1].y - p[i].y });
      distances.push(Math.hypot(vectors[i].x, vectors[i].y));
    }
    if (distances.some(function (distance) { return distance < 1e-9; })) return linear();
    function angle(a, b) { return Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y); }
    for (var j = 0; j <= n; j++) gamma.push(j === 0 || j === n
      ? closed ? angle(vectors[n - 1], vectors[0]) : 0 : angle(vectors[j - 1], vectors[j]));
    function parameter(key, fallback) {
      try { var value = JSON.parse(decodeURIComponent(style[key])); return value == null ? fallback : value; }
      catch (error) { return fallback; }
    }
    var ta = parameter('cetzCurveTa', Array(n).fill(1)), tb = parameter('cetzCurveTb', Array(n).fill(1));
    var omega = parameter('cetzCurveOmega', [0, 0]);
    if (!Array.isArray(omega)) omega = [omega, omega];
    if (!Array.isArray(ta) || !Array.isArray(tb) || ta.length !== n || tb.length !== n ||
        ta.concat(tb).some(function (value) { return !Number.isFinite(value) || value <= 0; })) return linear();
    var a = Array(size).fill(0), b = a.slice(), c = a.slice(), d = a.slice();
    for (var row = 0; row < size; row++) {
      if (!closed && row === 0) {
        var ia = 1 / ta[0], ib = 1 / tb[0];
        b[row] = omega[0] * ia * ia * ia / (ib * ib) + 3 - ib;
        c[row] = omega[0] * ia * ia / (ib * ib) * (3 - ia) + ib;
        d[row] = -c[row] * gamma[1];
      } else if (!closed && row === n) {
        var lastA = 1 / ta[n - 1], lastB = 1 / tb[n - 1];
        a[row] = omega[1] * lastB * lastB / (lastA * lastA) * (3 - lastB) + lastA;
        b[row] = omega[1] * lastB * lastB * lastB / (lastA * lastA) + 3 - lastA;
      } else {
        var previous = (row + n - 1) % n, next = row % n;
        var pa = 1 / ta[previous], pb = 1 / tb[previous], na = 1 / ta[next], nb = 1 / tb[next];
        a[row] = pa / (distances[previous] * pb * pb);
        var leftB = (3 - pa) / (distances[previous] * pb * pb);
        b[row] = leftB + (3 - nb) / (distances[next] * na * na);
        c[row] = nb / (distances[next] * na * na);
        d[row] = -leftB * gamma[row] - c[row] * gamma[row + 1];
      }
    }
    function solve(diagonal, rhs) {
      var diagonalCopy = diagonal.slice(), out = rhs.slice();
      for (var i = 1; i < size; i++) {
        if (Math.abs(diagonalCopy[i - 1]) < 1e-12) return null;
        var factor = a[i] / diagonalCopy[i - 1];
        diagonalCopy[i] -= factor * c[i - 1]; out[i] -= factor * out[i - 1];
      }
      if (Math.abs(diagonalCopy[size - 1]) < 1e-12) return null;
      out[size - 1] /= diagonalCopy[size - 1];
      for (var j = size - 2; j >= 0; j--) out[j] = (out[j] - c[j] * out[j + 1]) / diagonalCopy[j];
      return out.every(Number.isFinite) ? out : null;
    }
    var alpha;
    if (closed) {
      var u = Array(size).fill(0); u[0] = a[0]; u[size - 1] = c[size - 1];
      var diagonal = b.map(function (value, i) { return value - u[i]; });
      var y = solve(diagonal, d), z = solve(diagonal, u);
      if (!y || !z || Math.abs(1 + z[0] + z[size - 1]) < 1e-12) return linear();
      var correction = (y[0] + y[size - 1]) / (1 + z[0] + z[size - 1]);
      alpha = y.map(function (value, i) { return value - z[i] * correction; }); alpha.push(alpha[0]);
    } else alpha = solve(b, d);
    if (!alpha) return linear();
    function rho(x, y) {
      return (2 + Math.SQRT2 * (Math.sin(x) - Math.sin(y) / 16) * (Math.sin(y) - Math.sin(x) / 16) *
        (Math.cos(x) - Math.cos(y))) / (1 + Math.cos(x) * (Math.sqrt(5) - 1) / 2 + Math.cos(y) * (3 - Math.sqrt(5)) / 2);
    }
    var curves = vectors.map(function (vector, i) {
      var beta = -alpha[i + 1] - gamma[i + 1];
      var first = rho(alpha[i], beta) / 3, second = rho(beta, alpha[i]) / 3;
      return [p[i], p[i + 1],
        { x: p[i].x + first * (vector.x * Math.cos(alpha[i]) - vector.y * Math.sin(alpha[i])),
          y: p[i].y + first * (vector.x * Math.sin(alpha[i]) + vector.y * Math.cos(alpha[i])) },
        { x: p[i + 1].x - second * (vector.x * Math.cos(-beta) - vector.y * Math.sin(-beta)),
          y: p[i + 1].y - second * (vector.x * Math.sin(-beta) + vector.y * Math.cos(-beta)) }];
    });
    return curves.every(function (curve) { return curve.every(function (point) {
      return Number.isFinite(point.x) && Number.isFinite(point.y);
    }); }) ? curves : linear();
  }
  function deformPointImage(cell, parent, pointCell, dx, dy, resize) {
    var match = /(?:^|;)image=(data:image\/svg\+xml,[^;]+)(?:;|$)/.exec(cell.style || '');
    if (!match) return null;
    var svg;
    try { svg = decodeURIComponent(match[1].slice('data:image/svg+xml,'.length)); }
    catch (error) { return null; }
    var viewBox = /\bviewBox="([^"]+)"/.exec(svg);
    var box = viewBox && viewBox[1].trim().split(/[\s,]+/).map(Number);
    if (!box || box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0) return null;
    var g = cell.geometry, owner = parent.geometry, point = pointCell && pointCell.geometry;
    if (resize) point = { x: 0, y: 0, width: 0, height: 0 };
    if (!g || !owner || !point) return null;
    var unitX = g.width / box[2], unitY = g.height / box[3];
    var left = owner.x + g.x, top = owner.y + g.y;
    var px = point.x + point.width / 2, py = point.y + point.height / 2;
    var pointOwner = parent.id.slice('cetz-edit-'.length);
    var model = graph.getModel(), cells = model.cells || {};
    var others = Object.keys(cells).filter(function (id) {
      return (!pointCell || id !== pointCell.id) && id.indexOf('cetz-point-' + pointOwner + '-') === 0;
    }).map(function (id) { return cells[id].geometry; }).filter(Boolean);
    var style = graph.getCellStyle(parent), kind = style.cetzKind;
    var allPoints = Object.keys(cells).filter(function (id) {
      return id.indexOf('cetz-point-' + pointOwner + '-') === 0;
    }).sort(function (a, b) { return Number(a.split('-').pop()) - Number(b.split('-').pop()); })
      .map(function (id) { var g = cells[id].geometry; return { x: g.x + g.width / 2, y: g.y + g.height / 2,
        selected: !!pointCell && id === pointCell.id }; });
    var mainLayer = Object.keys(cells).find(function (id) {
      var child = cells[id], p = model.getParent ? model.getParent(child) : child.parent;
      return /^cetz-render-/.test(id) && p === parent;
    }) === cell.id;
    var nextPoints = allPoints.map(function (p) { return resize ? resize.move(p.x, p.y) :
      { x: p.x + (p.selected ? dx : 0), y: p.y + (p.selected ? dy : 0) }; });
    var curved = ['bezier', 'catmull', 'hobby'].indexOf(kind) >= 0;
    var newCurves = curved ? curveSegments(kind, nextPoints, style) : null;
    var curves = mainLayer ? newCurves : null;
    var rigid = null, lineEnds = null;
    function rigidMotion(from, to, before, after) {
      return { from: from, to: to,
        angle: Math.atan2(after.y, after.x) - Math.atan2(before.y, before.x) };
    }
    function applyRigid(motion, x, y) {
      return { x: motion.to.x + (x - motion.from.x) * Math.cos(motion.angle) - (y - motion.from.y) * Math.sin(motion.angle),
        y: motion.to.y + (x - motion.from.x) * Math.sin(motion.angle) + (y - motion.from.y) * Math.cos(motion.angle) };
    }
    if (curved && !mainLayer && newCurves.length) {
      var oldCurves = curveSegments(kind, allPoints, style);
      var center = { x: left + g.width / 2, y: top + g.height / 2 };
      var endAnchor = allPoints[kind === 'bezier' ? 1 : allPoints.length - 1];
      var atEnd = Math.hypot(center.x - allPoints[0].x, center.y - allPoints[0].y) >
        Math.hypot(center.x - endAnchor.x, center.y - endAnchor.y);
      var oldCurve = oldCurves[atEnd ? oldCurves.length - 1 : 0];
      var newCurve = newCurves[atEnd ? newCurves.length - 1 : 0];
      var endIndex = atEnd ? 1 : 0, controlIndex = atEnd ? 3 : 2;
      rigid = rigidMotion(oldCurve[endIndex], newCurve[endIndex],
        { x: oldCurve[controlIndex].x - oldCurve[endIndex].x, y: oldCurve[controlIndex].y - oldCurve[endIndex].y },
        { x: newCurve[controlIndex].x - newCurve[endIndex].x, y: newCurve[controlIndex].y - newCurve[endIndex].y });
    }
    if (kind === 'line' && resize && allPoints.length >= 2) {
      lineEnds = [0, allPoints.length - 1].map(function (index) {
        var neighbour = index === 0 ? 1 : index - 1;
        return rigidMotion(allPoints[index], nextPoints[index],
          { x: allPoints[neighbour].x - allPoints[index].x, y: allPoints[neighbour].y - allPoints[index].y },
          { x: nextPoints[neighbour].x - nextPoints[index].x, y: nextPoints[neighbour].y - nextPoints[index].y });
      });
      if (!mainLayer) rigid = lineEnds[Math.hypot(left + g.width / 2 - lineEnds[0].from.x, top + g.height / 2 - lineEnds[0].from.y) <
        Math.hypot(left + g.width / 2 - lineEnds[1].from.x, top + g.height / 2 - lineEnds[1].from.y) ? 0 : 1];
    }
    var lineTurn = null;
    if (kind === 'line' && !resize) {
      var indices = Object.keys(cells).filter(function (id) {
        return id.indexOf('cetz-point-' + pointOwner + '-') === 0;
      }).map(function (id) { return Number(id.split('-').pop()); });
      var index = Number(pointCell.id.split('-').pop()), last = Math.max.apply(Math, indices);
      var neighbour = cells['cetz-point-' + pointOwner + '-' + (index === 0 ? 1 : index - 1)];
      if ((index === 0 || index === last) && neighbour && neighbour.geometry) {
        var nx = neighbour.geometry.x + neighbour.geometry.width / 2;
        var ny = neighbour.geometry.y + neighbour.geometry.height / 2;
        lineTurn = Math.atan2(py + dy - ny, px + dx - nx) - Math.atan2(py - ny, px - nx);
      }
    }
    var arc = null;
    if (kind === 'arc' && !resize) {
      var endCell = cells['cetz-point-' + pointOwner + '-2'];
      var startCell = cells['cetz-point-' + pointOwner + '-0'];
      var endStyle = endCell && graph.getCellStyle(endCell);
      if (endStyle && startCell && startCell.geometry) {
        var start = startCell.geometry;
        arc = { x: Number(endStyle.cetzArcCenterX), y: Number(endStyle.cetzArcCenterY),
          rx: Number(endStyle.cetzArcRadiusX), ry: Number(endStyle.cetzArcRadiusY),
          span: -Number(endStyle.cetzArcSpan) * Math.PI / 180,
          startX: start.x + start.width / 2, startY: start.y + start.height / 2 };
        if (![arc.x, arc.y, arc.rx, arc.ry, arc.span].every(Number.isFinite) || arc.rx <= 0 || arc.ry <= 0)
          arc = null;
        if (arc) arc.angle = Math.atan2((arc.startY - arc.y) / arc.ry, (arc.startX - arc.x) / arc.rx);
      }
    }
    var minX = box[0], minY = box[1], maxX = box[0] + box[2], maxY = box[1] + box[3];
    var margin = Math.max.apply(Math, [2].concat((svg.match(/\bstroke-width="[\d.]+"/g) || [])
      .map(function (attribute) { return Number(attribute.split('"')[1]) / 2 + 1; })));
    function moveWorld(x, y) {
      if (rigid) return applyRigid(rigid, x, y);
      if (lineEnds && !allPoints.some(function (p) { return Math.hypot(p.x - x, p.y - y) < 0.1; }))
        return applyRigid(lineEnds[Math.hypot(x - lineEnds[0].from.x, y - lineEnds[0].from.y) <
          Math.hypot(x - lineEnds[1].from.x, y - lineEnds[1].from.y) ? 0 : 1], x, y);
      if (resize) return resize.move(x, y);
      if (arc && /-1$/.test(pointCell.id)) {
        var cx = arc.x + dx, cy = arc.y + dy, aspect = arc.ry / arc.rx;
        var rx = Math.hypot(arc.startX - cx, (arc.startY - cy) / aspect), ry = rx * aspect;
        if (rx < 1e-9 || ry < 1e-9) return { x: cx, y: cy };
        var angle = Math.atan2((arc.startY - cy) / ry, (arc.startX - cx) / rx) - arc.angle;
        var nx = (x - arc.x) / arc.rx, ny = (y - arc.y) / arc.ry;
        return { x: cx + rx * (nx * Math.cos(angle) - ny * Math.sin(angle)),
          y: cy + ry * (nx * Math.sin(angle) + ny * Math.cos(angle)) };
      }
      var distance = Math.pow(x - px, 2) + Math.pow(y - py, 2);
      var nearest = Math.min.apply(Math, others.map(function (other) {
        return Math.pow(x - other.x - other.width / 2, 2) + Math.pow(y - other.y - other.height / 2, 2);
      }));
      if (lineTurn != null && distance < nearest) return {
        x: px + dx + (x - px) * Math.cos(lineTurn) - (y - py) * Math.sin(lineTurn),
        y: py + dy + (x - px) * Math.sin(lineTurn) + (y - py) * Math.cos(lineTurn) };
      var weight = distance < 0.01 ? 1 : 0;
      return { x: x + dx * weight, y: y + dy * weight };
    }
    var definitions = [];
    svg = svg.replace(/<defs\b[\s\S]*?<\/defs>/g, function (defs) {
      definitions.push(defs); return '<!--cetz-defs-' + (definitions.length - 1) + '-->';
    });
    svg = svg.replace(/<path\b[^>]*\bd="[^"]*"[^>]*\/>/g, function (path) {
      var translation = /\btransform="translate\(([^)]+)\)"/.exec(path);
      if (/\btransform=/.test(path) && !translation) return path;
      var translate = translation ? translation[1].trim().split(/[\s,]+/).map(Number) : [0, 0];
      var tx = translate[0], ty = translate[1] || 0;
      function toSvg(x, y, visible) {
        var nextX = box[0] + (x - left) / unitX;
        var nextY = box[1] + (y - top) / unitY;
        if (visible !== false) {
          minX = Math.min(minX, nextX - margin); minY = Math.min(minY, nextY - margin);
          maxX = Math.max(maxX, nextX + margin); maxY = Math.max(maxY, nextY + margin);
        }
        return { x: nextX - tx, y: nextY - ty };
      }
      return path.replace(/\bd="([^"]*)"/, function (_, data) {
        if (curves && curves.length) {
          var origin = toSvg(curves[0][0].x, curves[0][0].y);
          var commands = ['M ' + origin.x + ' ' + origin.y];
          curves.forEach(function (curve) {
            var vertices = [curve[2], curve[3], curve[1]].map(function (p) { return toSvg(p.x, p.y); });
            commands.push('C ' + vertices.map(function (p) { return p.x + ' ' + p.y; }).join(' '));
          });
          if (String(style.cetzCurveClose) === '1') commands.push('Z');
          return 'd="' + commands.join(' ') + '"';
        }
        if (arc && /-2$/.test(pointCell.id)) {
          var stop = Math.atan2((py + dy - arc.y) / arc.ry, (px + dx - arc.x) / arc.rx);
          stop += 2 * Math.PI * Math.round((arc.angle + arc.span - stop) / (2 * Math.PI));
          var segments = Math.max(1, Math.ceil(Math.abs(stop - arc.angle) / (Math.PI / 2)));
          var step = (stop - arc.angle) / segments;
          var at = function (angle) { return toSvg(arc.x + arc.rx * Math.cos(angle), arc.y + arc.ry * Math.sin(angle)); };
          var begin = at(arc.angle), commands = ['M ' + begin.x + ' ' + begin.y];
          for (var s = 0; s < segments; s++) {
            var a = arc.angle + s * step, b = a + step, k = 4 / 3 * Math.tan(step / 4);
            var c1 = toSvg(arc.x + arc.rx * (Math.cos(a) - k * Math.sin(a)),
              arc.y + arc.ry * (Math.sin(a) + k * Math.cos(a)));
            var c2 = toSvg(arc.x + arc.rx * (Math.cos(b) + k * Math.sin(b)),
              arc.y + arc.ry * (Math.sin(b) - k * Math.cos(b)));
            var end = at(b);
            commands.push('C ' + [c1.x, c1.y, c2.x, c2.y, end.x, end.y].join(' '));
          }
          return 'd="' + commands.join(' ') + '"';
        }
        return 'd="' + deformPath(data, function (x, y, visible) {
          var moved = moveWorld(left + (x + tx - box[0]) * unitX,
            top + (y + ty - box[1]) * unitY);
          return toSvg(moved.x, moved.y, visible);
        }) + '"';
      });
    });
    svg = svg.replace(/<!--cetz-defs-(\d+)-->/g, function (_, index) { return definitions[Number(index)]; });
    svg = svg.replace(/\bviewBox="[^"]*"/, 'viewBox="' + [minX, minY, maxX - minX, maxY - minY].join(' ') + '"')
      .replace(/\bwidth="[^"]*"/, 'width="' + (maxX - minX) + '"')
      .replace(/\bheight="[^"]*"/, 'height="' + (maxY - minY) + '"');
    return { image: 'data:image/svg+xml,' + encodeURIComponent(svg), geometry: {
      x: g.x + (minX - box[0]) * unitX, y: g.y + (minY - box[1]) * unitY,
      width: (maxX - minX) * unitX, height: (maxY - minY) * unitY } };
  }
  function updateDragImages(handler, remote) {
    if (remote || handler.suspended || handler.cloning || !isEditablePreview() ||
        typeof mxImageShape === 'undefined' && (typeof DOMParser === 'undefined' || !document.importNode) ||
        typeof mxRectangle === 'undefined') {
      clearDragImages(handler); return;
    }
    var dx = handler.currentDx, dy = handler.currentDy;
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || dx === 0 && dy === 0 && !handler.cetzResizeBounds) {
      clearDragImages(handler); return;
    }
    var moving = {};
    (handler.cells || graph.getSelectionCells()).forEach(function (cell) {
      if (/^cetz-edit-\d+$/.test(cell.id || '')) moving[cell.id] = cell;
      var point = /^cetz-point-(\d+)-\d+$/.exec(cell.id || '');
      if (point && cell.geometry) moving['cetz-edit-' + point[1]] = cell;
    });
    var model = graph.getModel(), cells = model.cells || {}, scale = graph.view.scale || 1;
    var fallback = model.getCell('cetz-preview-image');
    var fallbackState = !renderedLayersReady && fallback && graph.view.getState(fallback);
    var fallbackNode = fallbackState && fallbackState.shape && fallbackState.shape.node;
    var repaintScene = !!fallbackNode;
    var images = handler.cetzDragImages || [];
    var next = [];
    restoreDragImages(handler);
    Object.keys(cells).forEach(function (id) {
      if (!/^cetz-render-\d+$/.test(id)) return;
      var cell = cells[id], parent = model.getParent ? model.getParent(cell) : cell.parent;
      if (!parent || !moving[parent.id] && !repaintScene) return;
      var state = graph.view.getState(parent), geometry = cell.geometry;
      var source = /(?:^|;)image=(data:image\/svg\+xml,[^;]+)(?:;|$)/.exec(cell.style || '');
      if (!state || !geometry || !source ||
          ![geometry.x, geometry.y, geometry.width, geometry.height].every(Number.isFinite) ||
          geometry.width <= 0 || geometry.height <= 0) return;
      var selected = moving[parent.id], image = source[1], target = selected && handler.cetzResizeBounds;
      var pointEdit = selected && /^cetz-point-/.test(selected.id || '');
      var translatePoint = pointEdit && (graph.getCellStyle(parent).cetzKind === 'content' ||
        graph.getCellStyle(parent).cetzKind === 'arc' && /-0$/.test(selected.id));
      if (pointEdit && !translatePoint) {
        var deformed = deformPointImage(cell, parent, selected, dx / scale, dy / scale);
        if (deformed) { geometry = deformed.geometry; image = deformed.image; }
      }
      var transformed = false;
      if (target) {
        var factorX = target.width / (parent.geometry.width * scale);
        var factorY = target.height / (parent.geometry.height * scale);
        var originX = parent.geometry.x + (target.x - state.x) / scale;
        var originY = parent.geometry.y + (target.y - state.y) / scale;
        var resized = deformPointImage(cell, parent, null, 0, 0, { move: function (x, y) {
          return { x: originX + (x - parent.geometry.x) * factorX,
            y: originY + (y - parent.geometry.y) * factorY };
        } });
        if (resized) { geometry = resized.geometry; image = resized.image; transformed = true; }
      }
      var sx = target && !transformed ? target.width / (parent.geometry.width * scale) : 1;
      var sy = target && !transformed ? target.height / (parent.geometry.height * scale) : 1;
      var offsetX = !selected || pointEdit && !translatePoint ? 0 : dx;
      var offsetY = !selected || pointEdit && !translatePoint ? 0 : dy;
      var bounds = new mxRectangle((target && !transformed ? target.x : state.x) + geometry.x * scale * sx + offsetX,
        (target && !transformed ? target.y : state.y) + geometry.y * scale * sy + offsetY,
        geometry.width * scale * sx, geometry.height * scale * sy);
      var entry = images.find(function (candidate) { return candidate.cell === cell; });
      if (!entry) {
        var shape = createDragShape(bounds, image);
        shape.dialect = mxConstants.DIALECT_SVG;
        shape.preserveImageAspect = false;
        shape.pointerEvents = false;
        shape.init(graph.view.getOverlayPane());
        entry = { cell: cell, shape: shape };
      }
      entry.shape.bounds = bounds;
      entry.shape.image = image;
      entry.shape.redraw();
      entry.moving = !!selected;
      next.push(entry);
      // Hide only this element's original image node, leaving other elements
      // and the complete fallback drawing intact throughout the gesture.
      var originalState = graph.view.getState(cell);
      var node = originalState && originalState.shape && originalState.shape.node;
      if (node && node.style) {
        handler.cetzHiddenImages = handler.cetzHiddenImages || [];
        if (!handler.cetzHiddenImages.some(function (hidden) { return hidden.node === node; }))
          handler.cetzHiddenImages.push({ node: node, visibility: node.style.visibility });
        node.style.visibility = 'hidden';
      }
    });
    images.forEach(function (entry) { if (next.indexOf(entry) < 0) entry.shape.destroy(); });
    handler.cetzDragImages = next;
    // If the full fallback image is still being used, redraw its other
    // fragments as stationary vectors too. This removes the old copy of the
    // moving shape without making its neighbours disappear.
    if (repaintScene && next.length === Object.keys(cells).filter(function (id) {
      return /^cetz-render-\d+$/.test(id);
    }).length && next.every(function (entry) { return !!entry.shape.node; })) {
      handler.cetzHiddenImages.push({ node: fallbackNode, visibility: fallbackNode.style.visibility });
      fallbackNode.style.visibility = 'hidden';
    }
  }
  function updateResizeImages(handler) {
    var state = handler.state;
    if (!state || state.view.graph !== graph || !isEditablePreview() || !handler.bounds ||
        !/^cetz-edit-\d+$/.test(state.cell.id || '')) return;
    var preview = handler.cetzResizePreview || { currentDx: 0, currentDy: 0 };
    preview.cells = [state.cell];
    preview.cetzResizeBounds = handler.bounds;
    handler.cetzResizePreview = preview;
    updateDragImages(preview);
  }
  function hideBorderNode(shape) {
    if (shape.node && shape.node.style) {
      shape.node.style.opacity = '0';
      shape.node.style.pointerEvents = 'none';
    }
  }
  function suppressBorderShape(shape) {
    if (!shape) return;
    if (!shape.cetzSuppressedBorder && typeof shape.redraw === 'function') {
      var nativeRedraw = shape.redraw;
      shape.redraw = function () {
        this.opacity = 0;
        this.pointerEvents = false;
        var result = nativeRedraw.apply(this, arguments);
        hideBorderNode(this);
        return result;
      };
      shape.cetzSuppressedBorder = true;
    }
    shape.opacity = 0;
    shape.pointerEvents = false;
    hideBorderNode(shape);
  }
  function isCetzSelectionHandler(handler) {
    return handler && handler.state && handler.state.view.graph === graph &&
      /^cetz-(?:edit-\d+|point-\d+-\d+)$/.test(handler.state.cell.id || '');
  }
  function usesCetzPointHandles(handler) {
    if (!isCetzSelectionHandler(handler)) return false;
    var cell = handler.state.cell;
    return /^cetz-point-/.test(cell.id) ||
      ['line', 'bezier', 'hobby', 'catmull', 'arc', 'content', 'anchor', 'group', 'mark']
        .includes(graph.getCellStyle(cell).cetzKind);
  }
  function suppressHandlerBorders(handler) {
    if (isCetzSelectionHandler(handler)) {
      // A cached handler may predate plugin loading. Refresh/reset can also
      // repaint its frame, so suppress the actual shape and its redraw path.
      [handler.selectionBorder, handler.preview, handler.ghostPreview, handler.parentHighlight]
        .forEach(suppressBorderShape);
      // Cached handlers can already have the eight native box handles. The
      // CeTZ endpoint/control cells provide the handles for these shapes.
      if (usesCetzPointHandles(handler) && handler.index == null && handler.sizers && handler.destroySizers) {
        handler.destroySizers();
      }
    }
    return handler;
  }
  function suppressCachedSelectionBorders() {
    var selection = graph.selectionCellsHandler;
    if (selection && selection.getHandler) graph.getSelectionCells().forEach(function (cell) {
      suppressHandlerBorders(selection.getHandler(cell));
    });
  }
  if (typeof mxVertexHandler !== 'undefined') {
    var nativeHandlesVisible = mxVertexHandler.prototype.isHandlesVisible;
    if (nativeHandlesVisible) mxVertexHandler.prototype.isHandlesVisible = function () {
      return !usesCetzPointHandles(this) && nativeHandlesVisible.apply(this, arguments);
    };
    var nativeSelectionShape = mxVertexHandler.prototype.createSelectionShape;
    if (nativeSelectionShape) mxVertexHandler.prototype.createSelectionShape = function () {
      var shape = nativeSelectionShape.apply(this, arguments);
      if (isCetzSelectionHandler(this)) suppressBorderShape(shape);
      return shape;
    };
    var nativeResizeVertex = mxVertexHandler.prototype.resizeVertex;
    var nativeVertexReset = mxVertexHandler.prototype.reset;
    if (nativeResizeVertex) mxVertexHandler.prototype.resizeVertex = function () {
      var result = nativeResizeVertex.apply(this, arguments);
      updateResizeImages(this);
      return result;
    };
    if (nativeVertexReset) mxVertexHandler.prototype.reset = function () {
      if (this.cetzResizePreview) clearDragImages(this.cetzResizePreview);
      return nativeVertexReset.apply(this, arguments);
    };
  }
  function updateRenderedLayers(active) {
    var model = graph.getModel(), cells = model.cells || {};
    var layers = active && isEditablePreview() ? Object.keys(cells).filter(function (id) {
      return /^cetz-render-\d+$/.test(id);
    }).map(function (id) { return cells[id]; }) : [];
    var hadLayers = renderedLayerCells.length > 0;
    var parents = layers.map(function (cell) { return model.getParent ? model.getParent(cell) : cell.parent; });
    var structureChanged = layers.length !== renderedLayerCells.length || layers.some(function (cell, index) {
      return cell !== renderedLayerCells[index] || parents[index] !== renderedLayerParents[index];
    });
    function bounds(cell) {
      var g = cell && cell.geometry;
      return g ? [g.x, g.y, g.width, g.height] : null;
    }
    var layout = JSON.stringify(layers.map(function (cell, index) {
      return [cell.id, parents[index] && parents[index].id, bounds(cell), bounds(parents[index])];
    }));
    var layoutChanged = layout !== renderedLayerLayout;
    renderedLayerCells = layers;
    renderedLayerParents = parents;
    renderedLayerLayout = layout;
    if (structureChanged || layoutChanged) {
      if (graph.graphHandler) clearDragImages(graph.graphHandler);
      // A restored layer can contain the identical SVG but be a new cell.
      // Discard stale visibility/DOM state without resetting zoom or fitting.
      if (structureChanged && hadLayers && graph.view.clear) graph.view.clear();
    }
    var images = [];
    var valid = layers.length > 0 && layers.every(function (cell) {
      var image = /(?:^|;)image=(data:image\/svg\+xml,[^;]+)(?:;|$)/.exec(cell.style || '');
      var geometry = cell.geometry;
      var parent = model.getParent ? model.getParent(cell) : cell.parent;
      if (!image || !geometry || !parent ||
          ![geometry.x, geometry.y, geometry.width, geometry.height].every(Number.isFinite) ||
          geometry.width <= 0 || geometry.height <= 0) return false;
      images.push(image[1]);
      return true;
    });
    var signature = valid ? JSON.stringify(images) : null;
    if (signature !== renderedLayerSignature) {
      renderedLayerSignature = signature;
      renderedImageLoads = [];
      if (valid && typeof Image !== 'undefined') {
        renderedImageLoads = Array.from(new Set(images)).map(function (src) {
          return { src: src, loaded: false, image: new Image() };
        });
        renderedImageLoads.forEach(function (entry) {
          entry.image.onload = function () {
            entry.loaded = true;
            if (signature === renderedLayerSignature) setTimeout(update, 0);
          };
          entry.image.onerror = function () {
            entry.loaded = false;
            if (signature === renderedLayerSignature) setTimeout(update, 0);
          };
          entry.image.src = entry.src;
        });
      }
    }
    var ready = valid && renderedImageLoads.length > 0 && renderedImageLoads.every(function (entry) {
      return entry.loaded;
    });
    var changed = renderedLayersReady !== ready || structureChanged || layoutChanged;
    renderedLayersReady = ready;
    return changed;
  }
  function syncCodeSelection() {
    if (!isEditablePreview()) return;
    var cells = graph.getModel().cells || {};
    var markerId = Object.keys(cells).filter(function (id) { return /^cetz-select-[\w-]+$/.test(id); }).sort().pop();
    if (!markerId || markerId === lastSelectionToken) return;
    lastSelectionToken = markerId;
    var indices = /(?:^|;)cetzSelect=([\d,]+)(?:;|$)/.exec(cells[markerId].style || '')?.[1];
    var targets = indices ? indices.split(',').map(function (index) {
      return graph.getModel().getCell('cetz-edit-' + index);
    }).filter(Boolean) : [];
    if (targets.length) {
      applyingCodeSelection = true;
      try {
        if (targets.length === 1) graph.setSelectionCell(targets[0]);
        else graph.setSelectionCells(targets);
      }
      finally { applyingCodeSelection = false; }
    }
  }
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
  var hiddenChrome = new Map();
  var rulerWasVisible = false;
  var errorBar = document.createElement('div');
  errorBar.className = 'cetzErrorBar';
  errorBar.setAttribute('role', 'status');
  errorBar.setAttribute('aria-live', 'polite');
  errorBar.style.cssText = 'box-sizing:border-box;grid-column:1 / -1;grid-row:4;display:none;' +
    'max-height:112px;overflow:auto;padding:7px 12px;border-top:1px solid #d97706;' +
    'background:#fff7ed;color:#7c2d12;font:12px/1.4 sans-serif;white-space:pre-wrap;z-index:2;';
  if (ui.container) ui.container.appendChild(errorBar);
  function updateErrorBar(active) {
    var file = active && ui.getCurrentFile();
    var data = file && file.getData && file.getData();
    var attribute = typeof data === 'string' && /<mxfile\b[^>]*\bcetzStatus="([^"]*)"/.exec(data);
    var message = '';
    if (attribute) {
      try { message = decodeURIComponent(attribute[1]); }
      catch (error) { message = attribute[1]; }
    }
    errorBar.textContent = message ? 'CeTZ error: ' + message : '';
    errorBar.style.display = active && message ? 'block' : 'none';
  }
  function setDisplay(element, visible) {
    if (element) element.style.display = visible ? '' : 'none';
  }
  function hideChrome(element, active) {
    if (!element) return;
    if (active) {
      if (!hiddenChrome.has(element)) hiddenChrome.set(element, element.style.display);
      element.style.display = 'none';
    }
  }
  function updateChrome(active) {
    if (!active) {
      hiddenChrome.forEach(function (display, element) { element.style.display = display; });
      hiddenChrome.clear();
      return;
    }
    // Standard menus and native format controls expose edits that cannot be written to Typst.
    if (ui.menubar && ui.menubar.container) {
      Array.prototype.forEach.call(ui.menubar.container.children, function (element) {
        if (element !== cetzMenu && element !== ui.statusContainer) hideChrome(element, true);
      });
    }
    hideChrome(ui.toolbarContainer, true);
    if (ui.formatContainer) {
      Array.prototype.forEach.call(ui.formatContainer.children, function (element) {
        if (element !== rail) hideChrome(element, true);
      });
      ui.formatContainer.style.display = '';
      if (rail.parentNode !== ui.formatContainer) ui.formatContainer.appendChild(rail);
      rail.style.display = 'block';
    }
    hideChrome(ui.tabContainer, true);
    // The shape-library buttons are siblings of the palette, above its entries.
    var sidebarParent = sidebar.container && sidebar.container.parentNode;
    if (sidebarParent) Array.prototype.forEach.call(sidebarParent.children, function (element) {
      if (element !== sidebar.container && /(?:^|\s)geButton(?:\s|$)/.test(element.className || ''))
        hideChrome(element, true);
    });
  }
  if (ui.updateTabContainer) {
    var originalUpdateTabContainer = ui.updateTabContainer;
    ui.updateTabContainer = function () {
      var result = originalUpdateTabContainer.apply(this, arguments);
      if (isCetz()) hideChrome(ui.tabContainer, true);
      return result;
    };
  }
  if (ui.setRulerVisible) {
    var originalSetRulerVisible = ui.setRulerVisible;
    ui.setRulerVisible = function (visible) {
      if (isCetz() && visible) return;
      return originalSetRulerVisible.apply(this, arguments);
    };
  }
  function updateRuler(active, changed) {
    if (active && changed) {
      rulerWasVisible = !!ui.ruler;
      if (ui.ruler) {
        ui.ruler.destroy();
        ui.ruler = null;
      }
    } else if (!active && changed && rulerWasVisible && ui.setRulerVisible) {
      rulerWasVisible = false;
      ui.setRulerVisible(true);
    }
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
  function snapStep() {
    var scale = graph.view && graph.view.scale || 1;
    return 0.25 / Math.pow(2, Math.min(10, Math.max(0, Math.floor(Math.log2(Math.max(1, scale))))));
  }
  function snapValue(value) { var step = snapStep(); return Number((Math.round(value / step) * step).toFixed(8)); }
  function updateSnapGrid() {
    if (!isCetz() || !isEditablePreview()) return;
    var frame = cetzFrame();
    if (!frame) return;
    var size = Number((frame.unitX * snapStep()).toFixed(8));
    if (graph.gridSize !== size) {
      graph.gridSize = size;
      if (graph.view.validateBackground) graph.view.validateBackground();
    }
    if (placement) { placementHint(); previewPlacement(); }
  }
  if (graph.view && graph.view.addListener) {
    graph.view.addListener('scale', updateSnapGrid);
    graph.view.addListener('scaleAndTranslate', updateSnapGrid);
  }
  function clearPointGuides(handler) {
    handler.cetzGuideSnap = null;
    handler.cetzPointGuideActive = false;
  }
  function preparePointGuide(handler, cell) {
    var guide = handler.guide;
    if (!guide || guide.cetzPointGuide) return;
    guide.cetzPointGuide = true;
    guide.getGuideColor = function () { return '#0088cf'; };
    var ownerId = 'cetz-edit-' + cell.id.split('-')[2];
    var states = guide.states.filter(function (state) {
      return state.cell && state.cell !== cell && state.cell.id !== ownerId &&
        /^cetz-(?:edit|point)-\d+/.test(state.cell.id || '');
    }).map(function (state) {
      if (!/^cetz-point-/.test(state.cell.id)) return state;
      var point = new mxRectangle(state.getCenterX(), state.getCenterY(), 0, 0);
      point.cell = state.cell;
      return point;
    });
    guide.setStates(states);
    // Align the mathematical point, rather than the edges of its 14px handle.
    var move = guide.move;
    guide.move = function (bounds, delta, gridEnabled, clone) {
      var scale = graph.view.scale || 1;
      var center = new mxRectangle(bounds.x + 7 * scale, bounds.y + 7 * scale, 0, 0);
      handler.cetzPointGuideActive = true;
      try {
        var style = graph.getCellStyle(cell);
        if (style.cetzArcHandle === 'end') {
          // The endpoint must stay on its ellipse. Pick one reachable alignment
          // and let snapDelta solve the other coordinate on that ellipse.
          var translate = graph.view.translate || { x: 0, y: 0 };
          var cx = (Number(style.cetzArcCenterX) + translate.x) * scale;
          var cy = (Number(style.cetzArcCenterY) + translate.y) * scale;
          var rx = Number(style.cetzArcRadiusX) * scale, ry = Number(style.cetzArcRadiusY) * scale;
          var px = center.x + delta.x, py = center.y + delta.y;
          var tolerance = Math.max(2, this.getGuideTolerance(gridEnabled) * scale);
          var best = null;
          states.forEach(function (state) {
            if (guide.isStateIgnored(state)) return;
            ['x', 'y'].forEach(function (axis) {
              var values = axis === 'x' ? [state.x, state.getCenterX(), state.x + state.width] :
                [state.y, state.getCenterY(), state.y + state.height];
              values.forEach(function (value) {
                var ratio = axis === 'x' ? (value - cx) / rx : (value - cy) / ry;
                if (!Number.isFinite(ratio) || Math.abs(ratio) > 1) return;
                var x = axis === 'x' ? value : cx + (px < cx ? -1 : 1) * rx * Math.sqrt(1 - ratio * ratio);
                var y = axis === 'y' ? value : cy + (py < cy ? -1 : 1) * ry * Math.sqrt(1 - ratio * ratio);
                var distance = Math.hypot(x - px, y - py);
                if (distance < tolerance && (!best || distance < best.distance))
                  best = { axis: axis, x: x, y: y, state: state, distance: distance };
              });
            });
          });
          this.distanceEnabled = false;
          if (!best) {
            this.hide();
            return graph.snapDelta(delta, center, !gridEnabled, false, false);
          }
          var target = new mxRectangle(best.x, best.y, 0, 0);
          target.cell = best.state.cell;
          this.setStates([target]);
          this.horizontal = best.axis === 'x'; this.vertical = best.axis === 'y';
        }
        return move.call(this, center, delta, gridEnabled, clone);
      }
      finally { handler.cetzPointGuideActive = false; }
    };
  }
  if (typeof mxVertexHandler !== 'undefined' && mxVertexHandler.prototype.updateHint) {
    var originalUnion = mxVertexHandler.prototype.union;
    if (originalUnion) mxVertexHandler.prototype.union = function (bounds, dx, dy, index, gridEnabled, scale) {
      var frame = this.graph === graph && isEditablePreview() && cetzFrame();
      if (!frame) return originalUnion.apply(this, arguments);
      var args = Array.prototype.slice.call(arguments), factor = scale || 1;
      args[0] = new mxRectangle(bounds.x - frame.originX * factor, bounds.y - frame.originY * factor, bounds.width, bounds.height);
      var result = originalUnion.apply(this, args);
      result.x += frame.originX * factor; result.y += frame.originY * factor;
      return result;
    };
    var originalRoundLength = mxVertexHandler.prototype.roundLength;
    if (originalRoundLength) mxVertexHandler.prototype.roundLength = function (value) {
      return this.graph === graph && isEditablePreview() ? Number(value.toFixed(8)) : originalRoundLength.apply(this, arguments);
    };
    var originalResizeCell = mxVertexHandler.prototype.resizeCell;
    if (originalResizeCell) mxVertexHandler.prototype.resizeCell = function (cell) {
      if (this.graph !== graph || !isEditablePreview() || !/^cetz-edit-\d+$/.test(cell.id || ''))
        return originalResizeCell.apply(this, arguments);
      var model = graph.getModel();
      model.beginUpdate();
      try {
        graph.setCellStyles('cetzSnapStep', String(snapStep()), [cell]);
        graph.setCellStyles('cetzGuideX', null, [cell]);
        graph.setCellStyles('cetzGuideY', null, [cell]);
        return originalResizeCell.apply(this, arguments);
      } finally { model.endUpdate(); }
    };
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
      var x = snapValue((left - frame.originX) / frame.unitX);
      var y = snapValue((frame.originY - bottom) / frame.unitY);
      var width = snapValue(this.bounds.width / scale / frame.unitX);
      var height = snapValue(this.bounds.height / scale / frame.unitY);
      this.hint.textContent = 'CeTZ bounds (' + x + ', ' + y + '), size (' + width + ', ' + height + ')';
    };
  }
  function updateControls() {
    if (isCetz() && ui.formatContainer && rail.parentNode !== ui.formatContainer)
      ui.formatContainer.appendChild(rail);
    function showField(input, visible) {
      input.parentNode.style.display = visible ? 'grid' : 'none';
    }
    var cell = graph.getSelectionCell();
    updateOutline();
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
      var selected = selectedEditableCells();
      var kinds = selected.map(function (item) { return graph.getCellStyle(item).cetzKind; });
      var one = selected.length === 1;
      var canConnect = selected.length === 2 && kinds.every(function (kind) {
        return kind === 'rect' || kind === 'circle';
      });
      var canReconnect = selected.length === 2 && kinds.indexOf('line') >= 0 &&
        kinds.some(function (kind) { return kind === 'rect' || kind === 'circle'; });
      var frame = cetzFrame(), geometry = cell.geometry;
      var label;
      try { label = decodeURIComponent(style.cetzLabel || style.cetzKind || 'shape'); }
      catch (error) { label = style.cetzKind || 'shape'; }
      var bounds = frame && geometry ? '\nPosition: (' +
        snapValue((geometry.x - frame.originX) / frame.unitX) + ', ' +
        snapValue((frame.originY - geometry.y - geometry.height) / frame.unitY) + ')' +
        '\nSize: ' + snapValue(geometry.width / frame.unitX) + ' × ' +
        snapValue(geometry.height / frame.unitY) : '';
      details.textContent = (one ? label + ' · ' + (style.cetzKind || 'shape') + bounds :
        selected.length + ' shapes selected') +
        (style.cetzAngle !== undefined && one ? '\nRotation: ' + style.cetzAngle + '°' : '');
      fill.value = /^#[0-9a-f]{6}$/i.test(style.cetzFillColor) ? style.cetzFillColor : '#ffffff';
      stroke.value = /^#[0-9a-f]{6}$/i.test(style.cetzStrokeColor) ? style.cetzStrokeColor : '#000000';
      width.value = style.cetzStrokeWidth || '1';
      dash.value = style.cetzDash || 'solid';
      markStart.value = style.cetzStartMark || 'none';
      markEnd.value = style.cetzEndMark || 'none';
      rotation.value = style.cetzAngle || '0';
      scaling.value = '1';
      try { textValue.value = decodeURIComponent(style.cetzText || ''); }
      catch (error) { textValue.value = ''; }
      showField(fill, ['rect', 'circle', 'polygon', 'n-star', 'rect-around',
        'merge-path', 'compound-path'].includes(style.cetzKind));
      showField(stroke, !['anchor', 'group'].includes(style.cetzKind));
      showField(width, !['anchor', 'group'].includes(style.cetzKind));
      showField(dash, !['anchor', 'group'].includes(style.cetzKind));
      showField(start, false);
      showField(end, false);
      showField(markStart, style.cetzKind === 'line');
      showField(markEnd, style.cetzKind === 'line');
      showField(textValue, style.cetzKind === 'content' && style.cetzText !== undefined);
      showField(rotation, !['anchor', 'group'].includes(style.cetzKind));
      showField(scaling, !['anchor', 'group', 'content', 'mark'].includes(style.cetzKind));
      rotateLeft.style.display = rotateRight.style.display =
        one && !['anchor', 'group'].includes(style.cetzKind) ? '' : 'none';
      sizeRow.style.display = one && !['anchor', 'group', 'content', 'mark'].includes(style.cetzKind) ? '' : 'none';
      sizeSlider.value = '1'; sizeLabel.textContent = 'Size ×1.00';
      groupButton.style.display = selectedEditableCells().length >= 2 ? '' : 'none';
      ungroupButton.style.display = style.cetzKind === 'group' ? '' : 'none';
      shareButton.style.display = one && !['anchor', 'group'].includes(style.cetzKind) ? '' : 'none';
      autoShareButton.style.display = selected.length >= 2 ? '' : 'none';
      detachButton.style.display = one && !['anchor', 'group'].includes(style.cetzKind) ? '' : 'none';
      anchorRenameRow.style.display = one && style.cetzKind === 'anchor' ? '' : 'none';
      if (style.cetzKind === 'anchor') anchorName.value = label;
      [fromAnchor.row, toAnchor.row, connectorRoute.row, connectButton].forEach(function (item) {
        item.style.display = canConnect ? '' : 'none';
      });
      [reconnectEnd.row, reconnectSide.row, reconnectButton].forEach(function (item) {
        item.style.display = canReconnect ? '' : 'none';
      });
      return;
    }
    fill.value = /^#[0-9a-f]{6}$/i.test(style.fillColor) ? style.fillColor : '#ffffff';
    details.textContent = 'CeTZ shape';
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
    showField(fill, !edge && !content);
    showField(stroke, !content);
    showField(width, !content);
    showField(dash, !content);
    showField(start, edge);
    showField(end, edge);
    showField(markStart, false);
    showField(markEnd, false);
    showField(textValue, false);
    showField(rotation, false); showField(scaling, false);
    groupButton.style.display = 'none'; ungroupButton.style.display = 'none';
    [rotateLeft, rotateRight, sizeRow, shareButton, autoShareButton, detachButton,
      anchorRenameRow, fromAnchor.row, toAnchor.row, connectorRoute.row,
      connectButton, reconnectEnd.row, reconnectSide.row, reconnectButton].forEach(function (item) {
      item.style.display = 'none';
    });
  }
  var outlineHighlight = null;
  var outlineDragging = false;
  var outlineDropRow = null;
  function clearOutlineDropLine() {
    if (outlineDropRow) outlineDropRow.style.boxShadow = '';
    outlineDropRow = null;
  }
  function outlineDropAfter(event, row) {
    var y = typeof event.clientY === 'number' && row.getBoundingClientRect
      ? event.clientY - row.getBoundingClientRect().top : event.offsetY;
    return Number(y) > row.offsetHeight / 2;
  }
  function outlineDescription(entry, cells, frame) {
    var style = entry.style, kind = style.cetzKind || 'shape', label;
    try { label = decodeURIComponent(style.cetzLabel || kind); }
    catch (error) { label = kind; }
    var name = label === kind ? kind : label + ' · ' + kind;
    var geometry = entry.cell.geometry;
    if (!frame || !geometry) return name;
    var points = Object.keys(cells).filter(function (id) {
      var match = /^cetz-point-(\d+)-\d+$/.exec(id);
      return match && Number(match[1]) === entry.index;
    }).sort(function (a, b) { return Number(a.split('-')[3]) - Number(b.split('-')[3]); })
      .map(function (id) { return cells[id].geometry; }).filter(Boolean);
    function coord(point) {
      return { x: (Number(point.x) + Number(point.width) / 2 - frame.originX) / frame.unitX,
        y: (frame.originY - Number(point.y) - Number(point.height) / 2) / frame.unitY };
    }
    var origin = points.length ? coord(points[0]) :
      style.cetzSnapOffsetX !== undefined && style.cetzSnapOffsetY !== undefined
        ? { x: (Number(geometry.x) + Number(style.cetzSnapOffsetX) - frame.originX) / frame.unitX,
          y: (frame.originY - Number(geometry.y) - Number(style.cetzSnapOffsetY)) / frame.unitY }
        : { x: (Number(geometry.x) - frame.originX) / frame.unitX,
          y: (frame.originY - Number(geometry.y) - Number(geometry.height)) / frame.unitY };
    function short(value) { return Number(value.toFixed(2)); }
    var width = Number(geometry.width) / frame.unitX;
    var height = Number(geometry.height) / frame.unitY;
    var size;
    if (kind === 'line') {
      var length = 0;
      for (var i = 1; i < points.length; i++) {
        var a = coord(points[i - 1]), b = coord(points[i]);
        length += Math.hypot(b.x - a.x, b.y - a.y);
      }
      size = short(points.length >= 2 ? length : Math.hypot(width, height));
    } else size = kind === 'anchor' ? '0' : short(width) + ' × ' + short(height);
    return name + ' pos: (' + short(origin.x) + ', ' + short(origin.y) + ') size: ' + size;
  }
  function makeOutlineHighlight() {
    var shapes = [];
    return { highlight: function (state) {
      shapes.forEach(function (shape) { shape.destroy(); }); shapes = [];
      if (!state) return;
      var model = graph.getModel(), cells = model.cells || {}, scale = graph.view.scale || 1;
      Object.keys(cells).forEach(function (id) {
        if (!/^cetz-render-/.test(id)) return;
        var cell = cells[id], parent = model.getParent ? model.getParent(cell) : cell.parent;
        if (parent !== state.cell || !cell.geometry) return;
        var image = /(?:^|;)image=(data:image\/svg\+xml,[^;]+)(?:;|$)/.exec(cell.style || '');
        if (!image) return;
        var g = cell.geometry, shape = createDragShape(new mxRectangle(
          state.x + g.x * scale, state.y + g.y * scale, g.width * scale, g.height * scale), image[1]);
        shape.init(graph.view.getOverlayPane()); shape.redraw(); shapes.push(shape);
        if (shape.node && shape.node.querySelectorAll) {
          shape.node.setAttribute('data-cetz-outline-highlight', 'true');
          shape.node.style.opacity = '0.5';
          Array.prototype.forEach.call(shape.node.querySelectorAll('path, use'), function (path) {
            if (path.getAttribute('fill') !== 'none') path.setAttribute('fill', '#dc2626');
            path.setAttribute('stroke', '#dc2626');
            path.setAttribute('stroke-width', Math.max(1.5, Number(path.getAttribute('stroke-width')) || 0));
          });
        }
      });
    } };
  }
  function updateOutline() {
    outline.style.display = isEditablePreview() ? '' : 'none';
    if (outlineDragging) return;
    clearOutlineDropLine();
    if (outlineHighlight) outlineHighlight.highlight(null);
    if (!isEditablePreview()) return;
    outline.textContent = '';
    var heading = document.createElement('strong');
    heading.textContent = 'Outline'; outline.appendChild(heading);
    var cells = graph.getModel().cells || {};
    var frame = cetzFrame();
    var entries = Object.keys(cells).filter(function (id) { return /^cetz-edit-\d+$/.test(id); })
      .map(function (id) { return { id: id, cell: cells[id], style: graph.getCellStyle(cells[id]),
        index: Number(id.slice(10)) }; });
    var children = {};
    entries.forEach(function (entry) {
      var parent = entry.style.cetzGroup;
      if (parent === undefined || parent === '') parent = 'root';
      if (!children[parent]) children[parent] = [];
      children[parent].push(entry);
    });
    Object.keys(children).forEach(function (key) {
      children[key].sort(function (a, b) {
        return Number(a.style.cetzStart) - Number(b.style.cetzStart);
      });
    });
    function appendRows(parent, depth) {
      (children[parent] || []).forEach(function (entry, position, siblings) {
        var cell = entry.cell, style = entry.style;
        var row = document.createElement('div');
        row.draggable = false;
        var grip = document.createElement('span');
        grip.textContent = '⋮⋮';
        grip.draggable = true;
        grip.setAttribute('aria-label', 'Drag to reorder');
        grip.style.cssText = 'width:18px;flex:none;cursor:grab;text-align:center;user-select:none;';
        var select = document.createElement('button');
        select.type = 'button';
        select.textContent = outlineDescription(entry, cells, frame);
        select.style.cssText = 'flex:1;min-width:0;text-align:left;border:0;background:transparent;' +
          'color:inherit;font:inherit;cursor:pointer;overflow-wrap:anywhere;';
        row.style.cssText = 'display:flex;box-sizing:border-box;width:100%;align-items:center;padding:4px 3px;' +
          'border-radius:3px;background:transparent;color:inherit;font:12px sans-serif;cursor:grab;';
        row.style.paddingLeft = (6 + depth * 14) + 'px';
        row.appendChild(grip);
        row.appendChild(select);
        [['↑', position > 0, 'move-before', position - 1],
          ['↓', position < siblings.length - 1, 'move-after', position + 1]].forEach(function (move) {
          var button = document.createElement('button'); button.type = 'button'; button.textContent = move[0];
          button.setAttribute('aria-label', move[0] === '↑' ? 'Move layer up' : 'Move layer down');
          button.style.cssText = 'border:0;background:transparent;color:inherit;cursor:pointer;';
          button.style.display = move[1] ? '' : 'none';
          button.addEventListener('click', function (event) {
            event.stopPropagation();
            if (move[1]) sendSourceAction(move[2], null,
              [entry.index, siblings[move[3]].index]);
          });
          row.appendChild(button);
        });
        if (graph.getSelectionCells().some(function (selected) { return selected.id === entry.id; }))
          row.style.background = '#dbeafe';
        row.addEventListener('mouseenter', function () {
          row.style.background = '#fed7aa';
          if (graph.view && graph.view.getState) {
            if (!outlineHighlight) outlineHighlight = makeOutlineHighlight();
            var current = graph.getModel().getCell(entry.id);
            var state = current && graph.view.getState(current);
            if (state) {
              outlineHighlight.highlight(state);
            }
          }
        });
        row.addEventListener('mouseleave', function () {
          row.style.background = graph.getSelectionCells().some(function (selected) {
            return selected.id === entry.id;
          }) ? '#dbeafe' : 'transparent';
          if (outlineHighlight) outlineHighlight.highlight(null);
        });
        row.addEventListener('pointerdown', function (event) { event.stopPropagation(); });
        row.addEventListener('mousedown', function (event) { event.stopPropagation(); });
        function selectEntry(event) {
          if (event.preventDefault) event.preventDefault();
          event.stopPropagation();
          var additive = event.metaKey || event.ctrlKey || event.shiftKey;
          row.style.background = '#dbeafe';
          // A selection change rebuilds this Outline. Let the click finish
          // before selecting, so Draw.io cannot clear it as a canvas click.
          setTimeout(function () {
            var current = graph.getModel().getCell(entry.id);
            if (!current) return;
            if (additive && graph.addSelectionCell) graph.addSelectionCell(current);
            else graph.setSelectionCell(current);
            if (graph.scrollCellToVisible) graph.scrollCellToVisible(current);
          }, 0);
        }
        select.addEventListener('click', selectEntry);
        row.addEventListener('click', selectEntry);
        grip.addEventListener('dragstart', function (event) {
          outlineDragging = true;
          clearOutlineDropLine();
          event.stopPropagation();
          if (event.dataTransfer) event.dataTransfer.setData('text/plain', 'cetz:' + entry.index);
        });
        grip.addEventListener('dragend', function () {
          outlineDragging = false; clearOutlineDropLine(); updateOutline();
        });
        row.addEventListener('dragover', function (event) {
          event.preventDefault(); event.stopPropagation();
          if (!outlineDragging) return;
          if (outlineDropRow !== row) clearOutlineDropLine();
          outlineDropRow = row;
          row.style.boxShadow = outlineDropAfter(event, row)
            ? 'inset 0 -3px 0 #2563eb' : 'inset 0 3px 0 #2563eb';
        });
        row.addEventListener('dragleave', function (event) {
          if (!event.relatedTarget || !row.contains(event.relatedTarget)) {
            if (outlineDropRow === row) clearOutlineDropLine();
          }
        });
        row.addEventListener('drop', function (event) {
          event.preventDefault();
          event.stopPropagation();
          clearOutlineDropLine();
          outlineDragging = false;
          var dragged = event.dataTransfer && event.dataTransfer.getData('text/plain');
          if (!/^cetz:\d+$/.test(dragged || '')) return;
          var from = Number(dragged.slice(5));
          if (!Number.isSafeInteger(from) || !cells['cetz-edit-' + from] || from === entry.index) return;
          var after = outlineDropAfter(event, row);
          sendSourceAction(after ? 'move-after' : 'move-before', null, [from, entry.index]);
        });
        outline.appendChild(row);
        appendRows(String(entry.index), depth + 1);
      });
    }
    appendRows('root', 0);
  }
  function update() {
    suppressCachedSelectionBorders();
    var active = isCetz(), preview = active && isPreview();
    if (placement && (!active || !isEditablePreview())) cancelPlacement();
    if (active) updateSnapGrid();
    if (active) ensureCetzMenu();
    if (active && !activeMode) {
      if (original.createHandler) graph.createHandler = function () {
        return suppressHandlerBorders(original.createHandler.apply(this, arguments));
      };
      if (original.updateMouseEvent) graph.updateMouseEvent = function () {
        var me = original.updateMouseEvent.apply(this, arguments);
        var cell = me.getCell();
        if (isEditablePreview() && cell) {
          var model = graph.getModel(), owner = null;
          // Native group selection stops at the immutable artwork child once
          // its owner is selected. Resolve the event before selection/drag
          // handlers see it, so every body gesture moves the owner.
          if (/^cetz-render-\d+$/.test(cell.id || '')) owner = model.getParent(cell);
          var guide = /^cetz-guide-(\d+)-\d+$/.exec(cell.id || '');
          if (guide) owner = model.getCell('cetz-edit-' + guide[1]);
          if (owner && /^cetz-edit-\d+$/.test(owner.id || '')) {
            me.state = graph.view.getState(owner);
          }
        }
        return me;
      };
      // Rendered SVG fragments are children of their editable shape. Let
      // mxGraph preview the whole hierarchy while dragging, including when
      // several shapes (or a grid with many paths) are selected.
      if (graph.graphHandler) {
        graph.graphHandler.maxLivePreview = Number.MAX_SAFE_INTEGER;
        graph.graphHandler.allowLivePreview = true;
        if (original.createPreviewShape) graph.graphHandler.createPreviewShape = function () {
          var shape = original.createPreviewShape.apply(this, arguments);
          if (isEditablePreview()) shape.opacity = 0;
          return shape;
        };
        if (original.updatePreview) graph.graphHandler.updatePreview = function (remote) {
          var result = original.updatePreview.apply(this, arguments);
          updateDragImages(this, remote);
          return result;
        };
        if (original.resetDrag) graph.graphHandler.reset = function () {
          clearDragImages(this);
          clearPointGuides(this);
          return original.resetDrag.apply(this, arguments);
        };
        if (original.moveCells) graph.graphHandler.moveCells = function (cells, dx, dy) {
          if (!cells.length || !cells.every(function (cell) { return /^cetz-(?:edit-\d+|point-\d+-\d+)$/.test(cell.id || ''); }))
            return original.moveCells.apply(this, arguments);
          var model = graph.getModel(), snap = this.cetzGuideSnap || {};
          model.beginUpdate();
          try {
            graph.setCellStyles('cetzSnapStep', String(snapStep()), cells);
            graph.setCellStyles('cetzGuideX', snap.x ? '1' : '0', cells);
            graph.setCellStyles('cetzGuideY', snap.y ? '1' : '0', cells);
            var args = Array.prototype.slice.call(arguments);
            // Keep the grid/guide result through mxGraph's integer drop rounding.
            if (Number.isFinite(this.currentDx)) args[1] = this.currentDx / graph.view.scale;
            if (Number.isFinite(this.currentDy)) args[2] = this.currentDy / graph.view.scale;
            return original.moveCells.apply(this, args);
          } finally { model.endUpdate(); }
        };
      }
      if (original.constrainChild) graph.isConstrainChild = function (cell) {
        return !/^cetz-render-\d+$/.test(cell && cell.id || '') &&
          original.constrainChild.apply(this, arguments);
      };
      graph.isCellDeletable = function (cell) {
        return !!cell && !['0', '1', 'preview-image', 'cetz-preview-background'].includes(cell.id) &&
          !/^cetz-select-/.test(cell.id) &&
          !/^cetz-(?:point|guide|axis|origin|render)-/.test(cell.id) && cell.id !== 'cetz-preview-image';
      };
      graph.isCellSelectable = function (cell) {
        return !!cell && !['preview-image', 'cetz-preview-background'].includes(cell.id) &&
          !/^cetz-select-/.test(cell.id) &&
          !/^cetz-(?:guide|axis|origin|render)-/.test(cell.id) && cell.id !== 'cetz-preview-image' &&
          !isTemplate(cell) &&
          original.selectable.apply(this, arguments);
      };
      graph.isCellCloneable = function (cell) {
        return isTemplate(cell) && !graph.getModel().contains(cell);
      };
      graph.isCellVisible = function (cell) {
        if (/^cetz-render-\d+$/.test(cell.id || '')) return renderedLayersReady;
        if (cell.id === 'cetz-preview-image' && renderedLayersReady) return false;
        var control = /^cetz-(?:point|guide)-(\d+)-\d+$/.exec(cell.id || '');
        if (control && isEditablePreview() && !graph.getSelectionCells().some(function (selected) {
          var selectedPoint = /^cetz-point-(\d+)-\d+$/.exec(selected.id || '');
          return selected.id === 'cetz-edit-' + control[1] ||
            selectedPoint && selectedPoint[1] === control[1];
        })) return false;
        return !/^cetz-select-/.test(cell.id || '') &&
          !(isTemplate(cell) && graph.getModel().contains(cell)) &&
          original.visible.apply(this, arguments);
      };
      graph.isCellConnectable = function () { return false; };
      if (original.useGuidesForEvent) graph.graphHandler.useGuidesForEvent = function () {
        var cells = graph.getSelectionCells();
        if (isEditablePreview() && cells.length === 1 &&
          /^cetz-point-\d+-\d+$/.test(cells[0].id || '')) preparePointGuide(this, cells[0]);
        return original.useGuidesForEvent.apply(this, arguments);
      };
      if (original.snapDelta) graph.snapDelta = function (delta, bounds, ignoreGrid, ignoreX, ignoreY) {
        var cells = graph.getSelectionCells();
        var cell = isEditablePreview() && cells.length === 1 ? cells[0] : null;
        if (isEditablePreview() && graph.graphHandler) graph.graphHandler.cetzGuideSnap = { x: !!ignoreX, y: !!ignoreY };
        if (cell && /^cetz-point-\d+-\d+$/.test(cell.id || '')) {
          var handler = graph.graphHandler;
          handler.cetzGuideSnap = { x: !!ignoreX, y: !!ignoreY };
          var owner = graph.getModel().getCell('cetz-edit-' + cell.id.split('-')[2]);
          var ownerStyle = owner && graph.getCellStyle(owner);
          var ownerAngle = ownerStyle && Number(ownerStyle.cetzAngle);
          if (ownerStyle && ownerStyle.cetzKind !== 'content' &&
            Number.isFinite(ownerAngle) && Math.abs(ownerAngle % 360) > 0.00001) return delta;
          var arcStyle = graph.getCellStyle(cell);
          var arcHandle = arcStyle.cetzArcHandle;
          var frame = cetzFrame();
          if (frame) {
            var scale = graph.view.scale || 1;
            var translate = graph.view.translate || { x: 0, y: 0 };
            var handleOffset = handler.cetzPointGuideActive ? 0 : 7;
            var centerX = (bounds.x + delta.x) / scale - translate.x + handleOffset;
            var centerY = (bounds.y + delta.y) / scale - translate.y + handleOffset;
            if (arcHandle === 'end') {
              var ellipse = ['cetzArcCenterX', 'cetzArcCenterY', 'cetzArcRadiusX',
                'cetzArcRadiusY'].map(function (key) { return Number(arcStyle[key]); });
              if (ellipse.every(Number.isFinite) && ellipse[2] > 0 && ellipse[3] > 0) {
                var dx = (centerX - ellipse[0]) / ellipse[2];
                var dy = (centerY - ellipse[1]) / ellipse[3];
                if ((ignoreX && Math.abs(dx) <= 1) || (ignoreY && Math.abs(dy) <= 1)) {
                  if (ignoreX) centerY = ellipse[1] + (dy < 0 ? -1 : 1) * ellipse[3] * Math.sqrt(1 - dx * dx);
                  else centerX = ellipse[0] + (dx < 0 ? -1 : 1) * ellipse[2] * Math.sqrt(1 - dy * dy);
                  delta.x = (centerX + translate.x - handleOffset) * scale - bounds.x;
                  delta.y = (centerY + translate.y - handleOffset) * scale - bounds.y;
                  return delta;
                }
                if (Math.hypot(dx, dy) > 0.001) {
                  // One-degree steps keep the endpoint on the arc and its
                  // written stop angle free of long decimal fractions.
                  var angularStep = snapStep() / 0.25;
                  var angle = Math.round(Math.atan2(dy, dx) * 180 / Math.PI / angularStep) * angularStep * Math.PI / 180;
                  centerX = ellipse[0] + ellipse[2] * Math.cos(angle);
                  centerY = ellipse[1] + ellipse[3] * Math.sin(angle);
                  delta.x = (centerX + translate.x - handleOffset) * scale - bounds.x;
                  delta.y = (centerY + translate.y - handleOffset) * scale - bounds.y;
                  return delta;
                }
              }
            }
            var worldX = (centerX - frame.originX) / frame.unitX;
            var worldY = (frame.originY - centerY) / frame.unitY;
            var rotationCx = Number(ownerStyle && ownerStyle.cetzRotationCx);
            var rotationCy = Number(ownerStyle && ownerStyle.cetzRotationCy);
            if (ownerStyle && ownerStyle.cetzRotationCx !== undefined &&
              ownerStyle.cetzRotationCy !== undefined && Number.isFinite(rotationCx) &&
              Number.isFinite(rotationCy) && Number.isFinite(ownerAngle)) {
              var radians = ownerAngle * Math.PI / 180;
              var relativeX = worldX - rotationCx, relativeY = worldY - rotationCy;
              var snapLocal = ignoreX || ignoreY ? function (value) { return value; } : snapValue;
              var localX = snapLocal(rotationCx + relativeX * Math.cos(radians) +
                relativeY * Math.sin(radians));
              var localY = snapLocal(rotationCy - relativeX * Math.sin(radians) +
                relativeY * Math.cos(radians));
              relativeX = localX - rotationCx; relativeY = localY - rotationCy;
              worldX = rotationCx + relativeX * Math.cos(radians) - relativeY * Math.sin(radians);
              worldY = rotationCy + relativeX * Math.sin(radians) + relativeY * Math.cos(radians);
            } else {
              if (!ignoreX) worldX = snapValue(worldX);
              if (!ignoreY) worldY = snapValue(worldY);
            }
            var x = frame.originX + worldX * frame.unitX;
            var y = frame.originY - worldY * frame.unitY;
            delta.x = (x + translate.x - handleOffset) * scale - bounds.x;
            delta.y = (y + translate.y - handleOffset) * scale - bounds.y;
            return delta;
          }
        }
        if (isEditablePreview() && cells.length && cells.every(function (cell) { return /^cetz-edit-\d+$/.test(cell.id || ''); })) {
          var model = graph.getModel(), owner = cells[0];
          var geometry = model.getGeometry && model.getGeometry(owner), origin = cetzAnchor(owner), frame = cetzFrame();
          if (geometry && origin && frame) {
            var scale = graph.view.scale || 1;
            var baseX = geometry.x + origin.x, baseY = geometry.y + origin.y;
            if (!ignoreX && !ignoreGrid) delta.x = (frame.originX + snapValue((baseX + delta.x / scale - frame.originX) / frame.unitX) * frame.unitX - baseX) * scale;
            if (!ignoreY && !ignoreGrid) delta.y = (frame.originY - snapValue((frame.originY - baseY - delta.y / scale) / frame.unitY) * frame.unitY - baseY) * scale;
            return delta;
          }
        }
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
        var arcCenter = cells.length === 1 && graph.getCellStyle(cells[0]).cetzArcHandle === 'center';
        var guided = this.cetzGuideSnap || {};
        var x = guided.x ? Number(((modelX - frame.originX) / frame.unitX).toFixed(8)) :
          snapValue((modelX - frame.originX) / frame.unitX);
        var y = guided.y ? Number(((frame.originY - modelY) / frame.unitY).toFixed(8)) :
          snapValue((frame.originY - modelY) / frame.unitY);
        this.hint.textContent = (arcCenter ? 'CeTZ arc center ' : 'CeTZ ') +
          '(' + x + ', ' + y + ')' + (arcCenter ? ' · start fixed' : '');
      };
      if (graph.popupMenuHandler) {
        graph.popupMenuHandler.isEnabled = function () { return true; };
        graph.popupMenuHandler.factoryMethod = function (menu, cell) {
          if (cell && /^cetz-(?:edit|point)-\d+/.test(cell.id || '') &&
            graph.getSelectionCells().indexOf(cell) < 0) graph.setSelectionCell(cell);
          if (isEditablePreview()) menu.addItem('Paste', null, function () { sendSourceAction('paste'); });
          if (selectedEditableCells().length) {
            menu.addItem('Copy', null, function () { sendSourceAction('copy'); });
            menu.addItem('Duplicate', null, function () { sendSourceAction('duplicate'); });
            if (selectedEditableCells().length >= 2)
              menu.addItem('Group', null, function () { sendSourceAction('group'); });
            if (selectedEditableCells().length >= 2)
              menu.addItem('Auto-share coincident points', null, function () { sendSourceAction('auto-share'); });
            if (selectedEditableCells().length === 1) {
              menu.addItem('Ungroup', null, function () { sendSourceAction('ungroup'); });
              menu.addItem('Share first literal point', null, function () { sendSourceAction('share-point'); });
            }
            menu.addItem('Bring forward', null, function () { sendSourceAction('forward'); });
            menu.addItem('Send backward', null, function () { sendSourceAction('backward'); });
            if (selectedEditableCells().length === 2) {
              menu.addItem('Connect (straight)', null, function () { sendSourceAction('connect-straight'); });
              menu.addItem('Connect (elbow)', null, function () { sendSourceAction('connect-elbow'); });
              menu.addItem('Reconnect start', null, function () { sendSourceAction('reconnect', 'start'); });
              menu.addItem('Reconnect end', null, function () { sendSourceAction('reconnect', 'end'); });
            }
            menu.addItem('Go to Typst call', null, function () { sendSourceAction('focus'); });
            menu.addSeparator();
          } else if (isEditablePreview()) {
            menu.addItem('Select all shapes', null, function () {
              var cells = graph.getModel().cells || {};
              graph.setSelectionCells(Object.keys(cells).filter(function (id) {
                return /^cetz-edit-\d+$/.test(id);
              }).map(function (id) { return cells[id]; }));
            });
          }
          menu.addItem('Fit view', null, function () {
            var action = ui.actions.get('fitWindow');
            if (action) action.funct();
          });
          menu.addItem('Export PDF, SVG or PNG', null, function () { sendSourceAction('export'); });
        };
      }
    } else if (!active && activeMode) {
      graph.createHandler = original.createHandler;
      graph.updateMouseEvent = original.updateMouseEvent;
      graph.isCellDeletable = original.deletable;
      graph.isCellSelectable = original.selectable;
      graph.isCellCloneable = original.cloneable;
      graph.isCellVisible = original.visible;
      graph.isCellConnectable = original.connectable;
      graph.isConstrainChild = original.constrainChild;
      graph.snapDelta = original.snapDelta;
      graph.gridSize = original.gridSize;
      if (graph.graphHandler) graph.graphHandler.updateHint = original.updateHint;
      if (graph.graphHandler) graph.graphHandler.useGuidesForEvent = original.useGuidesForEvent;
      if (graph.graphHandler) graph.graphHandler.maxLivePreview = original.maxLivePreview;
      if (graph.graphHandler) {
        clearDragImages(graph.graphHandler);
        clearPointGuides(graph.graphHandler);
        graph.graphHandler.allowLivePreview = original.allowLivePreview;
        graph.graphHandler.updatePreview = original.updatePreview;
        graph.graphHandler.createPreviewShape = original.createPreviewShape;
        graph.graphHandler.reset = original.resetDrag;
        graph.graphHandler.moveCells = original.moveCells;
      }
      if (graph.popupMenuHandler) {
        graph.popupMenuHandler.isEnabled = original.popup;
        graph.popupMenuHandler.factoryMethod = original.popupFactory;
      }
    }
    var changed = active !== activeMode;
    activeMode = active;
    var layersChanged = updateRenderedLayers(active);
    if ((changed || layersChanged) && graph.view && graph.view.invalidate && graph.view.validate) {
      graph.view.invalidate();
      graph.view.validate();
    }
    if (active && ui.sidebarContainer) {
      if (changed) {
        previousSidebarWidth = ui.hsplitPosition;
        previousSidebarDisplay = ui.sidebarContainer.style.display;
        previousFormatWidth = ui.formatWidth;
        previousFormatDisplay = ui.formatContainer && ui.formatContainer.style.display;
        previousFormatOverflow = ui.formatContainer && ui.formatContainer.style.overflowY;
        previousFormatGutter = ui.formatContainer && ui.formatContainer.style.scrollbarGutter;
        previousFormatMinWidth = ui.formatContainer && ui.formatContainer.style.minWidth;
        previousFormatMaxWidth = ui.formatContainer && ui.formatContainer.style.maxWidth;
      }
      ui.hsplitPosition = 300;
      ui.formatWidth = 48;
      ui.sidebarContainer.style.display = '';
    } else if (changed && ui.sidebarContainer) {
      if (previousSidebarWidth != null) ui.hsplitPosition = previousSidebarWidth;
      if (previousFormatWidth != null) ui.formatWidth = previousFormatWidth;
      if (ui.formatContainer) {
        ui.formatContainer.style.display = previousFormatDisplay || '';
        ui.formatContainer.style.overflowY = previousFormatOverflow || '';
        ui.formatContainer.style.scrollbarGutter = previousFormatGutter || '';
        ui.formatContainer.style.minWidth = previousFormatMinWidth || '';
        ui.formatContainer.style.maxWidth = previousFormatMaxWidth || '';
      }
      ui.sidebarContainer.style.display = previousSidebarDisplay || '';
      previousSidebarWidth = null;
      previousSidebarDisplay = null;
      previousFormatWidth = null;
      previousFormatDisplay = null;
      previousFormatOverflow = null;
      previousFormatGutter = null;
      previousFormatMinWidth = null;
      previousFormatMaxWidth = null;
    }
    if (!active) rail.style.display = 'none';
    updateRuler(active, changed);
    updateChrome(active);
    updateErrorBar(active);
    if (changed && ui.refresh) ui.refresh(true);
    if (active && ui.formatContainer) {
      if (rail.parentNode !== ui.formatContainer) ui.formatContainer.appendChild(rail);
      ui.formatContainer.style.display = '';
      ui.formatContainer.style.width = '48px';
      ui.formatContainer.style.minWidth = '48px';
      ui.formatContainer.style.maxWidth = '48px';
      ui.formatContainer.style.overflowY = 'hidden';
      ui.formatContainer.style.scrollbarGutter = 'auto';
      rail.style.display = 'block';
    }
    if (active || changed) graph.setEnabled(true);
    updateStandardPalettes(active);
    setDisplay(cetzMenu, active);
    setDisplay(basicPair[0], false); setDisplay(basicPair[1], active && !preview);
    setDisplay(previewBasicPair[0], false); setDisplay(previewBasicPair[1], active && preview);
    setDisplay(advancedPair[0], false); setDisplay(advancedPair[1], active);
    clearRenderedTemplates();
    syncCodeSelection();
    updateControls();
    if (fitOnLoad) {
      fitOnLoad = false;
      var fit = active && ui.actions.get('fitWindow');
      if (fit) fit.funct();
    }
  }
  ui.editor.addListener('fileLoaded', function () {
    if (!isCetz()) original.gridSize = graph.gridSize;
    cancelPlacement(); fitOnLoad = true; update();
  });
  graph.getSelectionModel().addListener('change', function () {
    suppressCachedSelectionBorders();
    if (isEditablePreview() && graph.view && graph.view.invalidate && graph.view.validate) {
      graph.view.invalidate();
      graph.view.validate();
    }
    updateControls();
    var indices = selectedEditableCells().map(function (cell) {
      return Number(cell.id.slice('cetz-edit-'.length));
    }).sort(function (a, b) { return a - b; });
    var selection = indices.join(',');
    if (isEditablePreview() && selection && selection !== lastSourceSelection && !applyingCodeSelection)
      sendSourceAction('select', null, indices);
    lastSourceSelection = selection;
  });
  graph.getModel().addListener('change', function () { setTimeout(update, 0); });
  new MutationObserver(function (records) {
    // Inspector and Outline redraws are our own DOM changes. Observing them
    // would schedule another redraw and can replace a row during its click.
    if (records.some(function (record) {
      return !outline.contains(record.target) && !controls.contains(record.target);
    })) setTimeout(update, 0);
  }).observe(sidebar.container, { childList: true, subtree: true });
  if (ui.formatContainer) new MutationObserver(function () { setTimeout(update, 0); })
    .observe(ui.formatContainer, { childList: true });
  if (ui.menubar) new MutationObserver(function () { setTimeout(update, 0); })
    .observe(ui.menubar.container, { childList: true });
  setInterval(function () { updateErrorBar(isCetz()); }, 500);
  update();
});
