'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const cases = require('./placement-fixtures');
const { SPECS, callFromPoints } = require('../src/placement');
const { locateCanvases } = require('../src/scanner');
const { templateInsertions, SHAPES, PLACEMENT_SHAPES } = require('../src/templates');
const { renderEditable } = require('../src/advanced');

test('all palette shapes are constructed from explicit placement points and compile', async () => {
  assert.deepEqual(new Set(Object.keys(cases)), new Set(PLACEMENT_SHAPES.map(shape => shape.label)));
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

test('the full documented Shapes catalog includes regular polygons, through variants, and Boolean operations', () => {
  // Audited against https://cetz-package.github.io/docs/api/draw-functions/shapes/
  // and its circle, arc, bezier, and Boolean subpages.
  const documented = ['circle', 'circle-through', 'arc', 'arc-through', 'mark', 'line', 'polygon', 'n-star',
    'grid', 'content', 'rect', 'rect-around', 'bezier', 'bezier-through', 'hobby', 'catmull', 'merge-path', 'compound-path', 'boolean'];
  const { ALL_FUNCTIONS } = require('../src/templates');
  assert.equal(ALL_FUNCTIONS.length, documented.length);
  assert.deepEqual(new Set(ALL_FUNCTIONS.map(shape => shape.label)), new Set(documented));
});

test('new placement tools validate their geometric constraints', () => {
  for (const name of ['circle-through', 'arc-through']) {
    assert.throws(() => callFromPoints(name, [[0, 0], [1, 1], [2, 2]]), /non-collinear/);
    assert.throws(() => callFromPoints(name, [[0, 0], [1, 1], [0, 0]]), /non-collinear/);
  }
  assert.throws(() => callFromPoints('polygon', [[1, 1], [1, 1]]), /radius/);
  assert.throws(() => callFromPoints('boolean', [[0, 0], [2, 2], [1, 1], [1, 3]]), /Invalid CeTZ placement/);
  assert.match(callFromPoints('polygon', [[0, 0], [0, 2]]), /6, radius: 2, angle: 90deg/);
  assert.equal(callFromPoints('bezier-through', [[0, 0], [1, 0], [2, 0]]), 'bezier-through((0, 0), (1, 0), (2, 0))');
});
