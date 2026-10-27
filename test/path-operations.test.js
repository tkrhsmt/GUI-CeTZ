'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { locateCanvases } = require('../src/scanner');
const { locateEditableCalls, renderEditable } = require('../src/advanced');
const { sourceActionPatches } = require('../src/source-actions');
const { readAllCells } = require('../src/drawio');
const { PLACEMENT_SHAPES, templateInsertions } = require('../src/templates');
const { SPECS, callFromPoints } = require('../src/placement');
const { OPERATION_NAMES } = require('../src/path-operations');
const prefix = '#import "@preview/cetz:0.5.3"\n#cetz.canvas({ import cetz.draw: *\n';
const doc = body => prefix + body + '\n})';
const setup = source => { const canvas = locateCanvases(source)[0]; return { canvas, calls: locateEditableCalls(source, canvas) }; };
const apply = (source, patches) => [...patches].sort((a, b) => b.start - a.start).reduce((text, patch) => text.slice(0, patch.start) + patch.text + text.slice(patch.end), source);
const render = source => renderEditable(source, locateCanvases(source)[0], path.resolve('examples/advanced.typ'));

test('relationship functions cannot be inserted as drawing-tool templates', () => {
  for (const name of OPERATION_NAMES) {
    assert.equal(PLACEMENT_SHAPES.some(shape => shape.label === name), false);
    assert.equal(SPECS[name], undefined);
    assert.throws(() => callFromPoints(name, [[0, 0], [1, 1], [2, 2], [3, 3]]));
    assert.throws(() => templateInsertions(doc(''), locateCanvases(doc(''))[0], new Map([
      ['new', { cell: { parent: '1', style: `cetzTemplate=${name};` } }]
    ])), /selection|Select existing/);
  }
  assert.equal(PLACEMENT_SHAPES.length, 15);
});

test('Boolean applies each operation to arbitrary selected shapes in source order', async () => {
  const source = doc('circle((0, 0), radius: 1.5, fill: red, name: "base")\npolygon((0.5, 0), 5, radius: 1.5)\nn-star((0, 0.5), 5, radius: 1.5)');
  for (const op of ['union', 'intersection', 'difference', 'xor']) {
    const patches = sourceActionPatches(source, setup(source), { action: 'boolean-' + op, indices: [2, 0, 1] });
    const next = apply(source, patches), result = await render(next);
    assert.equal(result.calls.length, 1, op);
    assert.equal(result.calls[0].name, 'boolean');
    assert.equal(result.calls[0].start, patches.selectStart);
    assert.ok(result.calls[0].geometry, op);
    assert.ok(next.indexOf('circle(') < next.indexOf('polygon('));
    assert.ok(next.indexOf('polygon(') < next.indexOf('n-star('));
    assert.equal((next.match(new RegExp('op: "' + op + '"', 'g')) || []).length, 2);
    assert.match(next, /fill: red, name: "base"\)/);
    assert.doesNotMatch(next, /rect\(/, 'Boolean inputs are not hard-coded rectangles');
  }
});

test('merge-path and compound-path wrap selected source calls and preserve operand geometry', async () => {
  for (const [action, kind, body] of [
    ['make-merge-path', 'merge-path', 'line((0, 0), (1, 1), stroke: 2pt + red)\nbezier((1, 1), (3, 0), (1.5, 2))'],
    ['make-compound-path', 'compound-path', 'polygon((0, 0), 6, radius: 2, fill: red)\ncircle((0, 0), radius: 0.5)']
  ]) {
    const source = doc(body), patches = sourceActionPatches(source, setup(source), { action, indices: [0, 1] });
    const next = apply(source, patches), result = await render(next);
    assert.equal(result.calls.length, 1); assert.equal(result.calls[0].name, kind);
    assert.ok(result.calls[0].geometry);
    assert.equal(result.calls[0].start, patches.selectStart);
    if (kind === 'compound-path') assert.match(next, /fill-rule: "even-odd", fill: red/);
    else assert.match(next, /stroke: 2pt \+ red\)/);
  }
});

test('rect-around creates named references and follows actual source objects, including text', async () => {
  const source = doc('circle((0, 0), radius: 1)\ncontent((3, 0), [Hello], name: "caption")\npolygon((5, 0), 5, radius: 1)');
  const patches = sourceActionPatches(source, setup(source), { action: 'make-rect-around', indices: [0, 1, 2] });
  const next = apply(source, patches), result = await render(next);
  assert.equal(result.calls.length, 4);
  assert.match(next, /circle\(\(0, 0\), radius: 1, name: "shape-1"\)/);
  assert.match(next, /rect-around\("shape-1", "caption", "shape-2", padding: 0.1, name: "frame-1"\)/);
  assert.equal(result.calls[3].start, patches.selectStart);
  assert.ok(result.calls[3].geometry);
  const frame = [...readAllCells(result.xml).values()].find(entry => /cetzKind=rect-around;/.test(entry.cell.style || ''));
  assert.match(frame.cell.style, /movable=0;resizable=0/);
  const moved = await render(next.replace('polygon((5, 0)', 'polygon((8, 0)'));
  assert.ok(moved.calls[3].geometry.width > result.calls[3].geometry.width);
});

