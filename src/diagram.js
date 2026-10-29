'use strict';
const { skipTrivia, closing, splitArgs, callArguments, locateCanvases } = require('./scanner');

const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
function numberArg(text, range) {
  const raw = text.slice(range.start, range.end);
  const trimmed = raw.trim();
  if (!NUMBER.test(trimmed)) return null;
  const start = range.start + raw.indexOf(trimmed);
  return { value: Number(trimmed), start, end: start + trimmed.length };
}
function pointArg(text, range) {
  const start = skipTrivia(text, range.start);
  if (text[start] !== '(') return null;
  const end = closing(text, start, '(', ')');
  if (end < 0 || text.slice(end + 1, range.end).trim()) return null;
  const args = splitArgs(text, start + 1, end);
  if (args.length !== 2) return null;
  const x = numberArg(text, args[0]), y = numberArg(text, args[1]);
  return x && y ? { x, y } : null;
}
function coordinateArg(text, range, previous) {
  if (!range) return null;
  const absolute = pointArg(text, range);
  if (absolute) return { ...absolute, abs: [absolute.x.value, absolute.y.value], relative: false };
  if (!previous) return null;
  const start = skipTrivia(text, range.start);
  if (text[start] !== '(') return null;
  const end = closing(text, start, '(', ')');
  if (end < 0 || text.slice(end + 1, range.end).trim()) return null;
  const args = splitArgs(text, start + 1, end);
  if (args.length !== 1) return null;
  const rel = namedArg(text, args, 'rel');
  const delta = rel && pointArg(text, rel);
  return delta ? { ...delta, abs: [previous.abs[0] + delta.x.value, previous.abs[1] + delta.y.value], relative: true } : null;
}
function radiusArg(text, range) {
  if (!range) return null;
  const simple = numberArg(text, range);
  if (simple) return { x: simple, y: simple, circular: true };
  const tuple = pointArg(text, range);
  return tuple ? { x: tuple.x, y: tuple.y, circular: false } : null;
}
function cornerArg(text, range) {
  if (!range) return { value: 0, unit: 'number', implicit: true };
  const raw = text.slice(range.start, range.end).trim();
  const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))%?$/.exec(raw);
  if (!match) return null;
  return { value: Number(match[1]), unit: raw.endsWith('%') ? 'percent' : 'number', start: range.start, end: range.end };
}
function angleArg(text, range) {
  if (!range) return { value: 0 };
  const raw = text.slice(range.start, range.end).trim();
  const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))deg$/.exec(raw);
  return match ? { value: Number(match[1]) } : null;
}
function positionalArgs(text, args) {
  return args.filter(arg => !/^\s*[\w-]+\s*:/.test(text.slice(arg.start, arg.end)));
}
function contentArg(text, range) {
  const start = skipTrivia(text, range.start);
  if (text[start] !== '[') return null;
  const end = closing(text, start, '[', ']');
  if (end < 0 || text.slice(end + 1, range.end).trim()) return null;
  const body = text.slice(start + 1, end);
  return { start: start + 1, end, value: body, plain: !/[\\\[\]#*$]/.test(body) };
}
function markArg(text, range) {
  if (!range) return { start: false, end: false };
  const raw = text.slice(range.start, range.end).trim();
  if (raw === 'none') return { start: false, end: false };
  if (!raw.startsWith('(') || !raw.endsWith(')')) return null;
  const inner = raw.slice(1, -1);
  const parts = inner.split(',').map(s => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  const mark = { start: false, end: false };
  for (const part of parts) {
    const match = /^(start|end):\s*(none|">"|"<>")$/.exec(part);
    if (!match) return null;
    mark[match[1]] = match[2] === 'none' ? false : match[2] === '">"' ? 'classic' : 'diamond';
  }
  return mark;
}
function transformCall(text, name, args, current) {
  const positional = positionalArgs(text, args);
  const next = { ...current };
  if (name === 'translate') {
    if (namedArg(text, args, 'pre') || namedArg(text, args, 'z')) return null;
    let x, y;
    if (positional.length === 1) {
      const vector = pointArg(text, positional[0]);
      if (!vector) return null;
      x = vector.x.value; y = vector.y.value;
    } else if (!positional.length) {
      const xArg = namedArg(text, args, 'x'), yArg = namedArg(text, args, 'y');
      x = xArg ? numberArg(text, xArg)?.value : 0;
      y = yArg ? numberArg(text, yArg)?.value : 0;
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    next.tx += current.sx * x; next.ty += current.sy * y;
  } else if (name === 'scale') {
    if (namedArg(text, args, 'origin') || namedArg(text, args, 'z')) return null;
    let x, y;
    if (positional.length === 1) x = y = numberArg(text, positional[0])?.value;
    else if (!positional.length) {
      const xArg = namedArg(text, args, 'x'), yArg = namedArg(text, args, 'y');
      x = xArg ? numberArg(text, xArg)?.value : 1;
      y = yArg ? numberArg(text, yArg)?.value : 1;
    }
    if (!Number.isFinite(x) || !Number.isFinite(y) || x <= 0 || y <= 0) return null;
    next.sx *= x; next.sy *= y;
  }
  return next;
}
function namedArg(text, args, name) {
  for (const arg of args) {
    const match = text.slice(arg.start, arg.end).match(new RegExp('^\\s*' + name + '\\s*:\\s*'));
    if (match) return { start: arg.start + match[0].length, end: arg.end };
  }
  return null;
}
function parseCanvas(text, canvasIndex = 0) {
  const canvas = locateCanvases(text)[canvasIndex];
  if (!canvas) return null;
  const elements = [], unsupported = canvas.advancedOptions ? ['canvas options at ' + canvas.start] : [];
  const kinds = new Set(['rect', 'circle', 'line', 'content', 'polygon']);
  const otherDrawingNames = new Set(['circle-through', 'arc', 'arc-through', 'grid', 'bezier', 'bezier-through', 'n-star', 'rect-around',
    'hobby', 'catmull', 'mark', 'merge-path', 'compound-path', 'boolean', 'hide', 'intersections',
    'group', 'anchor', 'scope', 'copy-anchors', 'set-ctx', 'get-ctx', 'for-each-anchor', 'on-layer',
    'floating', 'set-style', 'stroke', 'fill', 'register-mark', 'set-to', 'on-xy', 'on-xz', 'on-zy',
    'register-coordinate-resolver']);
  const transformNames = new Set(['translate', 'scale']);
  const unsafeNames = new Set(['rotate', 'set-transform', 'set-origin', 'move-to', 'set-viewport', 'ortho', 'perspective']);
  const dynamicNames = new Set(['for', 'if', 'while', 'let', 'context']);
  let transform = { sx: 1, sy: 1, tx: 0, ty: 0 }, unsafe = false;
  for (let i = canvas.bodyStart; i < canvas.bodyEnd; i++) {
    if (text[i] === '"') { i = skipQuoted(text, i) - 1; continue; }
    if (text.startsWith('//', i) || text.startsWith('/*', i)) { i = skipTrivia(text, i) - 1; continue; }
    if ('([{'.includes(text[i])) {
      const end = closing(text, i, text[i], { '(': ')', '[': ']', '{': '}' }[text[i]]);
      if (end >= 0) { i = end; continue; }
    }
    if (!/[A-Za-z_]/.test(text[i])) continue;
    const match = /^[A-Za-z_][\w-]*/.exec(text.slice(i));
    if (!match) continue;
    const name = match[0], open = skipTrivia(text, i + name.length);
    if (/[\w.]/.test(text[i - 1] || '')) { i += name.length - 1; continue; }
    if (dynamicNames.has(name)) unsupported.push(name + ' at ' + i);
    if ((transformNames.has(name) || unsafeNames.has(name)) && text[open] === '(') {
      const end = closing(text, open, '(', ')');
      if (end >= 0 && end < canvas.bodyEnd) {
        const args = splitArgs(text, open + 1, end);
        const next = transformNames.has(name) && !unsafe ? transformCall(text, name, args, transform) : null;
        if (next) transform = next;
        else { unsafe = true; unsupported.push(name + ' transform at ' + i); }
        i = end; continue;
      }
      unsafe = true;
    }
    if (!kinds.has(name) || text[open] !== '(') {
      if (otherDrawingNames.has(name) && text[open] === '(' || text[open] === '(' && !dynamicNames.has(name))
        unsupported.push(name + ' at ' + i);
      i += name.length - 1; continue;
    }
    const parsed = callArguments(text, open, canvas.bodyEnd);
    if (!parsed) { unsupported.push(name + ' at ' + i); continue; }
    const end = parsed.end - 1;
    const args = parsed.args, positional = positionalArgs(text, args);
    let points = [], radius, corner, label, sides, angle, close = false, mark;
    if (name === 'rect') {
      points = [coordinateArg(text, positional[0])];
      points.push(coordinateArg(text, positional[1], points[0]));
      corner = cornerArg(text, namedArg(text, args, 'radius'));
    } else if (name === 'circle') {
      points = [coordinateArg(text, positional[0])];
      const radiusRange = namedArg(text, args, 'radius');
      radius = radiusRange ? radiusArg(text, radiusRange) : { x: { value: 1 }, y: { value: 1 }, circular: true, implicit: true };
    } else if (name === 'line') {
      for (const arg of positional) points.push(coordinateArg(text, arg, points.at(-1)));
      close = /^\s*true\s*$/.test(text.slice(...rangePair(namedArg(text, args, 'close'))));
      mark = markArg(text, namedArg(text, args, 'mark'));
    } else if (name === 'content') {
      points = [coordinateArg(text, positional[0])];
      label = positional.length === 2 && contentArg(text, positional[1]);
    } else if (name === 'polygon') {
      points = [coordinateArg(text, positional[0])];
      sides = positional[1] && numberArg(text, positional[1]);
      const radiusRange = namedArg(text, args, 'radius');
      radius = radiusRange ? radiusArg(text, radiusRange) : { x: { value: 1 }, y: { value: 1 }, circular: true, implicit: true };
      angle = angleArg(text, namedArg(text, args, 'angle'));
    }
    const fillRange = namedArg(text, args, 'fill'), strokeRange = namedArg(text, args, 'stroke');
    if (unsafe || points.some(p => !p) || (name === 'line' && points.length < 2) ||
        (name === 'rect' && (positional.length !== 2 || !corner || corner.value < 0)) ||
        (name === 'line' && (!mark || (namedArg(text, args, 'close') && !/^\s*(?:true|false)\s*$/.test(text.slice(...rangePair(namedArg(text, args, 'close'))))))) ||
        (name === 'circle' && (positional.length !== 1 || !radius)) ||
        (name === 'content' && (positional.length !== 2 || !label)) ||
        (name === 'polygon' && (positional.length !== 2 || !sides || !radius || !angle || !Number.isInteger(sides.value) || sides.value < 3 || sides.value > 24)) ||
        namedArg(text, args, 'anchor') || (name === 'content' && namedArg(text, args, 'angle'))) {
      unsupported.push(name + ' at ' + i);
    } else {
      elements.push({ id: 'cetz-' + canvasIndex + '-' + elements.length, kind: name,
        start: i, end: end + 1, points, radius: radius?.circular ? radius.x : undefined,
        radii: radius, corner, sides, angle, label, close, mark, transform: { ...transform },
        fill: fillRange, stroke: strokeRange,
        markRange: namedArg(text, args, 'mark'), name: namedArg(text, args, 'name') });
    }
    i = end;
  }
  return { canvas, elements, unsupported, endTransform: unsafe ? null : transform };
}
function rangePair(range) { return range ? [range.start, range.end] : [0, 0]; }
function skipQuoted(text, i) {
  i++;
  while (i < text.length) { if (text[i] === '\\') i += 2; else if (text[i++] === '"') break; }
  return i;
}
module.exports = { parseCanvas, numberArg, pointArg, coordinateArg };
