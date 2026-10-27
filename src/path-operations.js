'use strict';

const { skipTrivia, deletionRange } = require('./scanner');
const { argumentsOf } = require('./properties');

const OPERATION_NAMES = ['boolean', 'rect-around', 'merge-path', 'compound-path'];
const ACTIONS = new Set(['boolean-union', 'boolean-intersection', 'boolean-difference', 'boolean-xor',
  'make-rect-around', 'make-merge-path', 'make-compound-path']);
const PATH_KINDS = new Set(['rect', 'circle', 'polygon', 'n-star', 'circle-through', 'arc', 'arc-through',
  'line', 'bezier', 'bezier-through', 'hobby', 'catmull', 'grid', 'rect-around', 'merge-path', 'compound-path', 'boolean', 'group']);
function named(call, key) {
  return argumentsOf(call.call).args.find(arg => arg.named && arg.key === key);
}
function literalName(call) {
  const raw = named(call, 'name')?.value;
  try { const value = JSON.parse(raw); return typeof value === 'string' ? value : null; } catch { return null; }
}
function isClosedPath(call) {
  if (['rect', 'circle', 'polygon', 'n-star', 'circle-through', 'compound-path', 'boolean', 'rect-around'].includes(call.name)) return true;
  if (['line', 'hobby', 'catmull', 'merge-path'].includes(call.name)) return named(call, 'close')?.value === 'true';
  if (['arc', 'arc-through'].includes(call.name)) return ['"CLOSE"', '"PIE"'].includes(named(call, 'mode')?.value);
  return false;
}
function indentAt(source, offset) {
  return /^[ \t]*/.exec(source.slice(source.lastIndexOf('\n', offset - 1) + 1, offset))[0];
}
function formatBody(text, indent) {
  const lines = text.split('\n');
  const margins = lines.slice(1).filter(line => line.trim()).map(line => /^\s*/.exec(line)[0].length);
  const margin = margins.length ? Math.min(...margins) : 0;
  return lines.map((line, index) => indent + (index ? line.slice(Math.min(margin, /^\s*/.exec(line)[0].length)) : line)).join('\n');
}
function pathOperationPatches(source, rendered, action) {
  if (!ACTIONS.has(action.action)) throw new Error('Unknown path operation.');
  let calls = [...new Set(action.indices)].map(index => rendered.calls[index]);
  if (calls.some(call => !call)) throw new Error('A selected object no longer exists.');
  const selected = new Set(calls);
  calls = calls.filter(call => {
    for (let parent = call.group; parent; parent = parent.group) if (selected.has(parent)) return false;
    return true;
  }).sort((a, b) => a.start - b.start);
  const frame = action.action === 'make-rect-around';
  if (calls.length < (frame ? 1 : 2)) throw new Error(frame ? 'Select an object to surround.' : 'Select at least two independent objects.');
  if (calls.some(call => call.group !== calls[0].group)) throw new Error('Select objects in the same group.');
  if (!frame && calls.some(call => !PATH_KINDS.has(call.name))) throw new Error('Select path objects for this operation.');
  if (frame) return around(source, rendered, calls);
  if (action.action.startsWith('boolean-') && calls.some(call => !isClosedPath(call)))
    throw new Error('Boolean operations require closed paths. Close the selected paths in Properties first.');

  const siblings = rendered.calls.filter(call => call.group === calls[0].group &&
    call.start >= calls[0].start && call.end <= calls.at(-1).end).sort((a, b) => a.start - b.start);
  let cursor = calls[0].start;
  for (const sibling of siblings) {
    const gap = source.slice(cursor, sibling.start).replace(/;/g, '');
    if (skipTrivia(gap, 0) !== gap.length)
      throw new Error('A style, transformation or statement between these objects prevents combining them.');
    cursor = sibling.end;
  }
  // Do not silently retarget anchors belonging to a consumed input. The first
  // name is retained by the result; other names must not be used outside it.
  const resultName = literalName(calls[0]);
  let outside = '', at = rendered.canvas.bodyStart;
  for (const call of calls) { outside += source.slice(at, call.start); at = call.end; }
  outside += source.slice(at, rendered.canvas.bodyEnd);
  for (const call of action.action.startsWith('boolean-') ? calls.slice(1) : []) {
    const name = literalName(call);
    if (name && outside.match(/"(?:\\.|[^"\\])*"/g)?.some(raw => {
      try { const value = JSON.parse(raw); return value === name || value.startsWith(name + '.'); } catch { return false; }
    })) throw new Error(`Another object references "${name}". Detach that reference before combining these inputs.`);
  }
  const first = calls[0], style = [];
  for (const key of ['fill', 'stroke']) {
    const value = named(first, key)?.value;
    if (value != null) style.push(`${key}: ${value}`);
  }
  if (resultName) style.push(`name: ${JSON.stringify(resultName)}`);
  const bodies = calls.map(call => source.slice(call.start, call.end));
  let text;
  if (action.action.startsWith('boolean-')) {
    const op = action.action.slice('boolean-'.length);
    text = bodies[0];
    bodies.slice(1).forEach((body, i) => {
      const options = [`op: ${JSON.stringify(op)}`];
      if (i === bodies.length - 2) options.push(...style);
      text = `boolean({\n${formatBody(text, '  ')}\n}, {\n${formatBody(body, '  ')}\n}, ${options.join(', ')})`;
    });
  } else {
    const kind = action.action.slice('make-'.length);
    if (kind === 'compound-path') style.unshift('fill-rule: "even-odd"');
    text = `${kind}({\n${bodies.map(body => formatBody(body, '  ')).join('\n')}\n}${style.length ? ', ' + style.join(', ') : ''})`;
  }
  const indent = indentAt(source, calls.at(-1).start);
  text = text.split('\n').join('\n' + indent);
  const patches = calls.map((call, i) => i === calls.length - 1
    ? { start: call.start, end: call.end, text }
    : consumedRange(source, call));
  patches.selectStart = calls.at(-1).start + patches.filter(patch => patch.end <= calls.at(-1).start)
    .reduce((shift, patch) => shift + patch.text.length - (patch.end - patch.start), 0);
  return patches;
}
function consumedRange(source, call) {
  const range = deletionRange(source, call.start, call.end);
  if (range.start !== call.start || range.end !== call.end) return { ...range, text: '' };
  const next = skipTrivia(source, call.end);
  return source[next] === ';' ? { start: call.start, end: next + 1, text: source.slice(call.end, next) }
    : { ...range, text: '' };
}
function around(source, rendered, calls) {
  const names = new Set([...source.matchAll(/(?:\bname\s*:\s*|\banchor\s*\(\s*)"([^"\\]+)"/g)].map(match => match[1]));
  function unique(prefix) { let index = 1; while (names.has(`${prefix}-${index}`)) index++; const name = `${prefix}-${index}`; names.add(name); return name; }
  const patches = [], refs = [];
  for (const call of calls) {
    if (call.name === 'anchor') {
      const value = argumentsOf(call.call).args.find(arg => !arg.empty && !arg.named)?.value;
      if (!value) throw new Error('This anchor has no name.');
      refs.push(value); continue;
    }
    const argument = named(call, 'name');
    if (argument && argument.value !== 'none') { refs.push(argument.value); continue; }
    const name = unique('shape');
    refs.push(JSON.stringify(name));
    const inner = source.slice(call.start, call.end).indexOf(call.call);
    if (inner < 0) throw new Error('This object cannot be named safely.');
    const start = call.start + inner;
    if (argument) patches.push({ start: start + argument.valueStart, end: start + argument.valueEnd, text: JSON.stringify(name) });
    else {
      const parsed = argumentsOf(call.call), comma = call.call.slice(0, parsed.end).trimEnd().endsWith(',') ? '' : ',';
      patches.push({ start: start + parsed.end, end: start + parsed.end, text: `${comma} name: ${JSON.stringify(name)}` });
    }
  }
  const last = calls.at(-1), indent = indentAt(source, last.start), name = unique('frame');
  const suffix = /^[ \t]*;?[ \t]*(?:\/\/[^\n]*)?\r?\n/.exec(source.slice(last.end));
  const offset = last.end + (suffix ? suffix[0].length : 0);
  const prefix = suffix ? indent : `;\n${indent}`;
  patches.selectStart = offset + prefix.length + patches.reduce((shift, patch) => shift + patch.text.length - (patch.end - patch.start), 0);
  patches.push({ start: offset, end: offset,
    text: `${prefix}rect-around(${refs.join(', ')}, padding: 0.1, name: ${JSON.stringify(name)})${suffix ? '\n' : ''}` });
  return patches;
}
module.exports = { OPERATION_NAMES, ACTIONS, pathOperationPatches };
