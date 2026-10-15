'use strict';

const { closing, skipTrivia, splitArgs } = require('./scanner');
const { renderCanvas } = require('./preview');
const { templateInsertions } = require('./templates');
const { color: parseColor, stroke: parseStroke, typstColor, typstStroke } = require('./style');

const EDITABLE = new Set(['arc', 'mark', 'n-star', 'grid', 'rect-around', 'bezier', 'hobby',
  'catmull', 'merge-path', 'compound-path', 'rect', 'circle', 'content', 'line', 'polygon']);
const NUMBER = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)';
const BASE_X = 500, BASE_Y = 500;
const POINT = new RegExp(`\\(\\s*(${NUMBER})\\s*,\\s*(${NUMBER})\\s*\\)`, 'g');
const POINT_HANDLE_NAMES = new Set(['bezier', 'hobby', 'catmull', 'line']);
const POINT_HANDLE_SIZE = 14;
const WRAPPER = new RegExp(`^scope\\(\\{\\s*translate\\(x:\\s*(${NUMBER}),\\s*y:\\s*(${NUMBER})\\)\\s*scale\\(x:\\s*(${NUMBER}),\\s*y:\\s*(${NUMBER})\\)\\s*`);
const round = n => Number(n.toFixed(5));
const FILLABLE = new Set(['rect', 'circle', 'polygon', 'n-star', 'rect-around', 'merge-path', 'compound-path']);
const STYLE_KEYS = new Set(['cetzFillColor', 'cetzStrokeColor', 'cetzStrokeWidth', 'cetzDash']);

function namedArgument(text, name) {
  const open = skipTrivia(text, /^[\w-]+/.exec(text)?.[0].length || 0);
  if (text[open] !== '(') return null;
  const end = closing(text, open, '(', ')');
  if (end < 0) return null;
  const arg = splitArgs(text, open + 1, end).find(part =>
    new RegExp(`^\\s*${name}\\s*:`).test(text.slice(part.start, part.end)));
  if (!arg) return { end, value: null, start: end, valueEnd: end };
  const prefix = new RegExp(`^\\s*${name}\\s*:\\s*`).exec(text.slice(arg.start, arg.end))[0];
  return { end, value: text.slice(arg.start + prefix.length, arg.end).trim(),
    start: arg.start + prefix.length, valueEnd: arg.end };
}

function editableStyle(call) {
  const fill = namedArgument(call.call, 'fill')?.value;
  const stroke = namedArgument(call.call, 'stroke')?.value;
  const parsedStroke = parseStroke(stroke);
  return { cetzKind: call.name,
    cetzFillColor: FILLABLE.has(call.name) && parseColor(fill) !== 'none' ? parseColor(fill) || '#ffffff' : '#ffffff',
    cetzStrokeColor: parsedStroke?.color && parsedStroke.color !== 'none' ? parsedStroke.color : '#000000',
    cetzStrokeWidth: parsedStroke?.width || 1,
    cetzDash: parsedStroke?.dash || 'solid' };
}

function styleMap(style) {
  return Object.fromEntries((style || '').split(';').filter(Boolean).map(part => {
    const equal = part.indexOf('=');
    return equal < 0 ? [part, ''] : [part.slice(0, equal), part.slice(equal + 1)];
  }));
}

function rectCoordinates(text) {
  const open = skipTrivia(text, 4);
  const end = closing(text, open, '(', ')');
  if (end < 0) return null;
  const points = splitArgs(text, open + 1, end).filter(arg =>
    !/^\s*[\w-]+\s*:/.test(text.slice(arg.start, arg.end))).slice(0, 2);
  if (points.length < 2) return null;
  const point = new RegExp(`^\\s*\\(\\s*(${NUMBER})\\s*,\\s*(${NUMBER})\\s*\\)\\s*$`);
  const relative = new RegExp(`^\\s*\\(\\s*rel\\s*:\\s*\\(\\s*(${NUMBER})\\s*,\\s*(${NUMBER})\\s*\\)\\s*\\)\\s*$`);
  const first = point.exec(text.slice(points[0].start, points[0].end));
  const secondText = text.slice(points[1].start, points[1].end);
  const second = point.exec(secondText), delta = relative.exec(secondText);
  if (!first || !second && !delta) return null;
  return { first: { x: +first[1], y: +first[2] },
    second: { x: +(second || delta)[1], y: +(second || delta)[2], relative: !!delta } };
}

