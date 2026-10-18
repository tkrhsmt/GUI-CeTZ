'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { parseCanvas } = require('../src/diagram');
const { renderEditable, patchesFromEditable } = require('../src/advanced');
const { readAllCells } = require('../src/drawio');
const { withSelectionMarker } = require('../src/selection');

test('source selection marks the editable diagram without changing Typst', async () => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *; rect((0, 0), (2, 1)) })';
  const rendered = await renderEditable(source, parseCanvas(source).canvas,
    path.join(__dirname, '../examples/basic.typ'));
  const selected = withSelectionMarker(rendered.xml, 0, 'one');
  assert.ok(readAllCells(selected).has('cetz-select-one'));
  assert.deepEqual(patchesFromEditable(source, rendered, selected, readAllCells), []);
  const moved = withSelectionMarker(selected, 0, 'two');
  assert.equal((moved.match(/cetz-select-/g) || []).length, 1);
  assert.ok(readAllCells(moved).has('cetz-select-two'));
});
