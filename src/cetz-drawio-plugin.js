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
    if (name !== 'export' && (!isEditablePreview() || !cells.length && !overrideIndices)) return;
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
          var bounds = graph.view.getGraphBounds();
          var x = Math.max(0, Math.round(bounds.x + bounds.width / 2));
          var y = Math.max(0, Math.round(bounds.y + bounds.height / 2));
          var cell = graph.insertVertex(graph.getDefaultParent(), null, name, x, y, 120, 80,
            'rounded=0;dashed=1;fillColor=none;strokeColor=#4f79ff;cetzTemplate=' + name + ';');
          graph.setSelectionCell(cell);
        }, parent);
      });
      menu.addSeparator(parent);
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
  document.addEventListener('keydown', function (event) {
    if (!isCetz() || !isEditablePreview() || !(event.metaKey || event.ctrlKey) ||
      /^(INPUT|TEXTAREA|SELECT)$/.test(event.target && event.target.tagName || '')) return;
    var action = event.key.toLowerCase() === 'd' ? 'duplicate' :
      event.key.toLowerCase() === 'g' ? event.shiftKey ? 'ungroup' : 'group' :
      event.key === ']' ? 'forward' : event.key === '[' ? 'backward' : null;
    if (!action || !selectedEditableCells().length) return;
    event.preventDefault(); event.stopImmediatePropagation();
    sendSourceAction(action);
  }, true);
  var original = {
    deletable: graph.isCellDeletable, selectable: graph.isCellSelectable,
    cloneable: graph.isCellCloneable, visible: graph.isCellVisible,
    connectable: graph.isCellConnectable, snapDelta: graph.snapDelta,
    updateHint: graph.graphHandler && graph.graphHandler.updateHint,
    useGuidesForEvent: graph.graphHandler && graph.graphHandler.useGuidesForEvent,
    popup: graph.popupMenuHandler && graph.popupMenuHandler.isEnabled,
    popupFactory: graph.popupMenuHandler && graph.popupMenuHandler.factoryMethod,
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
  function syncCodeSelection() {
    if (!isEditablePreview()) return;
    var cells = graph.getModel().cells || {};
    var markerId = Object.keys(cells).filter(function (id) { return /^cetz-select-[\w-]+$/.test(id); }).sort().pop();
    if (!markerId || markerId === lastSelectionToken) return;
    lastSelectionToken = markerId;
    var index = /(?:^|;)cetzSelect=(\d+)(?:;|$)/.exec(cells[markerId].style || '')?.[1];
    var target = index && graph.getModel().getCell('cetz-edit-' + index);
    if (target) graph.setSelectionCell(target);
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
        quarter((geometry.x - frame.originX) / frame.unitX) + ', ' +
        quarter((frame.originY - geometry.y - geometry.height) / frame.unitY) + ')' +
        '\nSize: ' + quarter(geometry.width / frame.unitX) + ' × ' +
        quarter(geometry.height / frame.unitY) : '';
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
  var outlineFill = null;
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
  function makeOutlineFill() {
    var highlight = new mxCellHighlight(graph, '#ef4444', 0);
    highlight.createShape = function () {
      var shape = new mxRectangleShape(null, '#ef4444', 'none', 0);
      shape.opacity = 32;
      shape.pointerEvents = false;
      shape.svgPointerEvents = 'none';
      shape.dialect = mxConstants.DIALECT_SVG;
      shape.init(graph.view.getOverlayPane());
      return shape;
    };
    highlight.repaint = function () {
      if (!this.shape || !this.state) return;
      var state = this.state;
      this.shape.bounds = new mxRectangle(state.x, state.y, state.width, state.height);
      this.shape.rotation = Number(state.style && state.style.rotation || 0);
      this.shape.scale = state.view.scale;
      this.shape.redraw();
    };
    return highlight;
  }
  function updateOutline() {
    outline.style.display = isEditablePreview() ? '' : 'none';
    if (outlineDragging) return;
    clearOutlineDropLine();
    if (outlineHighlight) outlineHighlight.highlight(null);
    if (outlineFill) outlineFill.highlight(null);
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
          if (typeof mxCellHighlight !== 'undefined' && graph.view && graph.view.getState) {
            if (!outlineHighlight) outlineHighlight = new mxCellHighlight(graph, '#dc2626', 3);
            var current = graph.getModel().getCell(entry.id);
            var state = current && graph.view.getState(current);
            if (state) {
              outlineHighlight.highlight(state);
              if (typeof mxRectangleShape !== 'undefined' && typeof mxRectangle !== 'undefined') {
                if (!outlineFill) outlineFill = makeOutlineFill();
                outlineFill.highlight(state);
              }
            }
          }
        });
        row.addEventListener('mouseleave', function () {
          row.style.background = graph.getSelectionCells().some(function (selected) {
            return selected.id === entry.id;
          }) ? '#dbeafe' : 'transparent';
          if (outlineHighlight) outlineHighlight.highlight(null);
          if (outlineFill) outlineFill.highlight(null);
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
    var active = isCetz(), preview = active && isPreview();
    if (active) ensureCetzMenu();
    if (active && !activeMode) {
      graph.isCellDeletable = function (cell) {
        return !!cell && !['0', '1', 'preview-image', 'cetz-preview-background'].includes(cell.id) &&
          !/^cetz-select-/.test(cell.id) &&
          !/^cetz-(?:point|guide|axis|origin)-/.test(cell.id) && cell.id !== 'cetz-preview-image';
      };
      graph.isCellSelectable = function (cell) {
        return !!cell && !['preview-image', 'cetz-preview-background'].includes(cell.id) &&
          !/^cetz-select-/.test(cell.id) &&
          !/^cetz-(?:guide|axis|origin)-/.test(cell.id) && cell.id !== 'cetz-preview-image' &&
          !isTemplate(cell) &&
          original.selectable.apply(this, arguments);
      };
      graph.isCellCloneable = function (cell) {
        return isTemplate(cell) && !graph.getModel().contains(cell);
      };
      graph.isCellVisible = function (cell) {
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
          /^cetz-point-\d+-\d+$/.test(cells[0].id || '')) return false;
        return original.useGuidesForEvent.apply(this, arguments);
      };
      if (original.snapDelta) graph.snapDelta = function (delta, bounds) {
        var cells = graph.getSelectionCells();
        var cell = isEditablePreview() && cells.length === 1 ? cells[0] : null;
        if (cell && /^cetz-point-\d+-\d+$/.test(cell.id || '')) {
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
            var centerX = (bounds.x + delta.x) / scale - translate.x + 7;
            var centerY = (bounds.y + delta.y) / scale - translate.y + 7;
            if (arcHandle === 'end') {
              var ellipse = ['cetzArcCenterX', 'cetzArcCenterY', 'cetzArcRadiusX',
                'cetzArcRadiusY'].map(function (key) { return Number(arcStyle[key]); });
              if (ellipse.every(Number.isFinite) && ellipse[2] > 0 && ellipse[3] > 0) {
                var dx = (centerX - ellipse[0]) / ellipse[2];
                var dy = (centerY - ellipse[1]) / ellipse[3];
                if (Math.hypot(dx, dy) > 0.001) {
                  // One-degree steps keep the endpoint on the arc and its
                  // written stop angle free of long decimal fractions.
                  var angle = Math.round(Math.atan2(dy, dx) * 180 / Math.PI) * Math.PI / 180;
                  centerX = ellipse[0] + ellipse[2] * Math.cos(angle);
                  centerY = ellipse[1] + ellipse[3] * Math.sin(angle);
                  delta.x = (centerX + translate.x - 7) * scale - bounds.x;
                  delta.y = (centerY + translate.y - 7) * scale - bounds.y;
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
              var localX = quarter(rotationCx + relativeX * Math.cos(radians) +
                relativeY * Math.sin(radians));
              var localY = quarter(rotationCy - relativeX * Math.sin(radians) +
                relativeY * Math.cos(radians));
              relativeX = localX - rotationCx; relativeY = localY - rotationCy;
              worldX = rotationCx + relativeX * Math.cos(radians) - relativeY * Math.sin(radians);
              worldY = rotationCy + relativeX * Math.sin(radians) + relativeY * Math.cos(radians);
            } else {
              worldX = quarter(worldX); worldY = quarter(worldY);
            }
            var x = frame.originX + worldX * frame.unitX;
            var y = frame.originY - worldY * frame.unitY;
            delta.x = (x + translate.x - 7) * scale - bounds.x;
            delta.y = (y + translate.y - 7) * scale - bounds.y;
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
        var x = quarter((modelX - frame.originX) / frame.unitX);
        var y = quarter((frame.originY - modelY) / frame.unitY);
        this.hint.textContent = (arcCenter ? 'CeTZ arc center ' : 'CeTZ ') +
          '(' + x + ', ' + y + ')' + (arcCenter ? ' · start fixed' : '');
      };
      if (graph.popupMenuHandler) {
        graph.popupMenuHandler.isEnabled = function () { return true; };
        graph.popupMenuHandler.factoryMethod = function (menu, cell) {
          if (cell && /^cetz-(?:edit|point)-\d+/.test(cell.id || '') &&
            graph.getSelectionCells().indexOf(cell) < 0) graph.setSelectionCell(cell);
          if (selectedEditableCells().length) {
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
      graph.isCellDeletable = original.deletable;
      graph.isCellSelectable = original.selectable;
      graph.isCellCloneable = original.cloneable;
      graph.isCellVisible = original.visible;
      graph.isCellConnectable = original.connectable;
      graph.snapDelta = original.snapDelta;
      if (graph.graphHandler) graph.graphHandler.updateHint = original.updateHint;
      if (graph.graphHandler) graph.graphHandler.useGuidesForEvent = original.useGuidesForEvent;
      if (graph.popupMenuHandler) {
        graph.popupMenuHandler.isEnabled = original.popup;
        graph.popupMenuHandler.factoryMethod = original.popupFactory;
      }
    }
    var changed = active !== activeMode;
    activeMode = active;
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
  }
  ui.editor.addListener('fileLoaded', update);
  graph.getSelectionModel().addListener('change', function () {
    if (isEditablePreview() && graph.view && graph.view.invalidate && graph.view.validate) {
      graph.view.invalidate();
      graph.view.validate();
    }
    updateControls();
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