function rewriteEditableStyle(call, beforeStyle, afterStyle) {
  const changed = [...STYLE_KEYS].filter(key => beforeStyle[key] !== afterStyle[key]);
  if (!changed.length) return null;
  const edits = [];
  let appended = '';
  if (changed.some(key => key !== 'cetzFillColor')) {
    const arg = namedArgument(call.call, 'stroke');
    if (!arg || arg.value != null && !parseStroke(arg.value))
      throw new Error('Edit this CeTZ stroke expression in Typst.');
    const width = Number(afterStyle.cetzStrokeWidth);
    const replacement = typstStroke(afterStyle.cetzStrokeColor, width, afterStyle.cetzDash);
    if (arg.value == null) appended += `, stroke: ${replacement}`;
    else edits.push({ start: arg.start, end: arg.valueEnd, text: replacement });
  }
  if (changed.includes('cetzFillColor')) {
    if (!FILLABLE.has(call.name)) throw new Error('This CeTZ shape has no editable fill.');
    const arg = namedArgument(call.call, 'fill');
    if (!arg || arg.value != null && !parseColor(arg.value))
      throw new Error('Edit this CeTZ fill expression in Typst.');
    const replacement = typstColor(afterStyle.cetzFillColor);
    if (arg.value == null) appended += `, fill: ${replacement}`;
    else edits.push({ start: arg.start, end: arg.valueEnd, text: replacement });
  }
  if (appended) edits.push({ start: namedArgument(call.call, 'stroke').end,
    end: namedArgument(call.call, 'stroke').end, text: appended });
  return edits.sort((a, b) => b.start - a.start).reduce((value, edit) =>
    value.slice(0, edit.start) + edit.text + value.slice(edit.end), call.call);
}

