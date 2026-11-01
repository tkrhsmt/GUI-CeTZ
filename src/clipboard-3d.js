'use strict';

const { locateCanvases, skipTrivia } = require('./scanner');
const { argumentsOf } = require('./properties');
const { locate3DCalls } = require('./three-dimensional');
const { PLANE_NAMES, planesFor, planeCode } = require('./plane-editor');
const { insertionFor } = require('./templates');
const { coordinate } = require('./snapping');
const { renameCopiedShapes, spatialCoordinateRanges } = require('./clipboard');

const HEADER = '// GUI-CeTZ 3D shapes v1\n';
const PREFIX = '#cetz.canvas({\n';
const wrap = code => PREFIX + code + '\n})';
const apply = (source, edits) => edits.sort((a, b) => b.start - a.start)
  .reduce((text, edit) => text.slice(0, edit.start) + edit.text + text.slice(edit.end), source);

// Match containers by their arguments and sibling order, independently of
// changing body text and source offsets after paste, deletion and undo.
function contextKey(call) {
  const args = argumentsOf(call.call).args.filter(arg => !arg.empty &&
    call.start + arg.valueStart + 1 !== call.bodyStart).map(arg => [arg.named ? arg.key : null, arg.value]);
  const marker = call.name === 'scope' && /^\s*\/\/ GUI-CeTZ plane: "(gui-plane-\d+)"/.exec(call.call.slice(call.bodyStart - call.start))?.[1];
  return JSON.stringify([call.name, args, marker || null]);
}
function contextPath(call, calls) {
  const path = [];
  for (let parent = call.group; parent; parent = parent.group) {
    const key = contextKey(parent);
    const siblings = calls.filter(other => other.container && other.group === parent.group && contextKey(other) === key);
    path.unshift({ key, ordinal: siblings.indexOf(parent) });
  }
  return path;
}
function resolveContext(path, calls) {
  let parent = null;
  for (const part of path) {
    const siblings = calls.filter(call => call.container && call.group === parent && contextKey(call) === part.key);
    parent = siblings[part.ordinal];
    if (!parent) throw new Error('The copied 3D view or drawing plane no longer exists. Select a destination plane or view before pasting.');
  }
  return parent;
}

function copy3DShapes(source, rendered, indices) {
  const calls = rendered.calls, planes = rendered.workspace.planes;
  const selected = new Set(indices.map(index => {
    const plane = planes.find(plane => plane.index === index || plane.wrapperIndex === index);
    return calls[plane ? plane.wrapperIndex : index];
  }));
  if (!selected.size || selected.has(undefined)) throw new Error('Select a 3D plane, line or content to copy.');
  const roots = [...selected].filter(call => {
    for (let parent = call.group; parent; parent = parent.group) if (selected.has(parent)) return false;
    return true;
  }).sort((a, b) => a.start - b.start);
  const items = roots.map(call => {
    const plane = planes.find(plane => plane.wrapperStart === call.start);
    if (!plane && !['line', 'content'].includes(call.name)) throw new Error('Select a 3D plane, line or content to copy.');
    return { code: source.slice(call.start, call.end), kind: plane ? 'plane' : call.name, context: contextPath(call, calls) };
  });
  return HEADER + JSON.stringify({ items });
}

function shiftedCode(code, kind, delta, source, copiedNames) {
  if (kind === 'plane') {
    // Inspect in a temporary projection so managed plane wrappers are detected
    // exactly as in the real drawing. Only change their translation values.
    const prefix = PREFIX + 'cetz.draw.ortho({\n', synthetic = prefix + code + '\n})\n})';
    const calls = locate3DCalls(synthetic, locateCanvases(synthetic)[0]);
    const plane = planesFor(synthetic, calls).find(plane => plane.wrapperStart === prefix.length);
    if (!plane) throw new Error('The clipboard contains no complete 3D drawing plane.');
    if (plane.managed && plane.position) {
      const range = plane.transformRanges[0], text = synthetic.slice(range.start, range.end);
      return apply(code, argumentsOf(text).args.filter(arg => ['x', 'y'].includes(arg.key)).map(arg => ({
        start: range.start - prefix.length + arg.valueStart, end: range.start - prefix.length + arg.valueEnd,
        text: String(coordinate(Number(arg.value) + (arg.key === 'x' ? delta : -delta)))
      })));
    }
    // Promote ordinary on-xy/on-xz/on-zy planes to a managed wrapper. Keep
    // their body intact, including imports, local definitions and comments.
    if (PLANE_NAMES.has(calls.find(call => call.start === prefix.length)?.name) && plane.position) {
      let id = 1;
      while ((source + code).includes(`"gui-plane-${id}"`)) id++;
      return planeCode(source, `gui-plane-${id}`, { kind: plane.kind,
        position: plane.position.map((value, i) => value + (i === 0 ? delta : i === 1 ? -delta : 0)), angles: plane.angles },
      synthetic.slice(plane.bodyStart, plane.bodyEnd));
    }
    // Computed offsets stay expressions, in their original coordinate system.
    return `cetz.draw.scope({\ncetz.draw.translate(x: ${delta}, y: ${-delta}, z: 0)\n${code}\n})`;
  }
  const wrapped = wrap(code), call = locate3DCalls(wrapped, locateCanvases(wrapped)[0]).find(call => !call.group);
  const edits = [];
  for (const [index, range] of spatialCoordinateRanges(call).entries()) {
    const raw = call.call.slice(range.start, range.end), value = raw.trim();
    if ([...value.matchAll(/"([^"\\]+)"/g)].some(match => copiedNames.some(name => match[1] === name || match[1].startsWith(name + '.')))) continue;
    if (index > 0 && (/^\(\s*\)$/.test(value) || /^\(\s*rel\s*:/.test(value) && !/\bto\s*:/.test(value))) continue;
    const point = /^\(\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?:\s*,\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)))?\s*,?\s*\)$/.exec(value);
    const text = point ? '(' + [coordinate(+point[1] + delta), coordinate(+point[2] - delta),
      ...(point[3] === undefined ? [] : [Number(point[3])])].join(', ') + ')' :
      `(rel: (${coordinate(delta)}, ${coordinate(-delta)}, 0), to: ${value})`;
    edits.push({ start: range.start, end: range.end,
      text: raw.match(/^\s*/)[0] + text + raw.match(/\s*$/)[0] });
  }
  return apply(code, edits);
}

