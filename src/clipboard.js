'use strict';

const { locateCanvases, closing, skipTrivia, splitArgs } = require('./scanner');
const { locateEditableCalls, coordinateRanges } = require('./advanced');
const { insertionFor } = require('./templates');
const { coordinate } = require('./snapping');

const HEADER = '// GUI-CeTZ shapes v1\n';
const format = coordinate;

function offsetShapes(source, dx, dy) {
  const canvas = locateCanvases(source)[0];
  const calls = locateEditableCalls(source, canvas);
  const definitions = new Map(calls.map(call => [call, definition(call)]));
  function copiedNames(context) {
    return calls.flatMap(call => {
      const item = definitions.get(call);
      if (!item) return [];
      const parents = [];
      for (let parent = call.group; parent && parent !== context; parent = parent.group) parents.unshift(parent);
      if (parents.some(parent => !definitions.get(parent))) return [];
      return [[...parents.map(parent => definitions.get(parent).name), item.name].join('.')];
    });
  }
  const edits = [];
  function visit(call, offset, names, worldX = dx, worldY = dy) {
    if (call.name === 'group') return;
    const radians = -(call.rotation?.angle || 0) * Math.PI / 180;
    const tx = (worldX * Math.cos(radians) - worldY * Math.sin(radians)) / call.transform.sx;
    const ty = (worldX * Math.sin(radians) + worldY * Math.cos(radians)) / call.transform.sy;
    const ranges = coordinateRanges(call);
    if (call.name === 'merge-path' || call.name === 'compound-path') {
      const brace = skipTrivia(call.call, ranges[0].start);
      const bodyEnd = closing(call.call, brace, '{', '}');
      for (const child of locateEditableCalls(call.call, { bodyStart: brace + 1, bodyEnd }))
        visit(child, offset + child.start, names, tx, ty);
      return;
    }
    for (const [index, range] of ranges.entries()) {
      const original = call.call.slice(range.start, range.end);
      const raw = original.trim();
      // Copied anchors already inherit the offset from their owning shape.
      // A relative rectangle corner or line point likewise inherits movement.
      let internal = false;
      stringEdits(raw, 0, raw.length, value => {
        if (names.some(name => value === name || value.startsWith(name + '.'))) internal = true;
        return value;
      });
      const relativeToPrevious = index > 0 && /^\(\s*rel\s*:/.test(raw) && !/\bto\s*:/.test(raw);
      const previousPoint = call.name === 'line' && index > 0 && /^\(\s*\)\s*$/.test(raw);
      if (internal || relativeToPrevious || previousPoint) continue;
      const literal = /^\(\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*\)$/.exec(raw);
      const fromPrevious = call.name === 'line' && index > 0;
      const x = fromPrevious && /^\(\s*\(\s*\)\s*,\s*"\|-"\s*,/.test(raw) ? 0 : tx;
      const y = fromPrevious && /^\(\s*\(\s*\)\s*,\s*"-\|"\s*,/.test(raw) ? 0 : ty;
      const text = literal ? `(${format(+literal[1] + tx)}, ${format(+literal[2] + ty)})` :
        `(rel: (${format(x)}, ${format(y)}), to: ${raw})`;
      edits.push({ start: offset + range.start, end: offset + range.end,
        text: original.match(/^\s*/)[0] + text + original.match(/\s*$/)[0] });
    }
  }
  for (const call of calls) visit(call, source.indexOf(call.call, call.start), copiedNames(call.group));
  return edits.sort((a, b) => b.start - a.start).reduce((text, edit) =>
    text.slice(0, edit.start) + edit.text + text.slice(edit.end), source);
}

function copyShapes(source, rendered, indices) {
  const selected = new Set(indices.map(index => rendered.calls[index]));
  if (!selected.size || selected.has(undefined)) throw new Error('Select a CeTZ shape to copy.');
  const roots = [...selected].filter(call => {
    for (let parent = call.group; parent; parent = parent.group) if (selected.has(parent)) return false;
    return true;
  }).sort((a, b) => a.start - b.start);
  return HEADER + roots.map(call => {
    const prefix = source.slice(source.lastIndexOf('\n', call.start - 1) + 1, call.start);
    const indent = /^[ \t]*$/.test(prefix) ? prefix : '';
    return source.slice(call.start, call.end).split('\n').map((line, index) =>
      index && indent && line.startsWith(indent) ? line.slice(indent.length) : line).join('\n');
  }).join('\n');
}

function definition(call) {
  const open = skipTrivia(call.call, call.name.length);
  const end = closing(call.call, open, '(', ')');
  const args = splitArgs(call.call, open + 1, end);
  const arg = call.name === 'anchor' ? args[0] : args.find(arg => /^\s*name\s*:/.test(call.call.slice(arg.start, arg.end)));
  if (!arg) return null;
  const raw = call.call.slice(arg.start, arg.end);
  const match = (call.name === 'anchor' ? /^\s*"([^"\\]+)"\s*$/ : /^\s*name\s*:\s*"([^"\\]+)"\s*$/).exec(raw);
  if (!match) throw new Error('Copy and paste shapes with computed names in Typst.');
  const start = arg.start + raw.indexOf('"');
  return { name: match[1], start, end: start + match[1].length + 2 };
}

function stringEdits(text, start, end, rename) {
  const edits = [];
  for (let i = start; i < end;) {
    if (text.startsWith('//', i) || text.startsWith('/*', i)) { i = skipTrivia(text, i); continue; }
    if (text[i] !== '"') { i++; continue; }
    let next = i + 1;
    while (next < end) {
      if (text[next] === '\\') next += 2;
      else if (text[next++] === '"') break;
    }
    const raw = text.slice(i + 1, next - 1);
    const value = !raw.includes('\\') && rename(raw);
    if (value && value !== raw) edits.push({ start: i, end: next, text: `"${value}"` });
    i = next;
  }
  return edits;
}

function pasteShapes(source, rendered, clipboard, pasteIndex = 1) {
  clipboard = clipboard.replace(/\r\n/g, '\n');
  if (!clipboard.startsWith(HEADER)) throw new Error('Copy CeTZ shapes before pasting into the GUI.');
  const code = clipboard.slice(HEADER.length);
  const wrapped = '#cetz.canvas({\n' + code + '\n})';
  const canvas = locateCanvases(wrapped)[0];
  const calls = canvas && locateEditableCalls(wrapped, canvas);
  if (!calls?.length || canvas.end !== wrapped.length) throw new Error('The clipboard contains no CeTZ shapes.');
  const roots = calls.filter(call => !call.group).sort((a, b) => a.start - b.start);
  let cursor = canvas.bodyStart;
  for (const call of roots) {
    if (skipTrivia(wrapped, cursor) !== call.start) throw new Error('The clipboard contains unsupported CeTZ code.');
    cursor = call.end;
  }
  if (skipTrivia(wrapped, cursor) !== canvas.bodyEnd) throw new Error('The clipboard contains unsupported CeTZ code.');

  const names = new Set();
  for (const canvas of locateCanvases(source)) {
    for (const call of locateEditableCalls(source, canvas)) {
      try { const item = definition(call); if (item) names.add(item.name); } catch { /* Existing computed names stay untouched. */ }
    }
  }
  const definitions = new Map(calls.map(call => [call, definition(call)]));
  const replacements = new Map();
  for (const call of calls) {
    const item = definitions.get(call);
    if (!item) continue;
    let next = item.name, suffix = 2;
    while (names.has(next)) next = `${item.name}-${suffix++}`;
    names.add(next);
    replacements.set(call, next);
  }
  function mapping(context) {
    const map = new Map();
    for (const call of calls) {
      const item = definitions.get(call);
      if (!item) continue;
      const parents = [];
      for (let parent = call.group; parent && parent !== context; parent = parent.group) parents.unshift(parent);
      if (parents.some(parent => !definitions.get(parent))) continue;
      const old = [...parents.map(parent => definitions.get(parent).name), item.name].join('.');
      const next = [...parents.map(parent => replacements.get(parent)), replacements.get(call)].join('.');
      map.set(old, next);
    }
    return [...map].sort((a, b) => b[0].length - a[0].length);
  }
  const edits = [];
  for (const call of calls) {
    const offset = wrapped.indexOf(call.call, call.start);
    const item = definitions.get(call);
    if (item) edits.push({ start: offset + item.start, end: offset + item.end, text: `"${replacements.get(call)}"` });
    if (call.name === 'group') continue;
    const names = mapping(call.group);
    const rename = value => {
      const entry = names.find(([name]) => value === name || value.startsWith(name + '.'));
      return entry ? entry[1] + value.slice(entry[0].length) : value;
    };
    for (const range of coordinateRanges(call)) {
      edits.push(...stringEdits(call.call, range.start, range.end, rename).map(edit =>
        ({ ...edit, start: offset + edit.start, end: offset + edit.end })));
    }
  }
  const renamed = edits.sort((a, b) => b.start - a.start).reduce((text, edit) =>
    text.slice(0, edit.start) + edit.text + text.slice(edit.end), wrapped);
  const shifted = offsetShapes(renamed, 0.5 * pasteIndex, -0.5 * pasteIndex);
  const body = locateCanvases(shifted)[0];
  const insertion = insertionFor(source, rendered.canvas, shifted.slice(body.bodyStart, body.bodyEnd).trim());
  return [{ start: insertion.offset, end: insertion.offset, text: insertion.text }];
}

module.exports = { copyShapes, pasteShapes };