function rewriteLiteralCall(call, transform) {
  const edits = [];
  const { tx, ty, sx, sy } = transform;
  const uniform = Math.abs(sx - sy) < 0.00001;
  function replace(range, value) { edits.push({ start: range.start, end: range.end, text: value }); }
  function rewritePoint(range) {
    const raw = call.slice(range.start, range.end);
    const match = new RegExp(`^\\s*\\(\\s*(${NUMBER})\\s*,\\s*(${NUMBER})\\s*\\)\\s*$`).exec(raw);
    if (!match) throw new Error('Edit this CeTZ coordinate in Typst: it is not a literal point.');
    replace(range, `(${round(+match[1] * sx + tx)}, ${round(+match[2] * sy + ty)})`);
  }
  function rewriteDimension(args, key, tupleAllowed, defaultValue) {
    if (Math.abs(sx - 1) < 0.00001 && Math.abs(sy - 1) < 0.00001) return;
    const found = args.find(arg => new RegExp(`^\\s*${key}\\s*:`).test(call.slice(arg.start, arg.end)));
    if (!found) {
      if (defaultValue == null || (sx === 1 && sy === 1)) return;
      const value = tupleAllowed && !uniform
        ? `(${round(defaultValue * sx)}, ${round(defaultValue * sy)})`
        : round(defaultValue * sx);
      edits.push({ start: args.end, end: args.end, text: `, ${key}: ${value}` });
      return;
    }
    const raw = call.slice(found.start, found.end);
    const prefix = new RegExp(`^\\s*${key}\\s*:\\s*`).exec(raw)[0];
    const value = raw.slice(prefix.length).trim();
    const tuple = new RegExp(`^\\(\\s*(${NUMBER})\\s*,\\s*(${NUMBER})\\s*\\)$`).exec(value);
    const scalar = new RegExp(`^${NUMBER}$`).test(value) ? +value : null;
    if (!tuple && scalar == null) throw new Error(`Edit this CeTZ ${key} in Typst: it is not a literal number.`);
    if (!tupleAllowed && !uniform) throw new Error(`This CeTZ ${key} cannot be resized differently in x and y without a transform.`);
    const output = tuple ? `(${round(+tuple[1] * sx)}, ${round(+tuple[2] * sy)})`
      : tupleAllowed && !uniform ? `(${round(scalar * sx)}, ${round(scalar * sy)})`
        : String(round(scalar * sx));
    replace({ start: found.start + prefix.length, end: found.end }, output);
  }
  function visit(start, name) {
    const open = skipTrivia(call, start + name.length);
    if (call[open] !== '(') throw new Error('The CeTZ call cannot be edited as literal arguments.');
    const end = closing(call, open, '(', ')');
    const args = splitArgs(call, open + 1, end);
    args.end = end;
    const positional = args.filter(arg => !/^\s*[\w-]+\s*:/.test(call.slice(arg.start, arg.end)));
    if (name === 'merge-path' || name === 'compound-path') {
      const body = call.slice(positional[0].start, positional[0].end);
      const nested = /\b(rect|circle|line|arc|bezier|hobby|catmull)\s*\(/g;
      for (const match of body.matchAll(nested)) visit(positional[0].start + match.index, match[1]);
      return;
    }
    const count = { arc: 1, mark: 2, 'n-star': 1, grid: 2, 'rect-around': 2,
      rect: 2, circle: 1, content: 1, polygon: 1 }[name];
    const coordinates = count == null ? positional : positional.slice(0, count);
    if (!coordinates.length || count != null && coordinates.length < count)
      throw new Error('The CeTZ call does not have literal coordinates to edit.');
    if (name === 'rect') {
      rewritePoint(coordinates[0]);
      const raw = call.slice(coordinates[1].start, coordinates[1].end);
      const relative = new RegExp(`^\\s*\\(\\s*rel\\s*:\\s*\\(\\s*(${NUMBER})\\s*,\\s*(${NUMBER})\\s*\\)\\s*\\)\\s*$`).exec(raw);
      if (relative) replace(coordinates[1], `(rel: (${round(+relative[1] * sx)}, ${round(+relative[2] * sy)}))`);
      else rewritePoint(coordinates[1]);
    } else coordinates.forEach(rewritePoint);
    if (name === 'content' && (!uniform || sx !== 1))
      throw new Error('CeTZ text size cannot be changed through its position arguments.');
    if (name === 'mark' && (!uniform || sx !== 1))
      throw new Error('CeTZ marks cannot be resized through their point arguments alone.');
    if (name === 'circle' || name === 'arc') rewriteDimension(args, 'radius', true, 1);
    if (name === 'n-star' || name === 'polygon') {
      if (!uniform) throw new Error('This CeTZ shape cannot be resized differently in x and y without a transform.');
      rewriteDimension(args, 'radius', false, 1);
      if (name === 'n-star') rewriteDimension(args, 'inner-radius', false, null);
    }
    if (name === 'grid') rewriteDimension(args, 'step', true, null);
    if (name === 'rect-around') rewriteDimension(args, 'padding', true, null);
  }
  const match = /^([\w-]+)/.exec(call);
  if (!match) throw new Error('The CeTZ call cannot be edited as literal arguments.');
  visit(0, match[1]);
  return edits.sort((a, b) => b.start - a.start).reduce((text, edit) =>
    text.slice(0, edit.start) + edit.text + text.slice(edit.end), call);
}

function locateEditableCalls(source, canvas) {
  const result = [];
  for (let i = canvas.bodyStart; i < canvas.bodyEnd;) {
    const next = skipTrivia(source, i);
    if (next !== i) { i = next; continue; }
    if (source[i] === '"') {
      i++;
      while (i < canvas.bodyEnd) {
        if (source[i] === '\\') i += 2;
        else if (source[i++] === '"') break;
      }
      continue;
    }
    if ('([{'.includes(source[i])) {
      const end = closing(source, i, source[i], { '(': ')', '[': ']', '{': '}' }[source[i]]);
      i = end < 0 ? i + 1 : end + 1; continue;
    }
    const match = /^[A-Za-z_][\w-]*/.exec(source.slice(i));
    if (!match || /[\w.]/.test(source[i - 1] || '')) { i++; continue; }
    const name = match[0], open = skipTrivia(source, i + name.length);
    if (source[open] !== '(') { i += name.length; continue; }
    const end = closing(source, open, '(', ')');
    if (end < 0 || end >= canvas.bodyEnd) { i += name.length; continue; }
    if (EDITABLE.has(name)) result.push({ name, start: i, end: end + 1,
      call: source.slice(i, end + 1), transform: { tx: 0, ty: 0, sx: 1, sy: 1 } });
    else if (name === 'scope') {
      const full = source.slice(i, end + 1), head = WRAPPER.exec(full);
      if (head) {
        const tail = full.slice(head[0].length, -2).trim();
        const inner = /^([\w-]+)\s*\(/.exec(tail);
        if (inner && EDITABLE.has(inner[1])) result.push({ name: inner[1], start: i, end: end + 1,
          call: tail, transform: { tx: +head[1], ty: +head[2], sx: +head[3], sy: +head[4] } });
      }
    }
    i = end + 1;
  }
  return result;
}

function boundsFor(call) {
  let points = [...call.call.matchAll(POINT)].map(m => [+m[1], +m[2]]);
  if (call.name === 'rect') {
    const rect = rectCoordinates(call.call);
    if (!rect) return null;
    points = [[rect.first.x, rect.first.y],
      [rect.second.x + (rect.second.relative ? rect.first.x : 0),
        rect.second.y + (rect.second.relative ? rect.first.y : 0)]];
  }
  if (!points.length) return null;
  if ((call.name === 'rect' || call.name === 'line') && points.length < 2) return null;
  let minX = Math.min(...points.map(p => p[0])), maxX = Math.max(...points.map(p => p[0]));
  let minY = Math.min(...points.map(p => p[1])), maxY = Math.max(...points.map(p => p[1]));
  const radiusTuple = new RegExp(`(?:^|[,\\s])radius:\\s*\\(\\s*(${NUMBER})\\s*,\\s*(${NUMBER})\\s*\\)`).exec(call.call);
  const radiusScalar = new RegExp(`(?:^|[,\\s])radius:\\s*(${NUMBER})(?![\\w.])`).exec(call.call);
  const r = radiusScalar ? +radiusScalar[1] : ['arc', 'n-star', 'circle', 'polygon'].includes(call.name) ? 1 : 0;
  if (['arc', 'n-star', 'circle', 'polygon'].includes(call.name)) {
    if (/(?:^|[,\s])radius\s*:/.test(call.call) && !radiusTuple && !radiusScalar) return null;
    const rx = radiusTuple ? +radiusTuple[1] : r;
    const ry = radiusTuple ? +radiusTuple[2] : r;
    if (rx <= 0 || ry <= 0) return null;
    let cx = points[0][0], cy = points[0][1];
    if (call.name === 'arc') {
      const arc = arcArguments(call.call);
      if (!arc) return null;
      const origin = arcOrigin(arc);
      cx = origin.x; cy = origin.y;
    }
    [minX, maxX] = [cx - rx, cx + rx];
    [minY, maxY] = [cy - ry, cy + ry];
  } else if (call.name === 'mark') {
    [minX, maxX] = [points[0][0] - 0.2, points[0][0] + 0.2];
    [minY, maxY] = [points[0][1] - 0.2, points[0][1] + 0.2];
  } else if (['merge-path', 'compound-path'].includes(call.name) && r > 0) {
    minX -= r; maxX += r; minY -= r; maxY += r;
  } else if (call.name === 'content') {
    const label = /\[([^\]]*)\]/.exec(call.call)?.[1] || '';
    minX -= Math.max(0.5, label.length * 0.15);
    maxX += Math.max(0.5, label.length * 0.15);
    minY -= 0.25; maxY += 0.25;
  }
  if (maxX - minX < 0.25) { minX -= 0.125; maxX += 0.125; }
  if (maxY - minY < 0.25) { minY -= 0.125; maxY += 0.125; }
  const t = call.transform;
  return { x: t.tx + t.sx * minX, y: t.ty + t.sy * minY,
    width: t.sx * (maxX - minX), height: t.sy * (maxY - minY) };
}

function literalPointRanges(call) {
  if (!POINT_HANDLE_NAMES.has(call.name)) return [];
  const open = skipTrivia(call.call, call.name.length);
  const end = closing(call.call, open, '(', ')');
  if (end < 0) return [];
  return splitArgs(call.call, open + 1, end)
    .filter(arg => !/^\s*[\w-]+\s*:/.test(call.call.slice(arg.start, arg.end)))
    .map(arg => {
      const raw = call.call.slice(arg.start, arg.end);
      const match = new RegExp(`^\\s*\\(\\s*(${NUMBER})\\s*,\\s*(${NUMBER})\\s*\\)\\s*$`).exec(raw);
      return match ? { start: arg.start, end: arg.end, x: +match[1], y: +match[2] } : null;
    })
    .filter(Boolean);
}

function arcArguments(text) {
  const open = skipTrivia(text, 3);
  const end = closing(text, open, '(', ')');
  if (end < 0) return null;
  const args = splitArgs(text, open + 1, end);
  const center = args[0];
  const point = new RegExp(`^\\s*\\(\\s*(${NUMBER})\\s*,\\s*(${NUMBER})\\s*\\)\\s*$`)
    .exec(text.slice(center.start, center.end));
  if (!point) return null;
  function named(key) {
    const arg = args.find(item => new RegExp(`^\\s*${key}\\s*:`).test(text.slice(item.start, item.end)));
    if (!arg) return null;
    const prefix = new RegExp(`^\\s*${key}\\s*:\\s*`).exec(text.slice(arg.start, arg.end))[0];
    return { start: arg.start + prefix.length, end: arg.end, value: text.slice(arg.start + prefix.length, arg.end).trim() };
  }
  const start = named('start'), stop = named('stop'), radius = named('radius');
  const anchor = named('anchor')?.value || '"arc-start"';
  if (anchor !== '"arc-start"' && anchor !== '"origin"') return null;
  const angle = new RegExp(`^(${NUMBER})deg$`);
  if (!start || !stop || !angle.test(start.value) || !angle.test(stop.value)) return null;
  const tuple = radius && new RegExp(`^\\(\\s*(${NUMBER})\\s*,\\s*(${NUMBER})\\s*\\)$`).exec(radius.value);
  const scalar = radius && new RegExp(`^${NUMBER}$`).test(radius.value) ? +radius.value : null;
  if (radius && !tuple && scalar == null) return null;
  const rx = tuple ? +tuple[1] : scalar == null ? 1 : scalar;
  const ry = tuple ? +tuple[2] : rx;
  if (rx <= 0 || ry <= 0) return null;
  return { center, px: +point[1], py: +point[2], start, stop, radius, rx, ry,
    anchor: anchor.slice(1, -1), tuple: !!tuple, end };
}

function arcOrigin(arc) {
  if (arc.anchor === 'origin') return { x: arc.px, y: arc.py };
  const angle = +arc.start.value.slice(0, -3) * Math.PI / 180;
  return { x: arc.px - arc.rx * Math.cos(angle), y: arc.py - arc.ry * Math.sin(angle) };
}

function arcControlPoints(call) {
  const arc = arcArguments(call.call);
  if (!arc) return [];
  const origin = arcOrigin(arc);
  const start = +arc.start.value.slice(0, -3) * Math.PI / 180;
  const radians = +arc.stop.value.slice(0, -3) * Math.PI / 180;
  return [{ x: origin.x + arc.rx * Math.cos(start), y: origin.y + arc.ry * Math.sin(start) },
    origin,
    { x: origin.x + arc.rx * Math.cos(radians), y: origin.y + arc.ry * Math.sin(radians) }];
}

function rewriteArcControl(text, index, x, y) {
  const arc = arcArguments(text);
  if (!arc) throw new Error('Arc control points require literal center, angles, and radius.');
  if (index === 0) {
    const origin = arcOrigin(arc);
    const dx = x - arcControlPoints({ call: text })[0].x;
    const dy = y - arcControlPoints({ call: text })[0].y;
    const px = arc.anchor === 'origin' ? origin.x + dx : x;
    const py = arc.anchor === 'origin' ? origin.y + dy : y;
    return text.slice(0, arc.center.start) + `(${round(px)}, ${round(py)})` + text.slice(arc.center.end);
  }
  if (index !== 1 && index !== 2) throw new Error('Unknown arc control point.');
  const origin = arcOrigin(arc);
  const startAngle = +arc.start.value.slice(0, -3) * Math.PI / 180;
  let scale, angle, angleArg;
  if (index === 1) {
    if (arc.anchor === 'origin')
      return text.slice(0, arc.center.start) + `(${round(x)}, ${round(y)})` + text.slice(arc.center.end);
    const dx = (arc.px - x) / arc.rx, dy = (arc.py - y) / arc.ry;
    scale = Math.hypot(dx, dy);
    if (scale < 0.001) throw new Error('An arc center cannot be moved onto its start point.');
    angle = Math.atan2(dy, dx) * 180 / Math.PI;
    angleArg = arc.start;
  } else {
    const dx = (x - (arc.anchor === 'origin' ? origin.x : arc.px)) / arc.rx;
    const dy = (y - (arc.anchor === 'origin' ? origin.y : arc.py)) / arc.ry;
    if (arc.anchor === 'origin') scale = Math.hypot(dx, dy);
    else {
      const dot = dx * Math.cos(startAngle) + dy * Math.sin(startAngle);
      scale = -(dx * dx + dy * dy) / (2 * dot);
    }
    if (!Number.isFinite(scale) || scale < 0.001)
      throw new Error('Move the arc end to the far side of its start tangent.');
    angle = arc.anchor === 'origin' ? Math.atan2(dy, dx) * 180 / Math.PI
      : Math.atan2(dy / scale + Math.sin(startAngle), dx / scale + Math.cos(startAngle)) * 180 / Math.PI;
    angleArg = arc.stop;
  }
  const rx = arc.rx * scale, ry = arc.ry * scale;
  const oldAngle = +angleArg.value.slice(0, -3);
  while (angle - oldAngle > 180) angle -= 360;
  while (angle - oldAngle < -180) angle += 360;
  const radius = arc.tuple || Math.abs(rx - ry) > 0.00001
    ? `(${round(rx)}, ${round(ry)})` : String(round(rx));
  const edits = [{ start: angleArg.start, end: angleArg.end, text: `${round(angle)}deg` }];
  if (arc.radius) edits.push({ start: arc.radius.start, end: arc.radius.end, text: radius });
  else edits.push({ start: arc.end, end: arc.end, text: `, radius: ${radius}` });
  return edits.sort((a, b) => b.start - a.start).reduce((value, edit) =>
    value.slice(0, edit.start) + edit.text + value.slice(edit.end), text);
}

function calibration(svg) {
  const marker = color => {
    const re = new RegExp(`<path\\b[^>]*fill="${color}"[^>]*\\/>`, 'i');
    const match = re.exec(svg);
    if (!match) throw new Error('CeTZ calibration marker was not rendered.');
    const translate = /transform="translate\(([^)]+)\)"/.exec(match[0]);
    if (!translate) throw new Error('CeTZ calibration marker has no position.');
    const xy = translate[1].trim().split(/[\s,]+/).map(Number);
    return { match: match[0], x: xy[0], y: xy[1] || 0 };
  };
  const zero = marker('#010203'), one = marker('#040506');
  const unitX = one.x - zero.x, unitY = zero.y - one.y;
  if (!(unitX > 0 && unitY > 0)) throw new Error('CeTZ calibration axes are invalid.');
  // SVG rectangle transforms point to the upper left; its (0, 0) coordinate is 0.01 units lower.
  return { svg: svg.replace(zero.match, '').replace(one.match, ''),
    zero: { ...zero, y: zero.y + 0.01 * unitY }, unitX, unitY };
}

async function renderEditable(source, canvas, filePath) {
  const calls = locateEditableCalls(source, canvas);
  if (!calls.length) return null;
  const markers = '\nrect((0, 0), (0.01, 0.01), fill: rgb("#010203"), stroke: none)\n' +
    'rect((1, 1), (1.01, 1.01), fill: rgb("#040506"), stroke: none)\n';
  const calibrated = source.slice(0, canvas.bodyEnd) + markers + source.slice(canvas.bodyEnd);
  const updatedCanvas = { ...canvas, bodyEnd: canvas.bodyEnd + markers.length, end: canvas.end + markers.length };
  const result = calibration(await renderCanvas(calibrated, updatedCanvas, filePath));
  const size = /<svg\b[^>]*viewBox="[^"]*?\s([\d.]+)\s([\d.]+)"/.exec(result.svg);
  if (!size) throw new Error('Typst SVG has no viewBox.');
  const width = +size[1] * 2.5, height = +size[2] * 2.5;
  const image = `data:image/svg+xml,${encodeURIComponent(result.svg)}`;
  const background = `<mxCell id="cetz-preview-background" value="" style="shape=image;imageAspect=1;movable=0;resizable=0;editable=0;deletable=0;rotatable=0;connectable=0;image=${image};" vertex="1" parent="1" connectable="0"><mxGeometry x="${round(BASE_X - result.zero.x * 2.5)}" y="${round(BASE_Y - result.zero.y * 2.5)}" width="${width}" height="${height}" as="geometry"/></mxCell>`;
  const handles = calls.map((call, i) => {
    const b = boundsFor(call);
    if (!b) return '';
    const x = BASE_X + b.x * result.unitX * 2.5;
    const y = BASE_Y - (b.y + b.height) * result.unitY * 2.5;
    const w = b.width * result.unitX * 2.5, h = b.height * result.unitY * 2.5;
    call.geometry = { x, y, width: w, height: h };
    const settings = Object.entries(editableStyle(call)).map(([key, value]) => `${key}=${value};`).join('');
    return `<mxCell id="cetz-edit-${i}" value="" style="rounded=0;fillColor=#ffffff;fillOpacity=1;strokeColor=#4f79ff;strokeOpacity=35;dashed=1;connectable=0;deletable=0;rotatable=0;${settings}" vertex="1" parent="1" connectable="0"><mxGeometry x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" as="geometry"/></mxCell>`;
  }).join('');
  function screenPoint(call, point) {
    return {
      x: BASE_X + (call.transform.tx + call.transform.sx * point.x) * result.unitX * 2.5,
      y: BASE_Y - (call.transform.ty + call.transform.sy * point.y) * result.unitY * 2.5
    };
  }
  const pointHandles = calls.map((call, i) => {
    call.points = call.geometry ? call.name === 'arc' ? arcControlPoints(call) : literalPointRanges(call) : [];
    return call.points.map((point, j) => {
      const { x, y } = screenPoint(call, point);
      const color = call.name === 'bezier' && j >= 2 || call.name === 'arc' && j >= 1
        ? '#e28b23' : '#2563eb';
      return `<mxCell id="cetz-point-${i}-${j}" value="" style="ellipse;fillColor=#ffffff;strokeColor=${color};strokeWidth=2;resizable=0;deletable=0;rotatable=0;connectable=0;" vertex="1" parent="1" connectable="0"><mxGeometry x="${round(x - POINT_HANDLE_SIZE / 2)}" y="${round(y - POINT_HANDLE_SIZE / 2)}" width="${POINT_HANDLE_SIZE}" height="${POINT_HANDLE_SIZE}" as="geometry"/></mxCell>`;
    }).join('');
  }).join('');
  const guides = calls.map((call, i) => {
    const pairs = call.name === 'bezier' && call.points.length >= 4 ? [[0, 2], [1, 3]]
      : call.name === 'arc' && call.points.length === 3 ? [[1, 0], [1, 2]] : [];
    return pairs.map(([start, end], j) => {
      const a = screenPoint(call, call.points[start]), b = screenPoint(call, call.points[end]);
      return `<mxCell id="cetz-guide-${i}-${j}" value="" style="edgeStyle=none;dashed=1;dashPattern=3 3;strokeColor=#e28b23;strokeOpacity=55;startArrow=none;endArrow=none;movable=0;deletable=0;selectable=0;" edge="1" parent="1" connectable="0"><mxGeometry relative="1" as="geometry"><mxPoint x="${round(a.x)}" y="${round(a.y)}" as="sourcePoint"/><mxPoint x="${round(b.x)}" y="${round(b.y)}" as="targetPoint"/></mxGeometry></mxCell>`;
    }).join('');
  }).join('');
  return { calls, canvas, xml: `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="GUI-CeTZ"><diagram name="CeTZ shapes"><mxGraphModel grid="1" page="0" pageWidth="${width}" pageHeight="${height}"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${background}${handles}${guides}${pointHandles}</root></mxGraphModel></diagram></mxfile>\n`,
    calibration: result };
}