test('operations validate selection, scope, closed paths, dependencies, and stateful statements before changing source', () => {
  const source = doc('circle((0, 0), name: "a")\ncircle((2, 0), name: "b")\nline("b.east", (4, 0))');
  assert.throws(() => sourceActionPatches(source, setup(source), { action: 'boolean-union', indices: [0] }), /at least two/);
  assert.throws(() => sourceActionPatches(source, setup(source), { action: 'boolean-union', indices: [0, 2] }), /closed paths/);
  assert.throws(() => sourceActionPatches(source, setup(source), { action: 'boolean-union', indices: [0, 1] }), /references "b"/);
  const stateful = doc('circle((0, 0))\ntranslate(x: 2)\ncircle((2, 0))');
  assert.throws(() => sourceActionPatches(stateful, setup(stateful), { action: 'make-compound-path', indices: [0, 1] }), /statement/);
  const groups = doc('group({ circle((0, 0)); circle((1, 0)) })\ncircle((4, 0))');
  const parsed = setup(groups);
  const child = parsed.calls.findIndex(call => call.name === 'circle' && call.group);
  const outside = parsed.calls.findIndex(call => call.name === 'circle' && !call.group);
  assert.throws(() => sourceActionPatches(groups, parsed, { action: 'make-rect-around', indices: [child, outside] }), /same group/);
});

test('a pending drag is applied before a selection operation and the resulting selection offset is correct', async () => {
  const source = doc('circle((0, 0), radius: 1)\npolygon((1, 0), 5, radius: 1)');
  const rendered = setup(source), call = rendered.calls[0];
  const pending = [{ start: call.start, end: call.end, text: 'circle((0.25, 0.5), radius: 1)' }];
  const patches = sourceActionPatches(source, rendered, { action: 'boolean-union', indices: [0, 1] }, pending);
  const next = apply(source, patches), result = await render(next);
  assert.ok(next.includes('circle((0.25, 0.5), radius: 1)'));
  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0].start, patches.selectStart);
});

test('operations work inside a group and preserve inline comments and anchor references where the API exports them', async () => {
  for (const action of ['boolean-union', 'make-merge-path', 'make-compound-path']) {
    const source = doc('group({ circle((0, 0)); /* keep */ polygon((0.5, 0), 5) }, name: "g")');
    const before = setup(source), selected = before.calls.flatMap((call, index) => call.group ? [index] : []);
    const next = apply(source, sourceActionPatches(source, before, { action, indices: selected }));
    assert.ok(next.includes('/* keep */'));
    await render(next);
  }
  for (const action of ['make-merge-path', 'make-compound-path']) {
    const source = doc('circle((0, 0), name: "a")\ncircle((2, 0), name: "b")\ncontent("b.center", [B])');
    const next = apply(source, sourceActionPatches(source, setup(source), { action, indices: [0, 1] }));
    await render(next);
    assert.ok(next.includes('content("b.center", [B])'));
  }
  const source = doc('circle((0, 0)) // keep original note\ncircle((3, 0)) // keep last note');
  const patches = sourceActionPatches(source, setup(source), { action: 'make-rect-around', indices: [0, 1] });
  const next = apply(source, patches), result = await render(next);
  assert.match(next, /circle\(\(3, 0\), name: "shape-2"\) \/\/ keep last note\nrect-around/);
  assert.equal(result.calls[2].start, patches.selectStart);
});


test('rect-around retains computed object names and keeps their frame tied to the object bounds', async () => {
  const source = doc('let object-name = "named-circle";\ncircle((0, 0), radius: 1, name: object-name)\ncircle((3, 0), radius: 1)');
  const patches = sourceActionPatches(source, setup(source), { action: 'make-rect-around', indices: [0, 1] });
  const next = apply(source, patches), result = await render(next);
  assert.match(next, /rect-around\(object-name, "shape-1"/);
  const frame = [...readAllCells(result.xml).values()].find(entry => /cetzKind=rect-around;/.test(entry.cell.style || ''));
  assert.match(frame.cell.style, /movable=0;resizable=0/);
  assert.equal(result.calls[2].start, patches.selectStart);
});
