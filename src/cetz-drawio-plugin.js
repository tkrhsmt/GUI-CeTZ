/* global Draw, mxCell, mxGeometry */
// Loaded by Draw.io Integration only after its normal plugin trust prompt.
Draw.loadPlugin(function (ui) {
  var sidebar = ui.sidebar;
  if (!sidebar) return;
  // The same plugin can be listed by both workspace and user settings.
  // Draw.io invokes each entry, so guard the UI before adding palettes.
  if (ui.guiCetzPluginLoaded) return;
  ui.guiCetzPluginLoaded = true;

  var shapeNames = ['polygon', 'circle-through', 'arc-through', 'bezier-through', 'arc', 'mark', 'n-star', 'grid', 'bezier',
    'hobby', 'catmull'];
  var shapeGlyphs = {
    polygon: '<path d="M19 7H45L58 24L45 41H19L6 24Z"/>',
    'circle-through': '<circle cx="32" cy="24" r="17"/><path d="M15 24h1M32 7v1M49 24h1" stroke="#e28b23" stroke-width="6"/>',
    'arc-through': '<path d="M10 36A24 24 0 0 1 54 36"/><circle cx="10" cy="36" r="2"/><circle cx="32" cy="21" r="2"/><circle cx="54" cy="36" r="2"/>',
    'bezier-through': '<path d="M8 36C9 3 45 1 56 30"/><circle cx="8" cy="36" r="2"/><circle cx="30" cy="10" r="2"/><circle cx="56" cy="30" r="2"/>',
    rect: '<rect x="10" y="10" width="44" height="28" rx="2"/>',
    circle: '<circle cx="32" cy="24" r="17"/>',
    content: '<rect x="8" y="10" width="48" height="28" rx="3" stroke="#93c5fd"/><path d="M18 18 H46 M18 25 H41 M18 32 H35"/>',
    line: '<path d="M8 36 L25 11 L42 28 L56 12"/><circle cx="8" cy="36" r="2" fill="#ffffff"/><circle cx="56" cy="12" r="2" fill="#ffffff"/>',
    arc: '<path d="M10 34 A22 22 0 0 1 54 34"/><circle cx="32" cy="34" r="2" fill="#e28b23" stroke="none"/>',
    mark: '<path d="M9 34 H48 M39 25 L51 34 L39 43"/>',
    'n-star': '<path d="M32 5 L38 20 L54 20 L41 30 L46 45 L32 36 L18 45 L23 30 L10 20 L26 20 Z"/>',
    grid: '<path d="M10 8 V42 M21 8 V42 M32 8 V42 M43 8 V42 M54 8 V42 M10 8 H54 M10 19 H54 M10 30 H54 M10 42 H54"/>',
    bezier: '<path d="M8 36 C18 4 43 44 56 12"/><path d="M8 36 L18 10 M56 12 L43 40" stroke="#e28b23" stroke-dasharray="3 3"/>',
    hobby: '<path d="M7 34 C19 12 25 13 33 25 S48 39 57 10"/><circle cx="7" cy="34" r="2"/><circle cx="33" cy="25" r="2"/><circle cx="57" cy="10" r="2"/>',
    catmull: '<path d="M7 36 C17 35 18 8 30 11 S43 36 57 13"/><circle cx="7" cy="36" r="2"/><circle cx="30" cy="11" r="2"/><circle cx="57" cy="13" r="2"/>',
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
  controls.className = 'cetzPropertyPanel';
  controls.style.cssText = 'box-sizing:border-box;width:100%;min-width:0;padding:10px 12px 12px;white-space:normal;overflow-wrap:anywhere;display:none;font:12px -apple-system,BlinkMacSystemFont,sans-serif;color:inherit;';
  sidebar.wrapper.insertBefore(controls, sidebar.wrapper.firstChild);
  // Draw.io's sidebar cancels mousedown/selectstart unless this hook allows
  // the target. Its default permits inputs and selects, but excludes textareas.
  // Permit CeTZ text fields so clicking them can focus and select text normally.
  if (typeof ui.isSelectionAllowed === 'function') {
    var nativeSelectionAllowed = ui.isSelectionAllowed;
    ui.isSelectionAllowed = function (event) {
      var target = mxEvent.getSource(event);
      if (isCetz() && controls.contains(target) && isTextTarget(target)) return true;
      return nativeSelectionAllowed.apply(this, arguments);
    };
  }
  var outline = document.createElement('div');
  outline.className = 'cetzOutline';
  outline.setAttribute('aria-label', 'Document outline');
  outline.style.cssText = 'box-sizing:border-box;width:100%;padding:10px 12px 0;' +
    'border-bottom:1px solid var(--ol-line,#dce0e5);display:none;';
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
  railStyle.textContent = '.cetzPropertyPanel,.cetzOutline{min-width:0;max-width:100%;white-space:normal;overflow-wrap:anywhere}.cetzPropertyPanel :where(div,section,header,details,label,summary),.cetzOutline :where(header,div){box-sizing:border-box;min-width:0;max-width:100%}.cetzPropertyPanel :where(h2,small,label,summary,button),.cetzOutline :where(h2,small){white-space:normal;overflow-wrap:anywhere}.cetzOutlineHint,.cetzOutlineEmpty{white-space:normal;overflow-wrap:anywhere}.cetzOutlineCount{flex-shrink:0}.cetzRightRail ::-webkit-scrollbar{width:0;height:0}' +
    '.cetzOutline{display:flex;flex-direction:column;--ol-line:var(--vscode-panel-border,#dce0e5);--ol-hover:var(--vscode-list-hoverBackground,#f2f3f5);--ol-selected:var(--vscode-list-inactiveSelectionBackground,#eaf0fe);--ol-accent:var(--vscode-focusBorder,#4675e7);--ol-icon:var(--vscode-input-background,#f2f3f5);color:inherit;font:12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}' +
    '.geDarkMode .cetzOutline{display:flex;flex-direction:column;--ol-line:#45474b;--ol-hover:#303236;--ol-selected:#293a57;--ol-icon:#303236}.cetzOutline header{flex:none;padding:12px 4px 13px}.cetzOutline small{font-size:10px;opacity:.6;letter-spacing:1.2px}.cetzOutlineHeading{display:flex;align-items:center;gap:8px;margin:5px 0}.cetzOutline h2{font-size:17px;font-weight:600;letter-spacing:-.3px;margin:0;flex:1}.cetzOutlineCount{font-size:10px;border:1px solid var(--ol-line);border-radius:5px;padding:2px 6px;opacity:.7;font-variant-numeric:tabular-nums}.cetzOutlineHint{font-size:10px;opacity:.55;line-height:1.5}' +
    '.cetzOutlineList{max-height:240px;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;padding:0 0 8px}.cetzOutlineRow{display:flex;box-sizing:border-box;width:100%;align-items:center;gap:2px;min-height:48px;border-radius:6px;margin:2px 0;color:inherit;position:relative}.cetzOutlineRow:hover{background:var(--ol-hover)}.cetzOutlineRow[data-selected=true]{background:var(--ol-selected)}.cetzOutlineRow[data-selected=true]:before{content:"";position:absolute;left:0;top:12px;bottom:12px;width:2px;border-radius:2px;background:var(--ol-accent)}' +
    '.cetzOutline button{font:inherit;color:inherit;border:0;background:transparent;cursor:pointer;border-radius:4px}.cetzOutline button:focus-visible{outline:2px solid var(--ol-accent);outline-offset:-2px}.cetzOutlineGrip{width:12px;flex:none;cursor:grab;text-align:center;user-select:none;opacity:0;font-size:11px}.cetzOutlineRow:hover .cetzOutlineGrip,.cetzOutlineRow:focus-within .cetzOutlineGrip{opacity:.45}.cetzOutlineSelect{display:flex;align-items:center;gap:8px;flex:1;min-width:0;text-align:left;padding:6px 3px}.cetzOutlineIcon{display:flex;width:26px;height:28px;align-items:center;justify-content:center;flex:none;border-radius:5px;background:var(--ol-icon);opacity:.85}.cetzOutlineRow[data-selected=true] .cetzOutlineIcon{color:var(--ol-accent)}.cetzOutlineText{display:block;flex:1;min-width:0}.cetzOutlineName{display:flex;align-items:center;gap:6px}.cetzOutlineNameText{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:550;line-height:18px}.cetzOutlineMeta{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;opacity:.55;line-height:16px;font-variant-numeric:tabular-nums}.cetzOutlineBranch{flex:none;width:16px;height:24px;padding:0;font-size:10px!important;opacity:.6}.cetzOutlineBranch svg{display:block;margin:auto}.cetzOutlineMove{padding:3px!important;width:20px;height:24px;flex:none;opacity:0;pointer-events:none}.cetzOutlineRow:hover .cetzOutlineMove,.cetzOutlineRow:focus-within .cetzOutlineMove{opacity:.65;pointer-events:auto}.cetzOutlineMove:hover{background:var(--ol-icon)}.cetzOutlineEmpty{margin:0 4px 12px;padding:16px 12px;border:1px dashed var(--ol-line);border-radius:6px;line-height:1.6;font-size:11px;opacity:.65}';
  railStyle.textContent += '.cetzOutline[data-resized=true] .cetzOutlineList{flex:1;min-height:0;max-height:none}.cetzOutlineResize{flex:none;height:14px;position:relative;cursor:row-resize;touch-action:none;user-select:none;border-radius:4px;outline:none}.cetzOutlineResize:after{content:"";position:absolute;width:32px;height:3px;left:50%;top:5px;transform:translateX(-50%);border-radius:3px;background:var(--ol-line)}.cetzOutlineResize:hover:after,.cetzOutlineResize:focus-visible:after,.cetzOutlineResize[data-dragging=true]:after{background:var(--ol-accent)}.cetzOutlineResize:focus-visible{box-shadow:inset 0 0 0 1px var(--ol-accent)}';
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
    row.style.cssText = 'box-sizing:border-box;display:grid;grid-template-columns:minmax(0,76px) minmax(0,1fr);align-items:center;column-gap:10px;width:100%;margin:0;padding:5px 2px;min-height:36px;';
    var caption = document.createElement('span');
    caption.textContent = label;
    caption.style.cssText = 'min-width:0;white-space:normal;overflow-wrap:anywhere;';
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
    row.style.cssText = 'box-sizing:border-box;width:100%;min-width:0;display:grid;grid-template-columns:minmax(0,76px) minmax(0,1fr);align-items:center;gap:10px;padding:5px 2px;';
    var caption = document.createElement('span'); caption.textContent = label;
    var input = document.createElement('input');
    input.type = 'number'; input.value = initial; input.min = min; input.step = step;
    input.setAttribute('aria-label', label);
    input.style.cssText = 'box-sizing:border-box;width:100%;max-width:100%;min-width:0;height:28px;padding:2px 6px;border:1px solid #888;border-radius:4px;background:transparent;color:inherit;font:inherit;';
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
  sizeSlider.style.cssText = 'box-sizing:border-box;display:block;width:100%;max-width:100%;min-width:0;margin:0;';
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
  var pathActions = [
    ['Unite', 'boolean-union', 'Combine the filled regions'],
    ['Intersect', 'boolean-intersection', 'Keep the common region'],
    ['Subtract', 'boolean-difference', 'First object in source order minus the remaining objects'],
    ['Exclude', 'boolean-xor', 'Keep regions covered an odd number of times'],
    ['Merge paths', 'make-merge-path', 'Connect paths in source order'],
    ['Compound path', 'make-compound-path', 'Combine subpaths using the even-odd fill rule'],
    ['Frame selection', 'make-rect-around', 'Add a rect-around that follows the selected objects']
  ];
  var operations = document.createElement('section'); operations.className = 'cetzOperations';
  operations.setAttribute('aria-label', 'Path operations');
  controls.insertBefore(operations, details);
  var operationsEyebrow = document.createElement('small'); operationsEyebrow.textContent = 'SELECTION / CeTZ'; operations.appendChild(operationsEyebrow);
  var operationsTitle = document.createElement('h2'); operationsTitle.textContent = 'Path operations'; operations.appendChild(operationsTitle);
  var operationsHint = document.createElement('div'); operationsHint.className = 'cetzOperationsHint'; operations.appendChild(operationsHint);
  var operationsGrid = document.createElement('div'); operationsGrid.className = 'cetzOperationsGrid'; operations.appendChild(operationsGrid);
  var operationButtons = [];
  function pathOperationIcon(action) {
    var overlap = '<path d="M4 5H18V19H4ZM13 13H27V27H13Z" fill="none" stroke="currentColor" stroke-width="1.25" opacity=".3"/>';
    var regions = {
      'boolean-union': 'M4 5H18V13H27V27H13V19H4Z',
      'boolean-intersection': 'M13 13H18V19H13Z',
      'boolean-difference': 'M4 5H18V13H13V19H4Z',
      'boolean-xor': 'M4 5H18V13H27V27H13V19H4ZM13 13V19H18V13Z'
    };
    var drawing;
    if (regions[action]) drawing = overlap + '<path d="' + regions[action] + '" fill="currentColor" fill-opacity=".2" fill-rule="evenodd" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>';
    else if (action === 'make-merge-path') drawing = '<path d="M4 24C4 12 12 21 16 16S21 5 28 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M12 19L20 12" stroke="currentColor" stroke-width="3"/><g fill="currentColor"><circle cx="4" cy="24" r="2"/><circle cx="28" cy="8" r="2"/></g><g fill="var(--op-bg)" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="19" r="2.5"/><circle cx="20" cy="12" r="2.5"/></g>';
    else if (action === 'make-compound-path') drawing = '<path d="M5 5H27V27H5ZM16 10a6 6 0 1 0 0 12a6 6 0 1 0 0-12Z" fill="currentColor" fill-opacity=".2" fill-rule="evenodd" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>';
    else drawing = '<g fill="currentColor" fill-opacity=".15" stroke="currentColor" stroke-width="1.25" opacity=".6"><rect x="8" y="9" width="9" height="9" rx="1"/><circle cx="21" cy="21" r="4"/></g><path d="M3 10V3H10M22 3H29V10M29 22V29H22M10 29H3V22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>';
    var icon = document.createElement('span'); icon.className = 'cetzOperationIcon'; icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="28" height="28" focusable="false">' + drawing + '</svg>';
    return icon;
  }
  pathActions.forEach(function (entry) {
    var button = document.createElement('button'); button.type = 'button'; button.title = entry[2];
    button.appendChild(pathOperationIcon(entry[1]));
    var label = document.createElement('span'); label.className = 'cetzOperationLabel'; label.textContent = entry[0]; button.appendChild(label);
    button.setAttribute('data-cetz-operation', entry[1]); button.setAttribute('aria-label', entry[0]);
    button.addEventListener('click', function (event) {
      event.stopPropagation(); if (canApplyPathOperation(entry[1])) sendSourceAction(entry[1]);
    });
    operationsGrid.appendChild(button); operationButtons.push(button);
  });
  var operationsNote = document.createElement('div'); operationsNote.className = 'cetzOperationsHint';
  operationsNote.textContent = 'Combine in source order. Subtract uses the first object as its base. Undo restores the inputs.';
  operations.appendChild(operationsNote);
  var operationsStyle = document.createElement('style');
  operationsStyle.textContent = '.cetzOperations{--op-line:var(--vscode-panel-border,#dce0e5);--op-bg:var(--vscode-input-background,#f2f3f5);padding:16px 2px;border-top:1px solid var(--op-line);font:12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.cetzOperations small{font-size:10px;opacity:.6;letter-spacing:1.2px}.cetzOperations h2{font-size:17px;font-weight:600;letter-spacing:-.3px;margin:5px 0 8px}.cetzOperationsHint{white-space:normal;overflow-wrap:anywhere;min-width:0;max-width:100%;font-size:10px;line-height:1.6;opacity:.6;margin:6px 0}.cetzOperationsGrid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:6px;margin:12px 0}.cetzOperationsGrid button{box-sizing:border-box;min-width:0;min-height:72px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;white-space:normal;padding:10px 6px;border:1px solid var(--op-line);border-radius:5px;background:var(--op-bg);color:inherit;font:inherit;cursor:pointer}.cetzOperationIcon{display:flex;flex:none;color:var(--vscode-textLink-foreground,#3564bf)}.cetzOperationIcon svg{display:block}.cetzOperationLabel{min-width:0;max-width:100%;white-space:normal;overflow-wrap:anywhere;line-height:1.3;text-align:center}.cetzOperationsGrid button:hover:enabled{border-color:var(--vscode-focusBorder,#4675e7);background:var(--vscode-list-hoverBackground,#e9edf4)}.cetzOperationsGrid button:focus-visible{outline:2px solid var(--vscode-focusBorder,#4675e7);outline-offset:1px}.cetzOperationsGrid button:disabled{opacity:.35;cursor:default}.cetzOperationsGrid button:last-child{grid-column:1 / -1;flex-direction:row;min-height:46px;gap:10px}.geDarkMode .cetzOperations{--op-line:#45474b;--op-bg:#303236}.geDarkMode .cetzOperationIcon{color:var(--vscode-textLink-foreground,#8db5ff)}.geDarkMode .cetzOperationsGrid button:hover:enabled{background:var(--vscode-list-hoverBackground,#3a3e46)}';
  controls.appendChild(operationsStyle);
  function pathSelection() {
    return selectedEditableCells().map(function (cell) {
      var style = graph.getCellStyle(cell), data = null;
      try { data = JSON.parse(decodeURIComponent(style.cetzProperties || 'null')); } catch (error) {}
      function argument(key) { var field = data && data.fields.filter(function (field) { return field.key === key; })[0]; return field && field.value; }
      var kind = style.cetzKind;
      var closed = ['rect', 'circle', 'polygon', 'n-star', 'circle-through', 'compound-path', 'boolean', 'rect-around'].indexOf(kind) >= 0 ||
        ['line', 'hobby', 'catmull', 'merge-path'].indexOf(kind) >= 0 && argument('close') === 'true' ||
        ['arc', 'arc-through'].indexOf(kind) >= 0 && ['"CLOSE"', '"PIE"'].indexOf(argument('mode')) >= 0;
      return { cell: cell, group: style.cetzGroup || '', kind: kind, closed: closed,
        path: ['content', 'anchor', 'mark'].indexOf(kind) < 0 };
    });
  }
  function canApplyPathOperation(action) {
    var selected = pathSelection();
    if (!isEditablePreview() || !selected.length || selected.some(function (item) { return item.group !== selected[0].group; })) return false;
    if (action === 'make-rect-around') return true;
    if (selected.length < 2 || selected.some(function (item) { return !item.path; })) return false;
    return action.indexOf('boolean-') !== 0 || selected.every(function (item) { return item.closed; });
  }
  function updatePathOperations() {
    var selected = pathSelection();
    operations.style.display = isEditablePreview() && selected.length ? '' : 'none';
    operationsHint.textContent = selected.length < 2 ? 'Select two or more path objects to combine. A frame can surround one object.' :
      selected.some(function (item) { return item.group !== selected[0].group; }) ? 'Select objects in the same group.' :
      selected.every(function (item) { return item.closed; }) ? selected.length + ' objects selected · Boolean and path operations available' :
      selected.length + ' objects selected · Boolean operations require closed paths';
    operationButtons.forEach(function (button, index) { button.disabled = !canApplyPathOperation(pathActions[index][1]); });
  }
  function addPathOperationMenu(menu, parent) {
    var folder = menu.addItem('Path operations', null, null, parent);
    pathActions.forEach(function (entry, index) {
      if (index === 4) menu.addSeparator(folder);
      menu.addItem(entry[0], null, function () { if (canApplyPathOperation(entry[1])) sendSourceAction(entry[1]); }, folder, null, canApplyPathOperation(entry[1]));
    });
  }
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
    polygon: ['Center', 'Vertex (sets radius and angle; sides in Properties)'],
    'circle-through': ['Point A', 'Point B', 'Point C (not on the A–B line)'],
    'arc-through': ['Start point', 'Point on arc', 'End point (not on the same line)'],
    'bezier-through': ['Start point', 'Point on curve', 'End point'],
    content: ['Text position'], line: ['Start point', 'End point'], mark: ['Start point', 'End point'],
    rect: ['First corner', 'Opposite corner'], grid: ['First corner', 'Opposite corner'],
    circle: ['Center', 'Point on circle'], 'n-star': ['Center', 'Point at outer radius'],
    arc: ['Center', 'Arc start (sets radius)', 'Arc end direction (counterclockwise)'],
    bezier: ['Start point', 'End point', 'First control point', 'Second control point'],
    hobby: ['First knot', 'Next knot'], catmull: ['First knot', 'Next knot'],
  };
  function variablePlacement(name) { return /^(hobby|catmull)$/.test(name); }
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
      'box-sizing:border-box;max-width:calc(100% - 24px);white-space:normal;overflow-wrap:anywhere;padding:7px 10px;border:1px solid #2563eb;border-radius:4px;background:#eff6ff;color:#1e3a8a;font:12px sans-serif;';
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
    if (a && b && /^(rect|grid)$/.test(name)) shapes = rectangle(a, b);
    else if (a && b && /^(circle|polygon|n-star|arc)$/.test(name)) shapes = circle(a, b);
    else if (a && b) shapes = '<polyline points="' + points.map(function (p) { return p.join(','); }).join(' ') + '"/>';
    if (name === 'polygon' && b) {
      var start = Math.atan2(b[1] - a[1], b[0] - a[0]), radius = Math.hypot(b[0] - a[0], b[1] - a[1]);
      shapes = '<polygon points="' + Array.from({ length: 6 }, function (_, i) {
        var angle = start + i * Math.PI / 3; return [a[0] + radius * Math.cos(angle), a[1] + radius * Math.sin(angle)].join(',');
      }).join(' ') + '"/>';
    }
    if (/-through$/.test(name) && c) {
      var curves = curveSegments(name, points.map(function (point) { return { x: point[0], y: point[1] }; }), {});
      if (curves.length) shapes = '<path d="M ' + curves[0][0].x + ' ' + curves[0][0].y + ' ' + curves.map(function (curve) {
        return 'C ' + [curve[2].x, curve[2].y, curve[3].x, curve[3].y, curve[1].x, curve[1].y].join(' ');
      }).join(' ') + '"/>';
    }
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
    placement.preview.innerHTML = '<g fill="none" stroke="#2563eb" stroke-width="1.5" stroke-dasharray="5 3">' + shapes + '</g>' +
      points.map(function (p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3.5" fill="white" stroke="#2563eb"/>'; }).join('');
  }
  function finishPlacement() {
    if (!placement) return;
    var name = placement.name, points = placement.points;
    if (variablePlacement(name) && points.length < 2) { placementHint('Add at least two points'); return; }
    var pair = points;
    var zeroRadius = /^(circle|polygon|n-star|arc)$/.test(name) &&
      Math.hypot(pair[0][0] - pair[1][0], pair[0][1] - pair[1][1]) < 0.00001;
    var flatRectangle = /^(rect|grid)$/.test(name) &&
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
      var flatCorner = count === 1 && /^(rect|grid)$/.test(name) &&
        (p[0] === points[0][0] || p[1] === points[0][1]);
      var samePoint = previous && p[0] === previous[0] && p[1] === previous[1];
      var zeroRadius = samePoint && count === 1 && /^(circle|polygon|n-star|arc|line|mark)$/.test(name);
      var invalidArcEnd = name === 'arc' && count === 2 && p[0] === points[0][0] && p[1] === points[0][1];
      var collinear = count === 2 && /^(circle-through|arc-through)$/.test(name) &&
        !circleThroughPoints(points.concat([p]).map(function (point) { return { x: point[0], y: point[1] }; }));
      if (flatCorner || zeroRadius || invalidArcEnd || collinear) { placementHint('Choose a different point'); return; }
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
    keyboardMoves = {};
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
  // Source-aware automatic properties. Debounce typing and serialize writes so
  // rendering cannot discard a newer edit or interrupt the focused field.
  var inspector = document.createElement('div');
  inspector.className = 'cetzInspector';
  inspector.setAttribute('aria-label', 'Shape properties');
  controls.insertBefore(inspector, controls.firstChild);
  var inspectorSignature = '', inspectorFields = [], inspectorCurrent = null;
  var inspectorStatus, inspectorStates = {}, inspectorFlight = null, inspectorUpdating = false, inspectorFileKey = null;
  function inspectorScene() { return Object.keys(graph.getModel().cells || {}).filter(function (id) { return /^cetz-scene-/.test(id); }).join(','); }
  var paletteNames = ['black', 'gray', 'silver', 'white', 'navy', 'blue', 'aqua', 'teal',
    'eastern', 'purple', 'fuchsia', 'maroon', 'red', 'orange', 'yellow', 'olive', 'green', 'lime', 'none'];
  var paletteHex = ['#000000','#aaaaaa','#dddddd','#ffffff','#001f3f','#0074d9','#7fdbff','#39cccc','#239dad','#b10dc9','#f012be','#85144b','#ff4136','#ff851b','#ffdc00','#3d9970','#2ecc40','#01ff70'];
  var inspectorCss = document.createElement('style');
  inspectorCss.textContent = '.cetzPropertyPanel>button{box-sizing:border-box;max-width:calc(100% - 4px);white-space:normal;overflow-wrap:anywhere;min-height:28px;border:1px solid var(--vscode-panel-border,#dce0e5);border-radius:5px;background:var(--vscode-input-background,transparent);color:inherit;padding:4px 8px;margin:4px 2px;font:inherit;cursor:pointer}.cetzPropertyPanel>div:not(.cetzInspector) input,.cetzPropertyPanel>div:not(.cetzInspector) select{border-color:var(--vscode-panel-border,#dce0e5)!important;border-radius:5px!important}.cetzInspector{--cetz-bg:var(--vscode-input-background,#f2f3f5);--cetz-line:var(--vscode-panel-border,#dce0e5);--cetz-focus:var(--vscode-focusBorder,#4675e7);font:12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:2px 0 12px}' +
    '.cetzInspector header{padding:12px 4px 16px}.cetzInspector h2{font-size:17px;font-weight:600;margin:5px 0;letter-spacing:-.3px}.cetzInspector small{opacity:.6;font-size:10px;letter-spacing:1.2px;text-transform:uppercase}' +
    '.cetzInspector details{border-top:1px solid var(--cetz-line);padding:12px 2px}.cetzInspector summary{font-size:11px;font-weight:650;letter-spacing:.5px;cursor:pointer;user-select:none;margin-bottom:12px}' +
    '.cetzInspector .cetzProperty{display:block;margin:10px 0}.cetzInspector .cetzProperty>span{display:block;font-size:11px;opacity:.75;margin-bottom:6px}.cetzInspector .cetzPair{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}' +
    '.cetzInspector input,.cetzInspector select,.cetzInspector textarea{box-sizing:border-box;width:100%;min-width:0;height:30px;padding:5px 8px;border:1px solid var(--cetz-line);border-radius:5px;background:var(--cetz-bg);color:inherit;font:inherit;outline:none}' +
    '.cetzInspector input:focus,.cetzInspector select:focus,.cetzInspector textarea:focus{border-color:var(--cetz-focus);box-shadow:0 0 0 1px var(--cetz-focus)}' +
    '.cetzInspector textarea{height:88px;resize:vertical;font:11px ui-monospace,monospace;line-height:1.5}.geDarkMode .cetzInspector{--cetz-bg:#303236;--cetz-line:#45474b}.cetzInspector .cetzAxis{position:relative}.cetzInspector .cetzAxis>span{position:absolute;left:9px;top:9px;font-size:10px;opacity:.55}.cetzInspector .cetzAxis>input{padding-left:26px}.cetzInspector input::placeholder{opacity:.5}.cetzInspector .cetzExpression{font-family:ui-monospace,monospace;font-size:11px}' +
    '.cetzInspector button{box-sizing:border-box;max-width:100%;min-height:30px;height:auto;white-space:normal;overflow-wrap:anywhere;border:1px solid var(--cetz-line);border-radius:5px;padding:5px 10px;background:var(--cetz-bg);color:inherit;cursor:pointer;font:inherit}.cetzInspector button:disabled{opacity:.45;cursor:default}' +
    '.cetzInspector .cetzStatus{white-space:normal;overflow-wrap:anywhere;font-size:11px;opacity:.7;line-height:1.5;min-height:18px}.cetzInspector .cetzSwatchRow{display:flex;gap:6px;margin-top:6px;align-items:center}.cetzInspector .cetzSwatchRow input[type=color]{width:30px;padding:3px;flex-shrink:0}.cetzInspector .cetzSwatchRow select{flex:1}' +
    '.cetzInspector .cetzHint{white-space:normal;overflow-wrap:anywhere;font-size:10px;line-height:1.5;opacity:.55;margin:8px 0}';
  controls.appendChild(inspectorCss);
  function encodedProperties(value) {
    return encodeURIComponent(JSON.stringify(value)).replace(/[!'()*]/g, function (char) {
      return '%' + char.charCodeAt(0).toString(16).toUpperCase();
    });
  }
  function synchronizeInspectorDocument() {
    var file = ui.getCurrentFile && ui.getCurrentFile();
    var fileKey = file && (typeof file.getId === 'function' && file.getId() || file.getTitle());
    if (fileKey === inspectorFileKey) return;
    Object.keys(inspectorStates).forEach(function (id) { if (inspectorStates[id].timer) clearTimeout(inspectorStates[id].timer); });
    inspectorStates = {}; inspectorFlight = null; inspectorCurrent = null; inspectorSignature = ''; inspectorFileKey = fileKey;
    keyboardMoves = {};
    outlineSignature = ''; outlineSelection = ''; outlineCollapsed = {};
  }
  function inspectorData(cell) {
    try { return JSON.parse(decodeURIComponent(graph.getCellStyle(cell).cetzProperties || 'null')); }
    catch (error) { return null; }
  }
  function inspectorValue(data, key) {
    var field = data.fields.filter(function (field) { return field.key === key; })[0];
    return field ? field.value : '';
  }
  function inspectorState(cell, data) {
    var state = inspectorStates[cell.id];
    if (!state) state = inspectorStates[cell.id] = { id: cell.id, model: data, values: {}, valid: true, composing: false, ready: false, timer: null, error: false };
    return state;
  }
  function updateInspectorStatus() {
    if (!inspectorStatus || !inspectorCurrent) return;
    inspectorStatus.textContent = !inspectorCurrent.valid ? 'Editing… Preview updates when coordinates are complete.' :
      inspectorCurrent.error ? 'Editing… Preview updates when the value is valid.' :
      inspectorFlight && inspectorFlight.id === inspectorCurrent.id ? 'Updating…' :
      Object.keys(inspectorCurrent.values).length ? 'Waiting for input…' : 'All changes saved automatically.';
  }
  function flushInspectorDrafts() {
    synchronizeInspectorDocument();
    if (inspectorFlight || !isEditablePreview()) return;
    var ids = Object.keys(inspectorStates);
    for (var i = 0; i < ids.length; i++) {
      var state = inspectorStates[ids[i]];
      if (!state.ready || !state.valid || state.composing || state.error) continue;
      var cell = graph.getModel().getCell(state.id), data = cell && inspectorData(cell);
      if (!data || data.kind !== state.model.kind) { delete inspectorStates[state.id]; continue; }
      var values = {};
      Object.keys(state.values).forEach(function (key) {
        if (state.values[key].trim() !== inspectorValue(data, key).trim()) values[key] = state.values[key];
        else delete state.values[key];
      });
      state.model = data; state.ready = false;
      if (!Object.keys(values).length) continue;
      // Serialize writes until Draw.io receives the new source scene. A second
      // edit made during rendering is rebased on that scene instead of dropped.
      inspectorFlight = { id: state.id, base: data.base, values: values, scene: inspectorScene() };
      sendSourceAction('properties', encodedProperties({ base: data.base, values: values }), [Number(state.id.slice(10))]);
      break;
    }
    updateInspectorStatus();
  }
  function synchronizeInspectorDrafts() {
    synchronizeInspectorDocument();
    var scene = inspectorScene();
    Object.keys(inspectorStates).forEach(function (id) {
      var state = inspectorStates[id], cell = graph.getModel().getCell(id), data = cell && inspectorData(cell);
      if (!data || data.kind !== state.model.kind) {
        if (state.timer) clearTimeout(state.timer);
        delete inspectorStates[id];
        if (inspectorFlight && inspectorFlight.id === id) inspectorFlight = null;
        return;
      }
      if (inspectorFlight && inspectorFlight.id === id &&
          (scene !== inspectorFlight.scene || data.base !== inspectorFlight.base)) {
        var sent = inspectorFlight.values;
        var accepted = Object.keys(sent).every(function (key) { return sent[key].trim() === inspectorValue(data, key).trim(); });
        if (accepted) Object.keys(sent).forEach(function (key) {
          if (state.values[key] === sent[key]) delete state.values[key];
        });
        // A rejected draft may already have been corrected while Typst was
        // checking it. Let that newer draft run without requiring another edit.
        var newer = Object.keys(state.values).some(function (key) {
          return !Object.prototype.hasOwnProperty.call(sent, key) || state.values[key] !== sent[key];
        });
        state.error = !accepted && !newer;
        inspectorFlight = null;
      }
      state.model = data;
    });
    if (!inspectorFlight && Object.keys(inspectorStates).some(function (id) { return inspectorStates[id].ready && !inspectorStates[id].error; }))
      setTimeout(flushInspectorDrafts, 0);
  }
  function propertyDraftChanged(event) {
    if (inspectorUpdating || !inspectorCurrent) return;
    var state = inspectorCurrent;
    if (state.timer) { clearTimeout(state.timer); state.timer = null; }
    state.ready = false; state.error = false;
    state.valid = !inspectorFields.some(function (field) { return field.input.cetzInvalid; });
    inspectorFields.forEach(function (field) {
      var original = inspectorValue(state.model, field.key);
      if (field.input.value !== original || inspectorFlight && inspectorFlight.id === state.id && Object.prototype.hasOwnProperty.call(inspectorFlight.values, field.key))
        state.values[field.key] = field.input.value;
      else delete state.values[field.key];
    });
    if (state.valid && !state.composing && Object.keys(state.values).length) {
      if (event && event.type === 'change') { state.ready = true; flushInspectorDrafts(); }
      else state.timer = setTimeout(function () {
        state.timer = null; state.ready = true; flushInspectorDrafts();
      }, 400);
    }
    updateInspectorStatus();
  }
  function updateInspector(cell, style, one) {
    var data;
    try { data = JSON.parse(decodeURIComponent(style.cetzProperties || 'null')); } catch (error) { data = null; }
    inspector.style.display = data && one ? '' : 'none';
    if (!data || !one) { inspectorSignature = ''; return false; }
    var state = inspectorState(cell, data);
    inspectorCurrent = state;
    var signature = cell.id + ':' + data.kind + ':' + data.fields.map(function (field) { return field.key; }).sort().join(',');
    if (signature === inspectorSignature) {
      inspectorUpdating = true;
      inspectorFields.forEach(function (field) {
        var value = Object.prototype.hasOwnProperty.call(state.values, field.key) ? state.values[field.key] : inspectorValue(state.model, field.key);
        if (field.input.value !== value) {
          field.input.value = value;
          field.input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
      inspectorUpdating = false;
      updateInspectorStatus(); return true;
    }
    var focused = document.activeElement;
    var restoreFocus = inspectorSignature.split(':')[0] === cell.id && inspector.contains(focused) && focused.getAttribute ?
      { label: focused.getAttribute('aria-label'), start: focused.selectionStart, end: focused.selectionEnd } : null;
    var openSections = {};
    if (inspectorSignature.split(':')[0] === cell.id && inspector.querySelectorAll)
      Array.prototype.forEach.call(inspector.querySelectorAll('details'), function (group) { openSections[group.firstChild.textContent] = group.open; });
    inspectorSignature = signature; inspectorFields = [];
    // replaceChildren is available in Draw.io's browser; fall back for embedders.
    while (inspector.firstChild) inspector.removeChild(inspector.firstChild);
    var header = document.createElement('header');
    var eyebrow = document.createElement('small'); eyebrow.textContent = 'PROPERTIES / CeTZ';
    var title = document.createElement('h2'); title.textContent = data.kind;
    var sub = document.createElement('div'); sub.className = 'cetzHint';
    sub.textContent = 'Coordinates · Shape · Appearance';
    header.appendChild(eyebrow); header.appendChild(title); header.appendChild(sub); inspector.appendChild(header);
    function section(name, opened) {
      var group = document.createElement('details'); group.open = Object.prototype.hasOwnProperty.call(openSections, name) ? openSections[name] : opened;
      var summary = document.createElement('summary'); summary.textContent = name;
      group.appendChild(summary); inspector.appendChild(group); return group;
    }
    var geometrySection = section('GEOMETRY', true), shapeSection = section('SHAPE', true);
    var appearanceSection = section('APPEARANCE', true), extraSection = section('ADVANCED', false);
    var sections = { Geometry: geometrySection, Shape: shapeSection, Appearance: appearanceSection };
    function inputFor(parent, label, value, fallback, multiline) {
      var input = document.createElement(multiline ? 'textarea' : 'input');
      if (!multiline) input.type = 'text';
      input.className = 'cetzExpression'; input.value = value; input.placeholder = fallback || '';
      input.setAttribute('aria-label', label); input.setAttribute('spellcheck', 'false');
      parent.appendChild(input); return input;
    }
          function partsOfStroke(raw) {
            var text = raw.trim(), parts = {};
            if (text[0] === '(' && text[text.length - 1] === ')') {
              var body = text.slice(1, -1), start = 0, depth = 0, quote = false, pieces = [];
              for (var i = 0; i <= body.length; i++) {
                if (body[i] === '\\' && quote) { i++; continue; }
                if (body[i] === '"') quote = !quote;
                if (!quote) {
                  if ('([{'.indexOf(body[i]) >= 0 && body[i]) depth++;
                  if (')]}'.indexOf(body[i]) >= 0 && body[i]) depth--;
                  if ((body[i] === ',' && depth === 0) || i === body.length) { pieces.push(body.slice(start, i)); start = i + 1; }
                }
              }
              for (var j = 0; j < pieces.length; j++) {
                if (!pieces[j].trim()) continue;
                var entry = /^\s*([\w-]+)\s*:\s*([\s\S]+)$/.exec(pieces[j]);
                if (!entry) return null;
                parts[entry[1]] = entry[2].trim();
              }
              return parts;
            }
            if (text === 'none') return { paint: 'none', thickness: '1pt' };
            var color = '(?:' + paletteNames.join('|') + '|rgb\\("#[a-fA-F0-9]{6}"\\))';
            var length = '[\\d.]+(?:pt|mm|cm|in|em)';
            var simple = new RegExp('^(' + length + ')\\s*\\+\\s*(' + color + ")$").exec(text);
            if (simple) return { thickness: simple[1], paint: simple[2] };
            var reverse = new RegExp('^(' + color + ')\\s*\\+\\s*(' + length + ")$").exec(text);
            if (reverse) return { paint: reverse[1], thickness: reverse[2] };
            if (new RegExp('^' + color + "$").test(text)) return { paint: text, thickness: '1pt' };
            if (new RegExp('^' + length + "$").test(text)) return { thickness: text };
            return null;
          }

    function addField(field) {
      var parent = sections[field.section] || extraSection;
      if (field.key === 'name' || field.key === 'anchor' || field.key === 'fill-rule' || field.key === 'shorten' || field.key === 'update-position' || field.key.indexOf('ignore-') === 0) parent = extraSection;
      var row = document.createElement('div'); row.className = 'cetzProperty';
      var label = document.createElement('span'); label.textContent = field.label;
      row.appendChild(label); parent.appendChild(row);
      var input;
      if (field.text !== undefined) {
        label.textContent = 'Text';
        var textInput = inputFor(row, 'Text', field.text, 'Enter text', true);
        textInput.className = 'cetzTextInput';
        input = inputFor(row, field.label, field.value, '', true);
        input.style.display = 'none';
        var textMode = document.createElement('button'); textMode.type = 'button'; textMode.textContent = 'ƒx';
        textMode.title = 'Edit Typst content expression'; textMode.setAttribute('aria-label', 'Text expression mode');
        textMode.setAttribute('aria-pressed', 'false');
        textMode.style.cssText = 'float:right;min-height:18px;height:18px;padding:0 5px;font-size:10px;';
        label.appendChild(textMode);
        var textHint = document.createElement('div'); textHint.className = 'cetzHint';
        textHint.textContent = 'Enter text directly. Use ƒx for Typst markup or expressions.'; row.appendChild(textHint);
        textMode.addEventListener('click', function () {
          var expressionMode = input.style.display === 'none';
          input.style.display = expressionMode ? '' : 'none'; textInput.style.display = expressionMode ? 'none' : '';
          textMode.setAttribute('aria-pressed', String(expressionMode));
          (expressionMode ? input : textInput).focus();
        });
        textInput.addEventListener('input', function () {
          input.value = JSON.stringify(textInput.value); propertyDraftChanged();
        });
        textInput.addEventListener('change', function (event) {
          input.value = JSON.stringify(textInput.value); propertyDraftChanged(event);
        });
        textInput.addEventListener('compositionstart', function () { state.composing = true; if (state.timer) clearTimeout(state.timer); });
        textInput.addEventListener('compositionend', function () {
          state.composing = false; input.value = JSON.stringify(textInput.value); propertyDraftChanged();
        });
        input.addEventListener('input', function () {
          var text = null;
          if (/^\[[^\[\]\\#*$<>]*\]$/.test(input.value)) text = input.value.slice(1, -1);
          else { try { var value = JSON.parse(input.value); if (typeof value === 'string') text = value; } catch (error) {} }
          textInput.disabled = text === null;
          if (text !== null) textInput.value = text;
          else {
            input.style.display = ''; textInput.style.display = 'none'; textMode.setAttribute('aria-pressed', 'true');
          }
        });
      } else if (field.point) {
        var pair = document.createElement('div'); pair.className = 'cetzPair';
        row.appendChild(pair);
        function axis(axisName, value) {
          var wrapper = document.createElement('label'); wrapper.className = 'cetzAxis';
          var caption = document.createElement('span'); caption.textContent = axisName;
          wrapper.appendChild(caption); pair.appendChild(wrapper);
          return inputFor(wrapper, field.label + ' ' + axisName, String(value), axisName);
        }
        var x = axis('X', field.point[0]), y = axis('Y', field.point[1]);
        x.type = y.type = 'number'; x.step = y.step = 'any';
        input = inputFor(row, field.label + ' expression', field.value);
        input.style.display = 'none';
        var expressionToggle = document.createElement('button'); expressionToggle.type = 'button';
        expressionToggle.textContent = 'ƒx'; expressionToggle.title = 'Edit coordinate expression';
        expressionToggle.setAttribute('aria-label', field.label + ' expression mode');
        expressionToggle.style.cssText = 'float:right;min-height:18px;height:18px;padding:0 5px;margin-top:-2px;font-size:10px;';
        label.appendChild(expressionToggle);
        expressionToggle.addEventListener('click', function () {
          input.style.display = input.style.display === 'none' ? '' : 'none';
          if (input.style.display !== 'none') input.focus();
        });
        input.addEventListener('input', function () {
          var point = /^\(\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*\)$/.exec(input.value.trim());
          x.disabled = y.disabled = !point;
          if (point) { x.value = point[1]; y.value = point[2]; }
          input.cetzInvalid = false;
        });
        function coordinateChange(event) {
          if (x.value === '' || y.value === '' || !isFinite(Number(x.value)) || !isFinite(Number(y.value))) {
            input.cetzInvalid = true; propertyDraftChanged(); return;
          }
          input.cetzInvalid = false;
          input.value = '(' + x.value + ', ' + y.value + ')'; propertyDraftChanged(event);
        }
        x.addEventListener('input', coordinateChange); y.addEventListener('input', coordinateChange);
        x.addEventListener('change', coordinateChange); y.addEventListener('change', coordinateChange);
      } else if (field.choices && (!field.value || field.choices.indexOf(field.value) >= 0)) {
        input = document.createElement('select'); input.setAttribute('aria-label', field.label);
        [''].concat(field.choices).forEach(function (choice) {
          var option = document.createElement('option'); option.value = choice;
          option.textContent = choice ? choice.replace(/"/g, '') : 'Default (' + field.fallback + ')'; input.appendChild(option);
        });
        input.value = field.value; row.appendChild(input);
      } else if (/^(true|false)$/.test(field.value || field.fallback || '')) {
        input = document.createElement('select'); input.setAttribute('aria-label', field.label);
        [['', field.fallback === undefined ? 'Inherited' : 'Default (' + field.fallback + ')'], ['true', 'Yes'], ['false', 'No']].forEach(function (entry) {
          var option = document.createElement('option'); option.value = entry[0]; option.textContent = entry[1]; input.appendChild(option);
        });
        input.value = field.value; row.appendChild(input);
      } else input = inputFor(row, field.label, field.value, field.fallback,
        field.multiline || field.value.indexOf('\n') >= 0 || field.label === 'Path contents' || field.label === 'Text / content');
      inspectorFields.push({ key: field.key, input: input, original: field.value });
      input.addEventListener('input', propertyDraftChanged); input.addEventListener('change', propertyDraftChanged);
      input.addEventListener('compositionstart', function () { state.composing = true; if (state.timer) clearTimeout(state.timer); });
      input.addEventListener('compositionend', function () { state.composing = false; propertyDraftChanged(); });
      if (field.key === 'mark' && data.kind === 'line') {
        var markPair = document.createElement('div'); markPair.className = 'cetzPair'; row.appendChild(markPair);
        ['start', 'end'].forEach(function (side) {
          var wrapper = document.createElement('label'); wrapper.className = 'cetzProperty';
          var caption = document.createElement('span'); caption.textContent = side === 'start' ? 'Start mark' : 'End mark';
          var menu = document.createElement('select'); menu.setAttribute('aria-label', caption.textContent);
          markOptions.forEach(function (entry) {
            var option = document.createElement('option'); option.value = entry[0]; option.textContent = entry[1];
            option.disabled = entry[0] === 'custom'; menu.appendChild(option);
          });
          wrapper.appendChild(caption); wrapper.appendChild(menu); markPair.appendChild(wrapper);
          function markParts() { return !input.value || input.value.trim() === 'none' ? {} : /^\s*\(/.test(input.value) ? partsOfStroke(input.value) : null; }
          function refreshMark() {
            var parts = markParts(); menu.disabled = !parts;
            var raw = parts && (parts[side] || parts.symbol) || 'none';
            var name = /^"([^"\\]+)"$/.exec(raw);
            var shorthand = { '>': 'triangle', '<': 'triangle', '<>': 'diamond', '[]': 'rect', ']': 'bracket', '[': 'bracket', '|': 'bar', o: 'circle', '+': 'plus', x: 'x', '*': 'star', ')>': 'curved-stealth', '>>': 'stealth', ')': 'parenthesis' };
            menu.value = raw === 'none' ? 'none' : name ? (markNames.indexOf(name[1]) >= 0 ? name[1] : shorthand[name[1]] || 'custom') : 'custom';
          }
          refreshMark(); input.addEventListener('input', refreshMark); input.addEventListener('change', refreshMark);
          menu.addEventListener('change', function () {
            var parts = markParts(); if (!parts || menu.value === 'custom') return;
            parts[side] = menu.value === 'none' ? 'none' : '"' + menu.value + '"';
            input.value = '(' + Object.keys(parts).map(function (key) { return key + ': ' + parts[key]; }).join(', ') + ')';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            propertyDraftChanged({ type: 'change' });
          });
        });
      }
      if (field.key === 'stroke' || field.key === 'fill') {
        var swatches = document.createElement('div'); swatches.className = 'cetzSwatchRow';
        var colorPicker = document.createElement('input'); colorPicker.type = 'color'; colorPicker.value = '#000000';
        colorPicker.setAttribute('aria-label', field.key + ' RGB color');
        var presets = document.createElement('select'); presets.setAttribute('aria-label', field.key + ' Typst color');
        ['Typst color…'].concat(paletteNames).forEach(function (name, index) {
          var option = document.createElement('option'); option.value = index ? name : ''; option.textContent = name; presets.appendChild(option);
        });
        function refreshColor() {
          var raw = input.value || field.fallback || 'none';
          var paint = field.key === 'stroke' ? partsOfStroke(raw) : null;
          if (field.key === 'stroke') raw = paint && paint.paint || '';
          var index = paletteNames.indexOf(raw);
          presets.value = index >= 0 ? raw : '';
          var rgb = /^rgb\("(#[a-f0-9]{6})"\)$/i.exec(raw);
          colorPicker.value = paletteHex[index] || rgb && rgb[1] || '#000000';
          colorPicker.title = raw || 'Custom Typst paint';
        }
        input.addEventListener('input', refreshColor); input.addEventListener('change', refreshColor);
        function useColor(value) {
          if (field.key === 'fill' || value === 'none') input.value = value;
          else {
            var raw = input.value || field.fallback || '1pt + black';
            var parts = partsOfStroke(raw);
            if (!parts) {
              inspectorStatus.textContent = 'Edit this custom stroke expression directly, or clear it to choose a preset.'; return;
            }
            parts.paint = value;
            if (Object.keys(parts).every(function (key) { return key === 'paint' || key === 'thickness'; }))
              input.value = (parts.thickness || '1pt') + ' + ' + value;
            else input.value = '(' + Object.keys(parts).map(function (key) { return key + ': ' + parts[key]; }).join(', ') + ')';
          }
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        presets.addEventListener('change', function () { if (presets.value) { useColor(presets.value); propertyDraftChanged({ type: 'change' }); } });
        colorPicker.addEventListener('input', function () { useColor('rgb("' + colorPicker.value + '")'); });
        swatches.appendChild(colorPicker); swatches.appendChild(presets); row.appendChild(swatches);
        if (field.key === 'stroke') {
          var strokeControls = document.createElement('div'); strokeControls.className = 'cetzPair'; row.appendChild(strokeControls);
          function strokeComponent(key, title, choices, fallback) {
            var wrapper = document.createElement('label'); wrapper.className = 'cetzProperty';
            var caption = document.createElement('span'); caption.textContent = title; wrapper.appendChild(caption);
            var control = document.createElement(choices ? 'select' : 'input');
            control.setAttribute('aria-label', 'Stroke ' + title.toLowerCase());
            if (choices) choices.forEach(function (choice) {
              var option = document.createElement('option'); option.value = choice[0]; option.textContent = choice[1]; control.appendChild(option);
            }); else control.type = 'text';
            wrapper.appendChild(control); strokeControls.appendChild(wrapper);
            function refreshStrokeComponent() {
              var parts = partsOfStroke(input.value || field.fallback || '1pt + black');
              control.disabled = !parts || parts.paint === 'none';
              control.value = parts && parts[key] || fallback;
            }
            refreshStrokeComponent();
            input.addEventListener('input', refreshStrokeComponent); input.addEventListener('change', refreshStrokeComponent);
            control.addEventListener('change', function () {
              var parts = partsOfStroke(input.value || field.fallback || '1pt + black');
              if (!parts) return;
              if (control.value) parts[key] = control.value; else delete parts[key];
              if (Object.keys(parts).every(function (name) { return name === 'paint' || name === 'thickness'; }))
                input.value = (parts.thickness || '1pt') + ' + ' + (parts.paint || 'black');
              else input.value = '(' + Object.keys(parts).map(function (name) { return name + ': ' + parts[name]; }).join(', ') + ')';
              input.dispatchEvent(new Event('input', { bubbles: true }));
              propertyDraftChanged({ type: 'change' });
            });
          }
          strokeComponent('thickness', 'Thickness', null, '1pt');
          strokeComponent('dash', 'Dash', [['', 'Solid'], ['"dashed"', 'Dashed'], ['"dotted"', 'Dotted'], ['"dash-dotted"', 'Dash dot'], ['"densely-dashed"', 'Dense dash'], ['"loosely-dashed"', 'Loose dash']], '');
          strokeComponent('cap', 'Cap', [['', 'Default'], ['"butt"', 'Butt'], ['"round"', 'Round'], ['"square"', 'Square']], '');
          strokeComponent('join', 'Join', [['', 'Default'], ['"miter"', 'Miter'], ['"round"', 'Round'], ['"bevel"', 'Bevel']], '');
          var help = document.createElement('div'); help.className = 'cetzHint';
          help.textContent = '1pt + black · (paint: red, thickness: 2pt, dash: "dashed", cap: "round")'; row.appendChild(help);
        }
      }
      if (field.key === 'stroke' || field.key === 'fill') refreshColor();
    }
    data.fields.forEach(function (field) {
      var value = Object.prototype.hasOwnProperty.call(state.values, field.key) ? state.values[field.key] : field.value;
      var copy = Object.assign({}, field, { value: value });
      if (copy.point) {
        var point = /^\(\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*\)$/.exec(value.trim());
        if (point) copy.point = [Number(point[1]), Number(point[2])];
        else delete copy.point;
      }
      addField(copy);
    });
    var hint = document.createElement('div'); hint.className = 'cetzHint';
    hint.textContent = 'Values accept Typst expressions, named anchors and dictionaries. Clear an optional value to inherit its default. Coordinates use the local CeTZ coordinate system.';
    extraSection.appendChild(hint);
    var customPair = document.createElement('div'); customPair.className = 'cetzPair'; extraSection.appendChild(customPair);
    var customName = inputFor(customPair, 'Additional property name', '', 'property-name');
    var customValue = inputFor(customPair, 'Additional property value', '', 'Typst value');
    var add = document.createElement('button'); add.type = 'button'; add.textContent = '+ Add property';
    extraSection.appendChild(add);
    add.addEventListener('click', function () {
      var name = customName.value.trim();
      if (!/^[A-Za-z][\w-]*$/.test(name) || inspectorFields.some(function (entry) { return entry.key === name; })) {
        inspectorStatus.textContent = 'Enter a new, valid property name.'; return;
      }
      addField({ key: name, label: name, value: '', section: 'Advanced' });
      var entry = inspectorFields[inspectorFields.length - 1]; entry.input.value = customValue.value;
      customName.value = customValue.value = ''; propertyDraftChanged();
    });
    inspectorStatus = document.createElement('div'); inspectorStatus.className = 'cetzStatus';
    inspectorStatus.setAttribute('role', 'status'); inspector.appendChild(inspectorStatus);
    if (restoreFocus && restoreFocus.label) {
      Array.prototype.some.call(inspector.querySelectorAll('[aria-label]'), function (input) {
        if (input.getAttribute('aria-label') !== restoreFocus.label) return false;
        input.focus({ preventScroll: true });
        if (restoreFocus.start !== null && input.setSelectionRange) input.setSelectionRange(restoreFocus.start, restoreFocus.end);
        return true;
      });
    }
    updateInspectorStatus(); return true;
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
        ['cetzMoveX', 'cetzMoveY', 'cetzMoveGrid'].forEach(function (key) { graph.setCellStyles(key, null, [entry.cell]); });
        model.setGeometry(entry.cell, geometry);
      });
    } finally { model.endUpdate(); }
  }
  function ensureCetzMenu() {
    if (!ui.menubar || cetzMenu && cetzMenu.parentNode) return;
    cetzMenu = ui.menubar.addMenu('CeTZ', function (menu, parent) {
      ['rect', 'circle', 'content', 'line'].concat(shapeNames).forEach(function (name) {
        menu.addItem(name, null, function () {
          if (!isCetz()) return;
          beginPlacement(name);
        }, parent);
      });
      menu.addSeparator(parent);
      addPathOperationMenu(menu, parent);
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
  var keyboardMoves = {}, replayingKeyboardMoves = false;
  function keyboardMoveStyles(cell, x, y, step) {
    graph.setCellStyles('cetzMoveX', String(Number(x.toFixed(8))), [cell]);
    graph.setCellStyles('cetzMoveY', String(Number(y.toFixed(8))), [cell]);
    graph.setCellStyles('cetzMoveGrid', '0', [cell]);
    graph.setCellStyles('cetzSnapStep', String(step), [cell]);
    ['cetzGuideX', 'cetzGuideY'].forEach(function (key) { graph.setCellStyles(key, '0', [cell]); });
  }
  function reconcileKeyboardMoves() {
    if (replayingKeyboardMoves || !Object.keys(keyboardMoves).length) return;
    if (!isCetz() || !isEditablePreview()) { keyboardMoves = {}; return; }
    var model = graph.getModel(), frame = cetzFrame(); if (!frame) return;
    if (Object.keys(model.cells || {}).some(function (id) {
      return /^cetz-scene-\d+$/.test(id) && /(?:^|;)cetzError=[^;]+;/.test(model.cells[id].style || '');
    })) { keyboardMoves = {}; return; }
    replayingKeyboardMoves = true;
    model.beginUpdate();
    try {
      Object.keys(keyboardMoves).forEach(function (id) {
        var pending = keyboardMoves[id], cell = model.getCell(id);
        if (!cell || !graph.isCellMovable(cell)) { delete keyboardMoves[id]; return; }
        var style = graph.getCellStyle(cell), x = Number(style.cetzReferenceX), y = Number(style.cetzReferenceY);
        function matches(point) { return Math.abs(point.x - x) < 0.000001 && Math.abs(point.y - y) < 0.000001; }
        // An unrelated source change wins. Only replay over an earlier point
        // in this keyboard sequence, never over a new object or external move.
        if (!Number.isFinite(x) || !Number.isFinite(y) || !pending.positions.some(matches)) { delete keyboardMoves[id]; return; }
        if (matches(pending) && style.cetzMoveX === undefined && style.cetzMoveY === undefined) { delete keyboardMoves[id]; return; }
        var geometry = model.getGeometry(cell).clone();
        var targetX = Number(style.cetzBaseX) + (pending.x - x) * frame.unitX;
        var targetY = Number(style.cetzBaseY) - (pending.y - y) * frame.unitY;
        if (Number(style.cetzMoveX) === pending.x && Number(style.cetzMoveY) === pending.y &&
          Math.abs(geometry.x - targetX) < 0.00002 && Math.abs(geometry.y - targetY) < 0.00002) return;
        geometry.x = targetX; geometry.y = targetY;
        keyboardMoveStyles(cell, pending.x, pending.y, pending.step);
        model.setGeometry(cell, geometry);
      });
    } finally { model.endUpdate(); replayingKeyboardMoves = false; }
  }
  ['pointerdown', 'mousedown'].forEach(function (type) {
    if (graph.container && graph.container.addEventListener)
      graph.container.addEventListener(type, function () { keyboardMoves = {}; }, true);
  });
  document.addEventListener('keydown', function (event) {
    var direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!direction || !isCetz() || !isEditablePreview() || placement || ui.dialog ||
      event.metaKey || event.ctrlKey || event.altKey || event.isComposing || event.keyCode === 229 || isTextTarget(event.target) ||
      event.target === outlineResize || graph.isEditing && graph.isEditing()) return;
    var selected = selectedEditableCells();
    if (!selected.length) return;
    var frame = cetzFrame(); if (!frame) return;
    event.preventDefault(); event.stopImmediatePropagation();
    var cells = selected.filter(function (cell) { return graph.isCellMovable(cell); });
    var step = snapStep() * (event.shiftKey ? 5 : 1);
    var dx = direction[0] * step, dy = direction[1] * step, model = graph.getModel();
    model.beginUpdate();
    try {
      cells.forEach(function (cell) {
        var g = model.getGeometry(cell), style = graph.getCellStyle(cell), anchor = cetzAnchor(cell);
        // Keep the source reference exact, independent of rounded SVG bounds.
        // Existing drag targets and unsaved geometry edits remain cumulative.
        var x = style.cetzReferenceX !== undefined
          ? Number(style.cetzReferenceX) + (g.x - Number(style.cetzBaseX)) / frame.unitX
          : (g.x + anchor.x - frame.originX) / frame.unitX;
        var y = style.cetzReferenceY !== undefined
          ? Number(style.cetzReferenceY) - (g.y - Number(style.cetzBaseY)) / frame.unitY
          : (frame.originY - g.y - anchor.y) / frame.unitY;
        if (style.cetzMoveX !== undefined && style.cetzMoveY !== undefined) {
          x = Number(style.cetzMoveX); y = Number(style.cetzMoveY);
        }
        var pending = keyboardMoves[cell.id] || { positions: [{ x: x, y: y }] };
        pending.x = Number((x + dx).toFixed(8)); pending.y = Number((y - dy).toFixed(8)); pending.step = snapStep();
        pending.positions.push({ x: pending.x, y: pending.y }); keyboardMoves[cell.id] = pending;
        keyboardMoveStyles(cell, pending.x, pending.y, pending.step);
      });
      graph.moveCells(cells, dx * frame.unitX, dy * frame.unitY);
    } finally { model.endUpdate(); }
  }, true);
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
    getGuideStates: graph.graphHandler && graph.graphHandler.getGuideStates,
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
  function circleThroughPoints(points) {
    if (points.length < 3) return null;
    var a = points[0], bx = points[1].x - a.x, by = points[1].y - a.y;
    var cx = points[2].x - a.x, cy = points[2].y - a.y;
    var cross = bx * cy - by * cx, extent = Math.max(bx * bx + by * by, cx * cx + cy * cy, (bx - cx) * (bx - cx) + (by - cy) * (by - cy));
    if (!extent || Math.abs(cross) <= 1e-10 * extent) return null;
    var u = bx * bx + by * by, v = cx * cx + cy * cy;
    var x = a.x + (u * cy - v * by) / (2 * cross), y = a.y + (bx * v - cx * u) / (2 * cross);
    return { x: x, y: y, radius: Math.hypot(a.x - x, a.y - y) };
  }
  function throughSegments(kind, p, style) {
    if (p.length < 3) return [];
    var a = p[0], b = p[1], c = p[2], center = circleThroughPoints(p);
    if (kind === 'bezier-through') {
      var d1 = Math.hypot(a.x - b.x, a.y - b.y), d2 = Math.hypot(c.x - b.x, c.y - b.y);
      if (!d1 || !d2) return [[a, c, a, c]];
      if (!center) {
        var se = Math.hypot(c.x - a.x, c.y - a.y);
        return d1 >= se && d1 >= d2 ? [[a, b, a, b]] : d2 >= se && d2 >= d1 ? [[c, b, c, b]] : [[a, c, a, c]];
      }
      // CeTZ's cubic-through-3points construction (distance parameterization,
      // ABC projection, and the tangent of the three-point circle).
      var t = d1 / (d1 + d2), den = Math.pow(t, 3) + Math.pow(1 - t, 3);
      var u = Math.pow(1 - t, 3) / den, ratio = Math.abs((den - 1) / den);
      var ax = b.x + (b.x - a.x * u - c.x * (1 - u)) / ratio;
      var ay = b.y + (b.y - a.y * u - c.y * (1 - u)) / ratio;
      var side = (c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x);
      var bc = (side > 0 ? -1 : 1) * Math.hypot(c.x - a.x, c.y - a.y) / 3;
      var dx = (b.y - center.y) / center.radius, dy = (center.x - b.x) / center.radius;
      var v1 = { x: ax + (b.x + t * bc * dx - ax) / (1 - t), y: ay + (b.y + t * bc * dy - ay) / (1 - t) };
      var v2 = { x: ax + (b.x - (1 - t) * bc * dx - ax) / t, y: ay + (b.y - (1 - t) * bc * dy - ay) / t };
      return [[a, c, { x: a.x + (v1.x - a.x) / t, y: a.y + (v1.y - a.y) / t },
        { x: c.x + (v2.x - c.x) / (1 - t), y: c.y + (v2.y - c.y) / (1 - t) }]];
    }
    if (!center) return [];
    var start = Math.atan2(a.y - center.y, a.x - center.x), tau = 2 * Math.PI;
    var sweep = -tau;
    if (kind === 'circle-through') start = -Math.PI / 2;
    if (kind === 'arc-through') {
      var stop = (Math.atan2(c.y - center.y, c.x - center.x) - start + tau) % tau;
      var middle = (Math.atan2(b.y - center.y, b.x - center.x) - start + tau) % tau;
      sweep = middle <= stop ? stop : stop - tau;
    }
    var count = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2))), step = sweep / count;
    function at(angle) { return { x: center.x + center.radius * Math.cos(angle), y: center.y + center.radius * Math.sin(angle) }; }
    var curves = Array.from({ length: count }, function (_, i) {
      var angle = start + step * i, next = angle + step, k = kind === 'circle-through' ? -0.551784 : 4 / 3 * Math.tan(step / 4), from = at(angle), to = at(next);
      return [from, to, { x: from.x - center.radius * k * Math.sin(angle), y: from.y + center.radius * k * Math.cos(angle) },
        { x: to.x + center.radius * k * Math.sin(next), y: to.y - center.radius * k * Math.cos(next) }];
    });
    if (kind === 'arc-through' && style.cetzThroughMode === 'PIE') curves.push([c, center, c, center]);
    return curves;
  }
  function curveSegments(kind, points, style) {
    function linear() { return points.slice(1).map(function (point, i) { return [points[i], point, points[i], point]; }); }
    function lerp(a, b, t) { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }
    var closed = String(style.cetzCurveClose) === '1', p = points.slice(), count = p.length;
    if (count < 2) return [];
    if (/-through$/.test(kind)) return throughSegments(kind, p, style);
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
    var curved = ['bezier', 'catmull', 'hobby', 'bezier-through', 'circle-through', 'arc-through'].indexOf(kind) >= 0;
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
      ['line', 'bezier', 'hobby', 'catmull', 'arc', 'content', 'anchor', 'group', 'mark', 'circle-through', 'arc-through', 'bezier-through']
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
    'min-width:0;max-width:100%;max-height:112px;overflow-wrap:anywhere;overflow:auto;padding:7px 12px;border-top:1px solid #d97706;' +
    'background:#fff7ed;color:#7c2d12;font:12px/1.4 sans-serif;white-space:pre-wrap;z-index:2;';
  if (ui.container) ui.container.appendChild(errorBar);
  function updateErrorBar(active) {
    var file = active && ui.getCurrentFile();
    var data = file && file.getData && file.getData();
    var attribute = typeof data === 'string' && /<mxfile\b[^>]*\bcetzStatus="([^"]*)"/.exec(data);
    var cells = graph.getModel().cells || {};
    var scene = Object.keys(cells).filter(function (id) { return /^cetz-scene-\d+$/.test(id); })
      .sort(function (a, b) { return Number(b.slice(11)) - Number(a.slice(11)); })[0];
    var liveStatus = scene && /(?:^|;)cetzError=([^;]*)(?:;|$)/.exec(cells[scene].style || '');
    if (liveStatus) attribute = liveStatus;
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
    handler.cetzGridEnabled = null;
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
        ['cetzMoveX', 'cetzMoveY', 'cetzMoveGrid'].forEach(function (key) { graph.setCellStyles(key, null, [cell]); });
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
    synchronizeInspectorDrafts();
    updatePathOperations();
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
      var detailed = updateInspector(cell, style, one);
      details.style.display = detailed || selected.length > 1 ? 'none' : '';
      if (detailed) [fill, stroke, width, dash, markStart, markEnd, textValue].forEach(function (input) { showField(input, false); });
      return;
    }
    inspector.style.display = 'none'; inspectorSignature = '';
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
  var outlineDropRow = null, outlineCollapsed = {}, outlineSignature = '', outlineSelection = '';
  var outlineList = null;
  var outlineHeight = null, outlineResizeDrag = null;
  var outlineResize = document.createElement('div'); outlineResize.className = 'cetzOutlineResize';
  outlineResize.tabIndex = 0; outlineResize.setAttribute('role', 'separator');
  outlineResize.setAttribute('aria-label', 'Resize Outline'); outlineResize.setAttribute('aria-orientation', 'horizontal');
  outlineResize.title = 'Drag to resize Outline. Arrow keys adjust height; double-click to reset.';
  try { var savedOutlineHeight = Number(localStorage.getItem('gui-cetz.outlineHeight')); if (savedOutlineHeight > 0) outlineHeight = savedOutlineHeight; } catch (error) {}
  function applyOutlineHeight(height) {
    var max = Math.max(140, (typeof window !== 'undefined' && window.innerHeight || 768) - 160);
    outlineHeight = height === null ? null : Math.round(Math.max(140, Math.min(max, height)));
    outline.style.height = outlineHeight === null ? '' : outlineHeight + 'px';
    outline.setAttribute('data-resized', String(outlineHeight !== null));
    outlineResize.setAttribute('aria-valuemin', '140'); outlineResize.setAttribute('aria-valuemax', String(max));
    outlineResize.setAttribute('aria-valuenow', String(outlineHeight || outline.offsetHeight || 320));
  }
  function rememberOutlineHeight() {
    try {
      if (outlineHeight === null) localStorage.removeItem('gui-cetz.outlineHeight');
      else localStorage.setItem('gui-cetz.outlineHeight', String(outlineHeight));
    } catch (error) {}
  }
  var outlineDownEvent = typeof PointerEvent === 'undefined' ? 'mousedown' : 'pointerdown';
  var outlineMoveEvent = outlineDownEvent === 'mousedown' ? 'mousemove' : 'pointermove';
  var outlineUpEvent = outlineDownEvent === 'mousedown' ? 'mouseup' : 'pointerup';
  function moveOutlineResize(event) {
    if (!outlineResizeDrag) return;
    event.preventDefault(); event.stopPropagation();
    applyOutlineHeight(outlineResizeDrag.height + event.clientY - outlineResizeDrag.y);
  }
  function finishOutlineResize(event) {
    if (!outlineResizeDrag) return;
    if (event && event.type === 'keydown' && event.key !== 'Escape') return;
    if (event && (event.type === 'pointercancel' || event.type === 'keydown')) applyOutlineHeight(outlineResizeDrag.previous);
    document.documentElement.style.cursor = outlineResizeDrag.cursor;
    document.documentElement.style.userSelect = outlineResizeDrag.userSelect;
    outlineResizeDrag = null; outlineResize.setAttribute('data-dragging', 'false'); rememberOutlineHeight();
    document.removeEventListener(outlineMoveEvent, moveOutlineResize, true);
    document.removeEventListener(outlineUpEvent, finishOutlineResize, true);
    document.removeEventListener('pointercancel', finishOutlineResize, true);
    document.removeEventListener('keydown', finishOutlineResize, true);
    if (event) { event.preventDefault(); event.stopPropagation(); }
  }
  outlineResize.addEventListener(outlineDownEvent, function (event) {
    if (event.button != null && event.button !== 0 || outlineResizeDrag) return;
    event.preventDefault(); event.stopPropagation();
    outlineResizeDrag = { y: event.clientY, height: outline.offsetHeight || outlineHeight || 320, previous: outlineHeight,
      cursor: document.documentElement.style.cursor, userSelect: document.documentElement.style.userSelect };
    outlineResize.focus({ preventScroll: true }); outlineResize.setAttribute('data-dragging', 'true');
    document.documentElement.style.cursor = 'row-resize'; document.documentElement.style.userSelect = 'none';
    document.addEventListener(outlineMoveEvent, moveOutlineResize, true);
    document.addEventListener(outlineUpEvent, finishOutlineResize, true);
    document.addEventListener('pointercancel', finishOutlineResize, true);
    document.addEventListener('keydown', finishOutlineResize, true);
  });
  outlineResize.addEventListener('keydown', function (event) {
    if (['ArrowUp', 'ArrowDown', 'Home', 'End'].indexOf(event.key) < 0) return;
    event.preventDefault(); event.stopPropagation();
    var height = outlineHeight || outline.offsetHeight || 320, step = event.shiftKey ? 40 : 16;
    applyOutlineHeight(event.key === 'Home' ? 140 : event.key === 'End' ? Infinity : height + (event.key === 'ArrowUp' ? -step : step));
    rememberOutlineHeight();
  });
  outlineResize.addEventListener('dblclick', function (event) {
    event.preventDefault(); event.stopPropagation(); applyOutlineHeight(null); rememberOutlineHeight();
  });
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('resize', function () { applyOutlineHeight(outlineHeight); });
    window.addEventListener('blur', finishOutlineResize);
  }
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
          shape.node.setAttribute('data-cetz-highlight-owner', state.cell.id);
          shape.node.style.opacity = '0.5';
          Array.prototype.forEach.call(shape.node.querySelectorAll('path, use'), function (path) {
            if (path.getAttribute('fill') !== 'none') path.setAttribute('fill', '#4675e7');
            path.setAttribute('stroke', '#4675e7');
            path.setAttribute('stroke-width', Math.max(1.5, Number(path.getAttribute('stroke-width')) || 0));
          });
        }
      });
    } };
  }
  // Use the Outline's artwork tint for canvas hover as well. The small margin
  // is in screen pixels, so thin paths remain easy to discover at every zoom.
  if (graph.addMouseListener) {
    var canvasHighlight = null, canvasHoverCell = null;
    function clearCanvasHighlight() {
      canvasHoverCell = null;
      if (canvasHighlight) canvasHighlight.highlight(null);
    }
    function hoverOwner(cell) {
      var model = graph.getModel();
      var point = cell && /^cetz-point-(\d+)-\d+$/.exec(cell.id || '');
      if (point) return model.getCell('cetz-edit-' + point[1]);
      while (cell && !/^cetz-edit-\d+$/.test(cell.id || '')) cell = model.getParent(cell);
      return cell;
    }
    graph.addMouseListener({
      mouseDown: clearCanvasHighlight,
      mouseUp: function () {},
      mouseMove: function (sender, event) {
        var nativeEvent = event.getEvent();
        if (!isEditablePreview() || placement || outlineDragging || graph.isMouseDown ||
          graph.isEditing() || nativeEvent.buttons || nativeEvent.touches ||
          nativeEvent.pointerType && nativeEvent.pointerType !== 'mouse') { clearCanvasHighlight(); return; }
        var cell = hoverOwner(event.getCell());
        if (!cell) {
          var x = event.getGraphX(), y = event.getGraphY(), distance = 6;
          var cells = graph.getModel().cells || {};
          Object.keys(cells).forEach(function (id) {
            if (!/^cetz-edit-\d+$/.test(id)) return;
            var state = graph.view.getState(cells[id]);
            if (!state) return;
            var dx = Math.max(state.x - x, 0, x - state.x - state.width);
            var dy = Math.max(state.y - y, 0, y - state.y - state.height);
            var nextDistance = Math.hypot(dx, dy);
            if (nextDistance <= distance) { distance = nextDistance; cell = cells[id]; }
          });
        }
        if (cell === canvasHoverCell) return;
        clearCanvasHighlight();
        if (!cell) return;
        canvasHoverCell = cell;
        if (!canvasHighlight) canvasHighlight = makeOutlineHighlight();
        canvasHighlight.highlight(graph.view.getState(cell));
      }
    });
    graph.container.addEventListener('mouseleave', clearCanvasHighlight);
    graph.container.addEventListener('scroll', clearCanvasHighlight);
    graph.getModel().addListener(mxEvent.CHANGE, clearCanvasHighlight);
    [mxEvent.SCALE, mxEvent.TRANSLATE, mxEvent.SCALE_AND_TRANSLATE].forEach(function (name) {
      graph.view.addListener(name, clearCanvasHighlight);
    });
  }
  function outlineIcon(kind) {
    var paths = {
      rect: 'M5 5H19V19H5Z', circle: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16',
      line: 'M5 18L19 6M4 17h2v2H4ZM18 5h2v2h-2Z', content: 'M5 5H19M12 5V19M8 19H16',
      arc: 'M5 18A10 10 0 0 1 19 6', bezier: 'M4 18C4 2 20 22 20 6M4 5V18M20 6V19',
      hobby: 'M3 16C6 2 9 20 12 10S18 3 21 14', catmull: 'M3 16C6 2 9 20 12 10S18 3 21 14',
      grid: 'M4 4H20V20H4ZM4 9H20M4 15H20M9 4V20M15 4V20',
      'n-star': 'M12 3L15 9L21 10L16 15L17 21L12 18L7 21L8 15L3 10L9 9Z',
      polygon: 'M12 3L21 10L17 21H7L3 10Z', mark: 'M4 12H20M14 6L20 12L14 18',
      anchor: 'M12 4V20M4 12H20M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8',
      group: 'M3 7H10L12 9H21V20H3ZM3 7V4H10L12 6H21V9',
      'rect-around': 'M4 8V4H8M16 4H20V8M20 16V20H16M8 20H4V16M8 8H16V16H8Z',
      'compound-path': 'M4 4H20V20H4ZM12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8',
      'merge-path': 'M4 18V8H12V4H20V18Z'
    };
    paths['circle-through'] = paths.circle; paths['arc-through'] = paths.arc; paths['bezier-through'] = paths.bezier; paths.boolean = paths['compound-path'];
    return '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + (paths[kind] || paths.rect) + '"/></svg>';
  }
  function updateOutline() {
    outline.style.display = isEditablePreview() ? '' : 'none';
    if (outlineDragging) return;
    if (!isEditablePreview()) { outlineSignature = ''; return; }
    var cells = graph.getModel().cells || {};
    var frame = cetzFrame();
    var entries = Object.keys(cells).filter(function (id) { return /^cetz-edit-\d+$/.test(id); })
      .map(function (id) { return { id: id, cell: cells[id], style: graph.getCellStyle(cells[id]),
        index: Number(id.slice(10)) }; });
    var selected = {};
    graph.getSelectionCells().forEach(function (cell) {
      var point = /^cetz-point-(\d+)-\d+$/.exec(cell.id || '');
      selected[point ? 'cetz-edit-' + point[1] : cell.id] = true;
    });
    var selection = Object.keys(selected).filter(function (id) { return /^cetz-edit-/.test(id); }).sort().join(',');
    if (selection !== outlineSelection) {
      Object.keys(selected).forEach(function (id) {
        var current = cells[id], visited = {};
        while (current) {
          var group = graph.getCellStyle(current).cetzGroup;
          if (group === undefined || group === '' || visited[group]) break;
          visited[group] = true; delete outlineCollapsed['cetz-edit-' + group]; current = cells['cetz-edit-' + group];
        }
      });
      outlineSelection = selection;
    }
    Object.keys(outlineCollapsed).forEach(function (id) { if (!cells[id]) delete outlineCollapsed[id]; });
    entries.forEach(function (entry) { entry.description = outlineDescription(entry, cells, frame); });
    var signature = JSON.stringify([entries.map(function (entry) { return [entry.id, entry.description, entry.style.cetzGroup, entry.style.cetzStart]; }), selection, outlineCollapsed]);
    if (signature === outlineSignature) return;
    outlineSignature = signature;
    var scroll = outlineList && outlineList.scrollTop || 0;
    clearOutlineDropLine();
    if (outlineHighlight) outlineHighlight.highlight(null);
    outline.textContent = '';
    var heading = document.createElement('header');
    var eyebrow = document.createElement('small'); eyebrow.textContent = 'DOCUMENT / CeTZ'; heading.appendChild(eyebrow);
    var headingLine = document.createElement('div'); headingLine.className = 'cetzOutlineHeading';
    var title = document.createElement('h2'); title.textContent = 'Outline'; headingLine.appendChild(title);
    var count = document.createElement('span'); count.className = 'cetzOutlineCount'; count.textContent = String(entries.length);
    count.setAttribute('aria-label', entries.length + ' objects'); headingLine.appendChild(count); heading.appendChild(headingLine);
    var hint = document.createElement('div'); hint.className = 'cetzOutlineHint';
    hint.textContent = selection ? Object.keys(selected).length + ' selected · Drag handles to reorder' : 'Objects & groups · Drag handles to reorder';
    heading.appendChild(hint); outline.appendChild(heading);
    outlineList = document.createElement('div'); outlineList.className = 'cetzOutlineList';
    outlineList.setAttribute('role', 'list'); outlineList.setAttribute('aria-label', 'Drawing objects'); outline.appendChild(outlineList);
    if (!entries.length) {
      var empty = document.createElement('div'); empty.className = 'cetzOutlineEmpty';
      empty.textContent = 'No objects yet. Choose a shape from the right toolbar to start drawing.'; outlineList.appendChild(empty);
    }
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
        var row = document.createElement('div'); row.className = 'cetzOutlineRow';
        row.setAttribute('role', 'listitem'); row.setAttribute('data-cetz-outline-id', entry.id);
        row.setAttribute('data-selected', selected[entry.id] ? 'true' : 'false'); row.draggable = false;
        row.style.paddingLeft = (2 + depth * 14) + 'px';
        var grip = document.createElement('span'); grip.className = 'cetzOutlineGrip';
        grip.textContent = '⋮⋮'; grip.draggable = true;
        grip.setAttribute('aria-label', 'Drag to reorder'); grip.title = 'Drag to reorder';
        var select = document.createElement('button'); select.className = 'cetzOutlineSelect'; select.type = 'button';
        select.title = entry.description; select.setAttribute('aria-label', entry.description);
        select.setAttribute('aria-pressed', selected[entry.id] ? 'true' : 'false');
        var icon = document.createElement('span'); icon.className = 'cetzOutlineIcon'; icon.innerHTML = outlineIcon(style.cetzKind);
        select.appendChild(icon);
        var text = document.createElement('span'); text.className = 'cetzOutlineText';
        var primary = document.createElement('span'); primary.className = 'cetzOutlineName';
        var label = document.createElement('span'); label.className = 'cetzOutlineNameText';
        try { label.textContent = decodeURIComponent(style.cetzLabel || style.cetzKind || 'shape'); }
        catch (error) { label.textContent = style.cetzKind || 'shape'; }
        primary.appendChild(label);
        var descendants = children[String(entry.index)] || [];
        if (descendants.length) {
          var badge = document.createElement('span'); badge.className = 'cetzOutlineCount'; badge.textContent = String(descendants.length); primary.appendChild(badge);
        }
        text.appendChild(primary);
        var secondary = document.createElement('span'); secondary.className = 'cetzOutlineMeta';
        var at = entry.description.lastIndexOf(' pos: ');
        secondary.textContent = (style.cetzKind || 'shape') + (at >= 0 ? ' · ' + entry.description.slice(at + 6).replace(' size: ', ' · ') : '');
        text.appendChild(secondary); select.appendChild(text);
        row.appendChild(grip); row.appendChild(select);
        if (descendants.length) {
          var branch = document.createElement('button'); branch.type = 'button'; branch.className = 'cetzOutlineBranch';
          branch.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="transform:rotate(' + (outlineCollapsed[entry.id] ? '0' : '90') + 'deg)"><path d="M9 5L16 12L9 19"/></svg>';
          branch.title = outlineCollapsed[entry.id] ? 'Expand group' : 'Collapse group';
          branch.setAttribute('aria-label', branch.title); branch.setAttribute('aria-expanded', outlineCollapsed[entry.id] ? 'false' : 'true');
          branch.addEventListener('click', function (event) {
            event.stopPropagation(); outlineCollapsed[entry.id] = !outlineCollapsed[entry.id]; updateOutline();
          });
          row.appendChild(branch);
        }
        [['↑', position > 0, 'move-before', position - 1],
          ['↓', position < siblings.length - 1, 'move-after', position + 1]].forEach(function (move) {
          var button = document.createElement('button'); button.type = 'button'; button.textContent = move[0];
          button.setAttribute('aria-label', move[0] === '↑' ? 'Move layer up' : 'Move layer down');
          button.className = 'cetzOutlineMove';
          button.style.display = move[1] ? '' : 'none';
          button.addEventListener('click', function (event) {
            event.stopPropagation();
            if (move[1]) sendSourceAction(move[2], null,
              [entry.index, siblings[move[3]].index]);
          });
          row.appendChild(button);
        });
        row.addEventListener('mouseenter', function () {
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
          if (outlineHighlight) outlineHighlight.highlight(null);
        });
        row.addEventListener('pointerdown', function (event) { event.stopPropagation(); });
        row.addEventListener('mousedown', function (event) { event.stopPropagation(); });
        function selectEntry(event) {
          if (event.preventDefault) event.preventDefault();
          event.stopPropagation();
          var additive = event.metaKey || event.ctrlKey || event.shiftKey;
          row.setAttribute('data-selected', 'true');
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
        outlineList.appendChild(row);
        if (!outlineCollapsed[entry.id]) appendRows(String(entry.index), depth + 1);
      });
    }
    appendRows('root', 0);
    outlineList.scrollTop = scroll;
    outline.appendChild(outlineResize);
    applyOutlineHeight(outlineHeight);
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
            if (cells.every(function (cell) { return /^cetz-edit-\d+$/.test(cell.id || ''); })) {
              var frame = cetzFrame(), geometry = model.getGeometry(cells[0]), anchor = cetzAnchor(cells[0]);
              var grid = this.cetzGridEnabled == null ? graph.gridEnabled : this.cetzGridEnabled;
              if (frame && geometry && anchor) {
                var firstX = (geometry.x + anchor.x - frame.originX) / frame.unitX;
                var firstY = (frame.originY - geometry.y - anchor.y) / frame.unitY;
                if (grid && !snap.x && Math.abs(args[1]) > 1e-10)
                  args[1] = (snapValue(firstX + args[1] / frame.unitX) - firstX) * frame.unitX;
                if (grid && !snap.y && Math.abs(args[2]) > 1e-10)
                  args[2] = (firstY - snapValue(firstY - args[2] / frame.unitY)) * frame.unitY;
                cells.forEach(function (cell, index) {
                  var g = model.getGeometry(cell), point = cetzAnchor(cell);
                  var x = (g.x + point.x + args[1] - frame.originX) / frame.unitX;
                  var y = (frame.originY - g.y - point.y - args[2]) / frame.unitY;
                  graph.setCellStyles('cetzMoveX', String(Number(x.toFixed(8))), [cell]);
                  graph.setCellStyles('cetzMoveY', String(Number(y.toFixed(8))), [cell]);
                  // A multiselection shares one translation; independently
                  // snapping every member would change their relative layout.
                  graph.setCellStyles('cetzMoveGrid', grid && index === 0 ? '1' : '0', [cell]);
                });
              }
            }
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
      if (original.getGuideStates) graph.graphHandler.getGuideStates = function () {
        var states = original.getGuideStates.apply(this, arguments);
        if (!isEditablePreview()) return states;
        var model = graph.getModel(), moving = {};
        (this.cells || graph.getSelectionCells()).forEach(function (cell) {
          var point = /^cetz-point-(\d+)-\d+$/.exec(cell.id || '');
          moving[point ? 'cetz-edit-' + point[1] : cell.id] = true;
        });
        return states.filter(function (state) {
          var id = state.cell && state.cell.id || '';
          if (!/^cetz-(?:edit-\d+|point-\d+-\d+)$/.test(id)) return false;
          var point = /^cetz-point-(\d+)-\d+$/.exec(id);
          var owner = point ? model.getCell('cetz-edit-' + point[1]) : state.cell, visited = {};
          // Preview images, axes and labels are implementation details. The
          // moving shape's own handles must not attract it back off-grid.
          while (owner) {
            if (moving[owner.id] || visited[owner.id]) return false;
            visited[owner.id] = true;
            var group = graph.getCellStyle(owner).cetzGroup;
            owner = group === undefined || group === '' ? null : model.getCell('cetz-edit-' + group);
          }
          return true;
        }).map(function (state) {
          if (!/^cetz-point-/.test(state.cell.id) && graph.getCellStyle(state.cell).cetzKind !== 'anchor') return state;
          var point = new mxRectangle(state.getCenterX(), state.getCenterY(), 0, 0);
          point.cell = state.cell;
          return point;
        });
      };
      if (original.useGuidesForEvent) graph.graphHandler.useGuidesForEvent = function () {
        var cells = graph.getSelectionCells();
        if (isEditablePreview() && cells.length === 1 &&
          /^cetz-point-\d+-\d+$/.test(cells[0].id || '')) preparePointGuide(this, cells[0]);
        return original.useGuidesForEvent.apply(this, arguments);
      };
      if (original.snapDelta) graph.snapDelta = function (delta, bounds, ignoreGrid, ignoreX, ignoreY) {
        var cells = graph.getSelectionCells();
        var cell = isEditablePreview() && cells.length === 1 ? cells[0] : null;
        if (isEditablePreview() && graph.graphHandler) {
          graph.graphHandler.cetzGuideSnap = { x: !!ignoreX, y: !!ignoreY };
          graph.graphHandler.cetzGridEnabled = !ignoreGrid && graph.gridEnabled;
        }
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
            if (!ignoreX && !ignoreGrid && graph.gridEnabled) delta.x = (frame.originX + snapValue((baseX + delta.x / scale - frame.originX) / frame.unitX) * frame.unitX - baseX) * scale;
            if (!ignoreY && !ignoreGrid && graph.gridEnabled) delta.y = (frame.originY - snapValue((frame.originY - baseY - delta.y / scale) / frame.unitY) * frame.unitY - baseY) * scale;
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
            addPathOperationMenu(menu, null);
            menu.addSeparator();
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
      if (graph.graphHandler && original.getGuideStates) graph.graphHandler.getGuideStates = original.getGuideStates;
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
  graph.getModel().addListener('change', function () { reconcileKeyboardMoves(); setTimeout(update, 0); });
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
