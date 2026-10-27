'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { snapStep, readSnapStep, snapCoordinate } = require('../src/snapping');
const { callFromPoints } = require('../src/placement');

test('zoom progressively refines snapping and keeps short, exact dyadic coordinates', () => {
  for (const [scale, step] of [[0.5, 0.25], [1, 0.25], [1.99, 0.25], [2, 0.125], [4, 0.0625], [8, 0.03125], [16, 0.015625]]) {
    assert.equal(snapStep(scale), step);
    assert.equal(readSnapStep(String(step)), step);
    assert.equal(snapCoordinate(step * 1.2, step), step);
    assert.equal(callFromPoints('line', [[step, -step], [1, 2]]), `line((${step}, ${-step}), (1, 2))`);
  }
  for (const invalid of [0, -1, Infinity, 'not-a-step', 1, 0.1, 0.00000001])
    assert.throws(() => readSnapStep(invalid), /snapping precision/);
});
