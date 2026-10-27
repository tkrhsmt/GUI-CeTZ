'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { parseCanvas } = require('../src/diagram');
const { renderEditable, patchesFromEditable } = require('../src/advanced');
const { readAllCells } = require('../src/drawio');
const { withSelectionMarker, selectSourceCalls } = require('../src/selection');

test('GUI selection selects complete source calls while preserving GUI focus', async () => {
  const source = { uri: { toString: () => 'file:///drawing.typ' }, positionAt: offset => offset };
  class Selection {
    constructor(start, end) { this.start = start; this.end = end; }
  }
  let revealed, opened;
  const editor = { document: source, revealRange(range) { revealed = range; } };
  const vscode = {
    Selection, Range: Selection, ViewColumn: { One: 1 },
    window: {
      visibleTextEditors: [editor],
      async showTextDocument(document, options) { opened = { document, options }; return editor; }
    }
  };
  const calls = [{ start: 10, end: 40 }, { start: 50, end: 90 }];
  await selectSourceCalls(vscode, source, calls, [1, 0]);
  assert.deepEqual(editor.selections, [new Selection(50, 90), new Selection(10, 40)]);
  assert.deepEqual(revealed, new Selection(50, 90));
  assert.equal(opened, undefined, 'reuse the visible Typst editor');
  vscode.window.visibleTextEditors = [];
  await selectSourceCalls(vscode, source, calls, [0]);
  assert.deepEqual(opened, { document: source, options: { viewColumn: 1, preserveFocus: true } });
  opened = undefined;
  await selectSourceCalls(vscode, source, calls, [2]);
  assert.equal(opened, undefined, 'ignore shapes that no longer exist');
});

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