function paste3DShapes(source, rendered, clipboard, pasteIndex = 1, targets = []) {
  clipboard = clipboard.replace(/\r\n/g, '\n');
  if (!clipboard.startsWith(HEADER)) throw new Error('Copy 3D CeTZ planes, lines or content before pasting into 3D drawing.');
  let items;
  try { ({ items } = JSON.parse(clipboard.slice(HEADER.length))); } catch {}
  if (!Array.isArray(items) || !items.length || items.some(item => !item || typeof item.code !== 'string' ||
    !['plane', 'line', 'content'].includes(item.kind) || !Array.isArray(item.context) ||
    item.context.some(part => typeof part?.key !== 'string' || !Number.isInteger(part.ordinal) || part.ordinal < 0)))
    throw new Error('Invalid 3D CeTZ clipboard data.');
  const canvas = locateCanvases(source).find(canvas => canvas.start === rendered.canvas.start);
  if (!canvas) throw new Error('The destination CeTZ canvas no longer exists.');
  const destinationCalls = locate3DCalls(source, canvas);
  const wrapped = wrap(items.map(item => item.code).join('\n'));
  const temporaryCanvas = locateCanvases(wrapped)[0], calls = temporaryCanvas && locate3DCalls(wrapped, temporaryCanvas);
  const roots = calls?.filter(call => !call.group).sort((a, b) => a.start - b.start);
  let cursor = temporaryCanvas?.bodyStart;
  if (!roots || roots.length !== items.length || temporaryCanvas.end !== wrapped.length) throw new Error('Invalid 3D CeTZ clipboard code.');
  for (const [i, call] of roots.entries()) {
    if (skipTrivia(wrapped, cursor) !== call.start || call.call !== items[i].code ||
      (items[i].kind !== 'plane' && call.name !== items[i].kind)) throw new Error('Invalid 3D CeTZ clipboard code.');
    cursor = call.end;
  }
  if (skipTrivia(wrapped, cursor) !== temporaryCanvas.bodyEnd) throw new Error('Invalid 3D CeTZ clipboard code.');
  const renamed = renameCopiedShapes(source, rendered, wrapped, calls, true);
  const renamedCalls = locate3DCalls(renamed, locateCanvases(renamed)[0]);
  const renamedRoots = renamedCalls.filter(call => !call.group).sort((a, b) => a.start - b.start);
  const copiedNames = renamedCalls.flatMap(call => {
    const value = argumentsOf(call.call).args.find(arg => arg.key === (call.name === 'anchor' ? '$0' : 'name'))?.value;
    let name;
    try { name = JSON.parse(value); } catch { return []; }
    if (typeof name !== 'string') return [];
    const names = [name];
    for (let parent = call.group; parent; parent = parent.group) if (parent.name === 'group') {
      try { names.unshift(JSON.parse(argumentsOf(parent.call).args.find(arg => arg.key === 'name')?.value)); } catch { return [name]; }
    }
    return [name, names.join('.')];
  });
  const destinations = targets.map(index => rendered.calls[index]).filter(Boolean);
  const grouped = new Map();
  let allocatedSource = source + renamed;
  for (const [i, call] of renamedRoots.entries()) {
    const item = items[i];
    let target = destinations.length === 1 ? destinations[0] : null;
    if (target && item.kind === 'plane') {
      while (target && !['ortho', 'perspective'].includes(target.name)) target = target.group;
    } else if (target) {
      const plane = rendered.workspace?.planes.find(plane => plane.wrapperIndex === rendered.calls.indexOf(target));
      target = plane ? rendered.calls[plane.index] : target.container ? target : target.group;
    }
    if (target) target = destinationCalls.find(call => call.start === target.start);
    else target = resolveContext(item.context, destinationCalls);
    const text = shiftedCode(call.call, item.kind, 0.5 * pasteIndex, allocatedSource, copiedNames);
    allocatedSource += text;
    const at = target?.bodyEnd ?? canvas.bodyEnd;
    if (!grouped.has(at)) grouped.set(at, []);
    grouped.get(at).push(text);
  }
  const patches = [...grouped].map(([at, code]) => {
    const insertion = insertionFor(source, { bodyStart: destinationCalls.find(call => call.bodyEnd === at)?.bodyStart ?? canvas.bodyStart, bodyEnd: at }, code.join('\n'));
    return { start: at, end: at, text: insertion.text };
  });
  let shift = 0;
  patches.selectStarts = [...patches].sort((a, b) => a.start - b.start).flatMap(patch => {
    const code = wrap(patch.text), roots = locate3DCalls(code, locateCanvases(code)[0]).filter(call => !call.group);
    const starts = roots.map(call => patch.start + shift + call.start - PREFIX.length);
    shift += patch.text.length;
    return starts;
  });
  return patches;
}

module.exports = { copy3DShapes, paste3DShapes };
