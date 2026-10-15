'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EditHistory, historyAction } = require('../src/history');

test('CeTZ edits undo and redo in source order', () => {
  const history = new EditHistory();
  history.record('a', 'ab');
  history.record('ab', 'abc');
  assert.equal(history.step('undo', 'abc'), 'ab');
  assert.equal(history.step('undo', 'ab'), 'a');
  assert.equal(history.step('redo', 'a'), 'ab');
  history.record('ab', 'abd');
  assert.throws(() => history.step('redo', 'abd'), /no CeTZ edit/);
  assert.throws(() => history.step('undo', 'outside change'), /history was reset/);
});

test('finds a new draw.io history action cell', () => {
  const original = new Map([['shape', { cell: { style: 'rounded=0;', parent: '1' } }]]);
  const current = new Map(original);
  current.set('action', { cell: { style: 'opacity=0;cetzAction=undo;', parent: '1' } });
  assert.equal(historyAction(current, original), 'undo');
  assert.equal(historyAction(original, original), null);
});
