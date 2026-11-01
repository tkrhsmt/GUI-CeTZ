'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { propertyModel, propertyPatches } = require('../src/properties');
const { locateEditableCalls, renderEditable } = require('../src/advanced');
const { locateCanvases } = require('../src/scanner');
const { sourceAction, sourceActionPatches } = require('../src/source-actions');
const { color, stroke, typstColor, COLORS } = require('../src/style');
const { callFromPoints } = require('../src/placement');
const fixtures = require('./placement-fixtures');
const prefix = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *\n';
const document = call => prefix + call + '\n})';
function setup(source) {
  const canvas = locateCanvases(source)[0];
  return { canvas, calls: locateEditableCalls(source, canvas) };
}
function edit(source, index, values) {
  const rendered = setup(source);
  const action = { action: 'properties', indices: [index],
    value: encodeURIComponent(JSON.stringify({ base: rendered.calls[index].call, values })) };
  return sourceActionPatches(source, rendered, action).sort((a, b) => b.start - a.start)
    .reduce((text, patch) => text.slice(0, patch.start) + patch.text + text.slice(patch.end), source);
}
const render = source => renderEditable(source, locateCanvases(source)[0], path.resolve('examples/advanced.typ'));

test('inspector exposes every palette shape, all existing arguments and shape-specific optional parameters', () => {
  for (const [name, points] of Object.entries(fixtures)) {
    const call = setup(document(callFromPoints(name, points))).calls[0];
    const model = propertyModel(call);
    assert.equal(model.kind, name);
    assert.equal(model.base, call.call);
    assert.ok(model.fields.length >= 3, name);
    assert.ok(model.fields.some(field => field.key === 'stroke'), name);
    assert.ok(model.fields.some(field => field.key === '$0'), name);
  }
  const model = propertyModel(setup(document('line((0, 1), (2, 3), close: false, mark: (end: ">"))')).calls[0]);
  assert.deepEqual(model.fields.find(field => field.label === 'Start').point, [0, 1]);
  assert.deepEqual(model.fields.find(field => field.label === 'End').point, [2, 3]);
  assert.equal(model.fields.find(field => field.key === 'close').value, 'false');
  assert.equal(model.fields.find(field => field.key === 'mark').value, '(end: ">")');
});

test('coordinates, close, named colors and additive strokes apply atomically without quantization', async () => {
  const source = document('line((0, 0), (2, 1), stroke: 1pt + black)');
  const next = edit(source, 0, { '$0': '(0.01234567, -1.125)', '$1': '(3, 2)', close: 'true', stroke: '2pt + red', fill: 'green' });
  assert.match(next, /line\(\(0.01234567, -1.125\), \(3, 2\), stroke: 2pt \+ red, close: true, fill: green\)/);
  const rendered = await render(next);
  assert.ok(rendered.xml.includes('cetzProperties='));
});

test('all placed shapes can change appearance using Typst color names and remain renderable', async () => {
  for (const [name, points] of Object.entries(fixtures)) {
    const next = edit(document(callFromPoints(name, points)), 0, { stroke: '1pt + navy', fill: 'none' });
    const rendered = await render(next);
    assert.ok(rendered.xml.includes('cetzStrokeColor=#001f3f'), name);
  }
});

test('property changes preserve references, comments, nested stroke dictionaries and untouched statements', async () => {
  const source = document('circle((0, 0), name: "origin")\nline(/* start */ "origin.east", (2, 1), stroke: (paint: red, thickness: 1pt, cap: "round", join: "bevel", dash: "dotted")) // keep');
  const next = edit(source, 1, { close: 'true', '$1': '(2.125, 3)' });
  assert.ok(next.includes('line(/* start */ "origin.east", (2.125, 3), stroke: (paint: red, thickness: 1pt, cap: "round", join: "bevel", dash: "dotted"), close: true) // keep'));
  assert.ok(next.includes('circle((0, 0), name: "origin")'));
  await render(next);
});

test('clearing optional arguments, including adjacent and final arguments, yields a valid call', async () => {
  const source = document('line((0, 0), (1, 1), close: false, stroke: red, fill: none,)');
  const next = edit(source, 0, { close: '', stroke: '', fill: '' });
  assert.match(next, /line\(\(0, 0\), \(1, 1\)\)/);
  await render(next);
});

test('trailing content appears in the inspector and preserves bracket syntax through property edits', async () => {
  const source = document('content((0, 0), padding: 1pt)[Hello]');
  const model = propertyModel(setup(source).calls[0]);
  assert.equal(model.fields.find(field => field.key === '$1').text, 'Hello');
  const next = edit(source, 0, { '$0': '(1, 2)', '$1': '[World (]', padding: '', angle: '15deg' });
  assert.ok(next.includes('content((1, 2), angle: 15deg)[World (]'));
  await render(next);
  const expression = edit(source, 0, { '$1': 'text(red)[World]' });
  assert.ok(expression.includes('content((0, 0), padding: 1pt, text(red)[World])'));
  await render(expression);
});

