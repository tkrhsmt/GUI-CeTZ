'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const cases = require('./placement-fixtures');
const { SPECS, callFromPoints } = require('../src/placement');
const { locateCanvases } = require('../src/scanner');
const { templateInsertions, SHAPES } = require('../src/templates');
const { renderEditable } = require('../src/advanced');

test('all palette shapes are constructed from explicit placement points and compile', async () => {
  assert.deepEqual(new Set(Object.keys(cases)), new Set(SHAPES.map(shape => shape.label).concat(['rect', 'circle', 'line', 'content'])));
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({\n  import cetz.draw: *\n})';
  const cells = new Map(Object.entries(cases).map(([name, points]) => [name, {
    cell: { parent: '1', style: `cetzTemplate=${name};cetzPoints=${encodeURIComponent(JSON.stringify(points))};` }
  }]));
  const [patch] = templateInsertions(source, locateCanvases(source)[0], cells);
  const updated = source.slice(0, patch.start) + patch.text + source.slice(patch.end);
  assert.match(updated, /line\(\(2, -1\), \(-1, 3\)\)/);
  assert.match(updated, /circle\(\(-2, 1\), radius: 2\)/);
  assert.match(updated, /arc\(\(1, 2\), start: 0deg, stop: 90deg, radius: 2, anchor: "origin"\)/);
  assert.match(updated, /bezier\(\(0, 0\), \(3, 1\), \(1, 3\), \(2, -1\)\)/);
  const rendered = await renderEditable(updated, locateCanvases(updated)[0], path.resolve('examples/basic.typ'));
  assert.equal(rendered.calls.length, Object.keys(cases).length);
  assert.ok(rendered.calls.every(call => call.geometry), 'each explicitly placed shape stays editable');
});

test('placement validates incomplete and malformed points rather than inserting a default shape', () => {
  for (const [name, spec] of Object.entries(SPECS)) {
    assert.throws(() => callFromPoints(name, []), /Invalid CeTZ placement/);
    assert.throws(() => callFromPoints(name, cases[name].map(() => [NaN, 0])), /Invalid CeTZ placement/);
    if (spec.count) assert.throws(() => callFromPoints(name, cases[name].concat([[0, 0]])), /Invalid CeTZ placement/);
  }
  assert.throws(() => callFromPoints('circle', [[1, 1], [1, 1]]), /radius/);
  assert.throws(() => callFromPoints('rect', [[0, 0], [0, 2]]), /width/);
  assert.throws(() => callFromPoints('arc', [[0, 0], [1, 0], [0, 0]]), /arc end/);
  const source = '#cetz.canvas({})';
  const cells = new Map([['bad', { cell: { parent: '1', style: 'cetzTemplate=line;cetzPoints=%invalid;' } }]]);
  assert.throws(() => templateInsertions(source, locateCanvases(source)[0], cells), /Invalid CeTZ placement/);
});