function patchesFromEditable(source, rendered, xml, readCells) {
  const cells = readCells(xml), original = readCells(rendered.xml), patches = [];
  for (const [id, item] of cells)
    if (!original.has(id) && !/(?:^|;)cetzTemplate=[\w-]+(?:;|$)/.test(item.cell.style || ''))
      throw new Error('Use the CeTZ menu to add shapes to this canvas.');
  const background = cells.get('cetz-preview-background');
  const canonical = value => value && typeof value === 'object'
    ? Array.isArray(value) ? value.map(canonical) : Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]))
    : value;
  if (!background || JSON.stringify(canonical(background)) !== JSON.stringify(canonical(original.get('cetz-preview-background'))))
    throw new Error('The CeTZ preview background cannot be edited.');
  for (let i = 0; i < rendered.calls.length; i++) {
    const call = rendered.calls[i], id = `cetz-edit-${i}`;
    const item = cells.get(id), before = original.get(id);
    if (!before) continue;
    if (!item) { patches.push({ start: call.start, end: call.end, text: '' }); continue; }
    const beforeStyle = styleMap(before.cell.style), afterStyle = styleMap(item.cell.style);
    const otherStyleChanged = Object.keys({ ...beforeStyle, ...afterStyle })
      .some(key => !STYLE_KEYS.has(key) && beforeStyle[key] !== afterStyle[key]);
    if (otherStyleChanged || item.cell.value !== before.cell.value)
      throw new Error('Edit this CeTZ shape style in Typst.');
    const styleChanged = [...STYLE_KEYS].some(key => beforeStyle[key] !== afterStyle[key]);
    const a = before.geometry, b = item.geometry;
    const values = [b.x, b.y, b.width, b.height].map(Number);
    if (values.some(v => !Number.isFinite(v)) || values[2] <= 0 || values[3] <= 0)
      throw new Error('Invalid CeTZ shape bounds.');
    const pointMoves = [];
    for (let j = 0; j < (call.points || []).length; j++) {
      const pointId = `cetz-point-${i}-${j}`;
      const pointBefore = original.get(pointId), pointAfter = cells.get(pointId);
      if (!pointAfter || pointAfter.cell.style !== pointBefore.cell.style || pointAfter.cell.value !== pointBefore.cell.value ||
        pointAfter.cell.parent !== pointBefore.cell.parent ||
        ![pointAfter.geometry.x, pointAfter.geometry.y, pointAfter.geometry.width, pointAfter.geometry.height]
          .every(value => Number.isFinite(Number(value))) ||
        Math.abs(+pointAfter.geometry.width - +pointBefore.geometry.width) > 0.001 ||
        Math.abs(+pointAfter.geometry.height - +pointBefore.geometry.height) > 0.001)
        throw new Error('CeTZ control points can only be moved.');
      if (Math.abs(+pointAfter.geometry.x - +pointBefore.geometry.x) > 0.001 ||
        Math.abs(+pointAfter.geometry.y - +pointBefore.geometry.y) > 0.001) {
        pointMoves.push({ index: j, x: +pointAfter.geometry.x, y: +pointAfter.geometry.y });
      }
    }
    const boxChanged = !['x', 'y', 'width', 'height'].every(k => Math.abs(+a[k] - +b[k]) < 0.001);
    if (styleChanged) {
      if (boxChanged || pointMoves.length) throw new Error('Edit CeTZ style and geometry one at a time.');
      patches.push({ start: call.start, end: call.end,
        text: rewriteEditableStyle(call, beforeStyle, afterStyle) });
      continue;
    }
    if (pointMoves.length) {
      if (boxChanged) throw new Error('Move the CeTZ shape or its control points one at a time.');
      if (call.name === 'arc' && pointMoves.length !== 1)
        throw new Error('Move one arc control point at a time.');
      const flattened = call.transform.tx || call.transform.ty || call.transform.sx !== 1 || call.transform.sy !== 1
        ? rewriteLiteralCall(call.call, call.transform) : call.call;
      const coordinates = pointMoves.map(move => ({ index: move.index,
        x: (move.x + POINT_HANDLE_SIZE / 2 - BASE_X) / (rendered.calibration.unitX * 2.5),
        y: (BASE_Y - move.y - POINT_HANDLE_SIZE / 2) / (rendered.calibration.unitY * 2.5) }));
      let replacement;
      if (call.name === 'arc') {
        const point = coordinates[0];
        replacement = rewriteArcControl(flattened, point.index, point.x, point.y);
      } else {
        const ranges = literalPointRanges({ name: call.name, call: flattened });
        const edits = coordinates.map(point => ({ start: ranges[point.index].start, end: ranges[point.index].end,
          text: `(${round(point.x)}, ${round(point.y)})` }));
        replacement = edits.sort((a, b) => b.start - a.start).reduce((text, edit) =>
          text.slice(0, edit.start) + edit.text + text.slice(edit.end), flattened);
      }
      patches.push({ start: call.start, end: call.end, text: replacement });
      continue;
    }
    if (!boxChanged) continue;
    const sx = +b.width / +a.width, sy = +b.height / +a.height;
    const dx = +b.x - sx * +a.x, dy = +b.y - sy * +a.y;
    const tx = call.transform.tx * sx + (dx + (sx - 1) * BASE_X) / (rendered.calibration.unitX * 2.5);
    const ty = call.transform.ty * sy + ((1 - sy) * BASE_Y - dy) / (rendered.calibration.unitY * 2.5);
    const replacement = rewriteLiteralCall(call.call, { tx, ty, sx: call.transform.sx * sx, sy: call.transform.sy * sy });
    patches.push({ start: call.start, end: call.end, text: replacement });
  }
  return patches.concat(templateInsertions(source, rendered.canvas, cells, original));
}

module.exports = { locateEditableCalls, boundsFor, renderEditable, patchesFromEditable };