test('rotated shape properties retain their rotation wrapper', async () => {
  const source = document('scope({ rotate(30deg, origin: (1, 1)); rect((0, 0), (2, 2), fill: red) })');
  const next = edit(source, 0, { radius: '0.2', fill: 'aqua' });
  assert.match(next, /scope\(\{ rotate\(30deg, origin: \(1, 1\)\); rect\(/);
  assert.match(next, /fill: aqua, radius: 0.2/);
  await render(next);
});

test('property actions survive punctuation in contents and reject stale or malformed values', () => {
  const source = document('content((0, 0), [Hello])');
  const rendered = setup(source), value = encodeURIComponent(JSON.stringify({ base: rendered.calls[0].call, values: { '$1': '[Hello! (CeTZ) *world*]' } }))
    .replace(/[!'()*]/g, char => '%' + char.charCodeAt(0).toString(16));
  const cells = new Map([['action', { cell: { parent: '1', style: `cetzAction=properties;cetzTargets=0;cetzValue=${value};cetzActionToken=test;` } }]]);
  const action = sourceAction(cells, new Map());
  assert.equal(action.value, value);
  assert.ok(propertyPatches(rendered, action)[0].text.includes('[Hello! (CeTZ) *world*]'));
  assert.throws(() => propertyPatches(rendered, { ...action, value: encodeURIComponent(JSON.stringify({ base: 'old', values: {} })) }), /changed/);
  for (const invalid of ['(1, 2', '1, 2', '"unclosed', ')\nline((0, 0), (1, 1))'])
    assert.throws(() => edit(document('circle((0, 0))'), 0, { radius: invalid }));
  assert.throws(() => edit(document('line((0, 0), (1, 1))'), 0, { '$0': '' }));
});

test('Typst named palette and additive strokes in either order use actual Typst colors', () => {
  assert.equal(color('red'), '#ff4136'); assert.equal(color('green'), '#2ecc40');
  for (const [name, hex] of Object.entries(COLORS)) {
    assert.equal(color(name), hex); assert.equal(typstColor(name), name);
    if (name !== 'none') {
      assert.deepEqual(stroke('2pt + ' + name), { color: hex, width: 2, dash: 'solid' });
      assert.deepEqual(stroke(name + ' + 2pt'), { color: hex, width: 2, dash: 'solid' });
    }
  }
});

test('editing literal coordinates and named arguments retains leading and trailing comments', () => {
  const source = document('line(/* start */ (0, 0) /* keep A */, (2, 1), close: /* why */ false /* keep B */)');
  const model = propertyModel(setup(source).calls[0]);
  assert.deepEqual(model.fields[0].point, [0, 0]);
  assert.equal(model.fields.find(field => field.key === 'close').value, 'false');
  const next = edit(source, 0, { '$0': '(1, 2)', close: 'true' });
  assert.ok(next.includes('line(/* start */ (1, 2) /* keep A */, (2, 1), close: /* why */ true /* keep B */)'));
});

test('appearance applied with a pending drag retains the moved coordinates', async () => {
  const source = document('line((0, 0), (2, 1), stroke: black)\ncircle((4, 0))');
  const rendered = setup(source), call = rendered.calls[0];
  const pending = [{ start: call.start, end: call.end, text: 'line((1, 2), (3, 3), stroke: black)' }];
  const action = { action: 'properties', indices: [0],
    value: encodeURIComponent(JSON.stringify({ base: call.call, values: { stroke: '2pt + red' } })) };
  const next = sourceActionPatches(source, rendered, action, pending).sort((a, b) => b.start - a.start)
    .reduce((text, patch) => text.slice(0, patch.start) + patch.text + text.slice(patch.end), source);
  assert.ok(next.includes('line((1, 2), (3, 3), stroke: 2pt + red)'));
  assert.ok(next.includes('circle((4, 0))'));
  await render(next);
});

test('new shape properties expose through points, polygon sides, and all Boolean operations', async () => {
  let source = document('polygon((0, 0), 6, radius: 1)');
  source = edit(source, 0, { '$1': '7', angle: '30deg', radius: '1.5' });
  assert.match(source, /polygon\(\(0, 0\), 7, radius: 1.5, angle: 30deg\)/);
  await render(source);
  for (const name of ['circle-through', 'arc-through', 'bezier-through']) {
    const original = document(`${name}((0, 0), (1, 1), (2, 0))`);
    const model = propertyModel(setup(original).calls[0]);
    assert.equal(model.fields.filter(field => field.point).length, 3);
    await render(edit(original, 0, { '$1': '(1.25, 1.5)', stroke: '2pt + navy' }));
  }
  for (const op of ['union', 'intersection', 'difference', 'xor']) {
    const original = document('boolean({ rect((0, 0), (2, 2)) }, { rect((1, 1), (3, 3)) }, op: "difference")');
    const model = propertyModel(setup(original).calls[0]);
    assert.deepEqual(model.fields.find(field => field.key === 'op').choices, ['"union"', '"intersection"', '"difference"', '"xor"']);
    const changed = edit(original, 0, { op: JSON.stringify(op), fill: 'aqua' });
    const rendered = await render(changed);
    assert.ok(rendered.calls[0].geometry, op);
  }
  const empty = await render(document('boolean({ rect((0, 0), (1, 1)) }, { rect((2, 2), (3, 3)) }, op: "intersection")'));
  assert.ok(empty.calls[0].geometry, 'an empty Boolean result can still be selected and edited in Outline');
});
