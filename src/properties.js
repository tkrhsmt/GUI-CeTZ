'use strict';

const { skipTrivia, closing, splitArgs } = require('./scanner');

// CeTZ shapes and style parameters. Values stay Typst expressions: a
// coordinate reference, a ratio or a dictionary must survive an inspector edit.
const CONTAINERS = new Set(['ortho', 'perspective', 'on-xy', 'on-xz', 'on-zy', 'on-yz', 'scope', 'group']);
const SCHEMAS = {
  ortho: { x: '35.264deg', y: '45deg', z: '0deg', sorted: 'true', 'cull-face': 'none', 'reset-transform': 'false', flatten: 'false' },
  perspective: { x: '35.264deg', y: '45deg', z: '0deg', distance: 'auto', sorted: 'true', 'cull-face': 'none', 'reset-transform': 'false' },
  'on-xy': { z: '0' }, 'on-xz': { y: '0' }, 'on-zy': { x: '0' }, 'on-yz': { x: '0' },
  scope: {}, group: { name: 'none' },
  'circle-through': { anchor: 'none' },
  'arc-through': { mode: '"OPEN"', 'update-position': 'true', mark: 'none' },
  'bezier-through': { mark: 'none', shorten: '"LINEAR"' },
  boolean: { op: '"difference"', 'fill-rule-a': 'auto', 'fill-rule-b': 'auto', eps: 'auto', 'ignore-marks': 'true', 'ignore-hidden': 'true' },
  line: { close: 'false', mark: 'none' },
  rect: { radius: '0', anchor: 'none' },
  circle: { radius: '1', anchor: 'none' },
  arc: { start: 'auto', stop: 'auto', delta: 'auto', radius: '1', mode: '"OPEN"', anchor: 'none', 'update-position': 'true', mark: 'none' },
  polygon: { radius: '1', angle: '0deg', anchor: 'none' },
  'n-star': { radius: '1', 'inner-radius': '50%', angle: '0deg', 'show-inner': 'false', anchor: 'none' },
  grid: { step: '1', shift: '0', 'help-lines': 'false' },
  'rect-around': { padding: 'none', radius: '0', 'ignore-marks': 'false', 'ignore-hidden': 'false', 'ignore-floating': 'false', 'ignore-shapes': 'false' },
  bezier: { mark: 'none', shorten: '"LINEAR"' },
  hobby: { close: 'false', ta: 'auto', tb: 'auto', omega: '(0, 0)', mark: 'none', shorten: '"LINEAR"' },
  catmull: { close: 'false', tension: '0.5', mark: 'none', shorten: '"LINEAR"' },
  content: { angle: '0deg', anchor: 'none', padding: 'none', frame: 'none', 'auto-scale': 'false' },
  mark: { symbol: 'none', scale: '1', length: '0.2cm', width: '0.15cm', inset: '0.05cm', offset: '0', pos: 'none', sep: '0.1cm', slant: 'none', harpoon: 'false', flip: 'false', reverse: 'false', anchor: '"tip"' },
  'merge-path': { close: 'false', join: 'true', 'ignore-marks': 'true', 'ignore-hidden': 'true' },
  'compound-path': { 'fill-rule': '"non-zero"' },
  anchor: {}
};
const POINT = /^\(\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?:\s*,\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)))?\s*,?\s*\)$/;
function valueEnd(text, start, end) {
  let last = start;
  for (let i = start; i < end; i++) {
    if (/\s/.test(text[i])) continue;
    if (text.startsWith('//', i) || text.startsWith('/*', i)) { i = skipTrivia(text, i) - 1; continue; }
    if (text[i] === '"') {
      for (i++; i < end; i++) {
        if (text[i] === '\\') i++;
        else if (text[i] === '"') break;
      }
    } else if ('([{'.includes(text[i])) {
      const close = closing(text, i, text[i], { '(': ')', '[': ']', '{': '}' }[text[i]]);
      if (close >= 0) i = close;
    }
    last = i + 1;
  }
  return last;
}
function argumentsOf(text) {
  const qualified = /^(?:cetz\.draw\.)?([\w-]+)/.exec(text);
  const name = qualified?.[1];
  const open = skipTrivia(text, qualified?.[0].length || 0), end = closing(text, open, '(', ')');
  if (!name || end < 0) throw new Error('Cannot inspect this CeTZ call.');
  let positional = 0;
  const args = splitArgs(text, open + 1, end).map(range => {
    const start = skipTrivia(text, range.start);
    if (start >= range.end) return { ...range, empty: true };
    const named = /^([\w-]+)\s*:\s*/.exec(text.slice(start, range.end));
    const valueStart = skipTrivia(text, named ? start + named[0].length : start);
    // Keep whitespace outside the edited expression, including trailing comments.
    const last = valueEnd(text, valueStart, range.end);
    const value = text.slice(valueStart, last);
    return { ...range, valueStart, valueEnd: last, value,
      key: named ? named[1] : '$' + positional++, named: !!named };
  });
  return { name, open, end, args };
}
function positionalLabel(name, index, count) {
  if (name === 'boolean') return index === 0 ? 'Operand A' : 'Operand B';
  if (name === 'circle-through') return ['Point A', 'Point B', 'Point C'][index];
  if (name === 'arc-through' || name === 'bezier-through') return ['Start', 'Through', 'End'][index];
  if (name === 'anchor') return index === 0 ? 'Name' : 'Position';
  if (['merge-path', 'compound-path'].includes(name)) return 'Path contents';
  if (name === 'content' && index === count - 1) return 'Text / content';
  if (['polygon', 'n-star'].includes(name) && index === 1) return 'Sides';
  if (['circle', 'arc', 'polygon', 'n-star', 'content'].includes(name) && index === 0) return 'Position';
  if (name === 'bezier') return ['Start', 'End', 'Control 1', 'Control 2'][index] || 'Control ' + (index - 1);
  if (index === 0) return ['rect', 'grid', 'rect-around'].includes(name) ? 'Corner 1' : 'Start';
  if (index === count - 1) return ['rect', 'grid', 'rect-around'].includes(name) ? 'Corner 2' : 'End';
  return 'Point ' + (index + 1);
}
function plainContentText(value) {
  if (/^\[[^\[\]\\#*$<>]*\]$/.test(value)) return value.slice(1, -1);
  try { const text = JSON.parse(value); return typeof text === 'string' ? text : null; }
  catch { return null; }
}
function propertyModel(call) {
  if (!SCHEMAS[call.name]) return null;
  const parsed = argumentsOf(call.call), args = parsed.args.filter(arg => !arg.empty);
  const count = args.filter(arg => !arg.named).length;
  const fields = args.filter(arg => !CONTAINERS.has(call.name) || (arg.named && arg.key !== 'body')).map(arg => {
    const match = !arg.named && POINT.exec(arg.value);
    const referencedObject = call.name === 'rect-around' && !arg.named && !/^\s*\(/.test(arg.value);
    const text = call.name === 'content' && arg.key === '$' + (count - 1) ? plainContentText(arg.value) : null;
    return { key: arg.key, label: arg.named ? arg.key : referencedObject ? 'Object ' + (+arg.key.slice(1) + 1) : positionalLabel(call.name, +arg.key.slice(1), count),
      value: arg.value, section: arg.named ? (['fill', 'stroke', 'fill-rule', 'mark'].includes(arg.key) ? 'Appearance' : 'Shape') : 'Geometry',
      ...(text !== null ? { text } : {}),
      ...(match ? { point: match.slice(1).filter(value => value !== undefined).map(Number) } : {}) };
  });
  const defaults = { ...SCHEMAS[call.name], ...(call.name === 'anchor' || CONTAINERS.has(call.name) ? {} : { name: 'none', stroke: '1pt + black', fill: 'none' }) };
  for (const field of fields) if (Object.hasOwn(defaults, field.key)) field.fallback = defaults[field.key];
  for (const [key, fallback] of Object.entries(defaults)) if (!fields.some(field => field.key === key))
    fields.push({ key, label: key, value: '', fallback,
      section: ['stroke', 'fill', 'fill-rule', 'mark'].includes(key) ? 'Appearance' : 'Shape' });
  if (call.name === 'boolean') {
    fields.find(field => field.key === 'op').choices = ['"union"', '"intersection"', '"difference"', '"xor"'];
    for (const field of fields) if (field.key[0] === '$') field.multiline = true;
  }
  return { kind: call.name, base: call.call, fields, ...(call.mode === '3d' ? { mode: '3d' } : {}) };
}
function expression(value) {
  if (typeof value !== 'string' || value.length > 100000 || !value.trim()) throw new Error('Enter a Typst expression.');
  // Require precisely one argument and balanced delimiters. Compilation in the
  // source transaction validates its type and semantics before changing a file.
  const stack = [], pairs = { '(': ')', '[': ']', '{': '}' };
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '"') {
      let closed = false;
      for (i++; i < value.length; i++) {
        if (value[i] === '\\') i++;
        else if (value[i] === '"') { closed = true; break; }
      }
      if (!closed) throw new Error('Unclosed string in property.');
    } else if (value.startsWith('//', i) || value.startsWith('/*', i)) {
      i = skipTrivia(value, i) - 1;
    } else if (pairs[value[i]]) stack.push(pairs[value[i]]);
    else if (')]}'.includes(value[i])) {
      if (stack.pop() !== value[i]) throw new Error('Unbalanced property expression.');
    } else if (value[i] === ',' && !stack.length) throw new Error('Enter one property value at a time.');
  }
  if (stack.length) throw new Error('Unbalanced property expression.');
  return value.trim();
}
function propertyPatches(rendered, action) {
  if (action.indices.length !== 1) throw new Error('Select one shape to edit its properties.');
  const call = rendered.calls[action.indices[0]];
  const edit = JSON.parse(decodeURIComponent(action.value || ''));
  if (!call || edit.base !== call.call || !edit.values || typeof edit.values !== 'object' || Array.isArray(edit.values))
    throw new Error('The shape changed. Select it again before editing properties.');
  const parsed = argumentsOf(call.call), remaining = new Map(Object.entries(edit.values));
  if (remaining.size > 200) throw new Error('Too many properties.');
  if (call.mode === '3d' && CONTAINERS.has(call.name) &&
      [...remaining.keys()].some(key => key[0] === '$' || key === 'body'))
    throw new Error('Edit nested shapes individually or edit the body in Typst.');
  const parts = [];
  for (const arg of parsed.args) {
    if (arg.empty) continue;
    if (!remaining.has(arg.key)) { parts.push(call.call.slice(arg.start, arg.end)); continue; }
    const value = remaining.get(arg.key); remaining.delete(arg.key);
    if (value === '' && arg.named) continue;
    parts.push(call.call.slice(arg.start, arg.valueStart) + expression(value) + call.call.slice(arg.valueEnd, arg.end));
  }
  for (const [key, value] of remaining) {
    if (!/^[a-zA-Z][\w-]*$/.test(key)) throw new Error('Invalid property name.');
    if (value !== '') parts.push(` ${key}: ${expression(value)}`);
  }
  let text = call.call.slice(0, parsed.open + 1) + parts.join(',') + call.call.slice(parsed.end);
  if (call.rotation) text = `scope({ rotate(${call.rotation.angle}deg, origin: (${call.rotation.cx}, ${call.rotation.cy})); ${text} })`;
  return [{ start: call.start, end: call.end, text }];
}
module.exports = { propertyModel, propertyPatches, argumentsOf, plainContentText, expression, SCHEMAS };
