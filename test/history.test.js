'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EditHistory, historyAction } = require('../src/history');

test('CeTZ edits undo and redo in source order', () => {
  const history = new EditHistory();
  history.record('a', 'ab');
  history.record('ab', 'abc');
  assert.equal(history.canStep('undo'), true);
  assert.equal(history.canStep('redo'), false);
  assert.equal(history.step('undo', 'abc'), 'ab');
  assert.equal(history.step('undo', 'ab'), 'a');
  assert.equal(history.step('redo', 'a'), 'ab');
  history.record('ab', 'abd');
  assert.equal(history.canStep('redo'), false);
  assert.throws(() => history.step('redo', 'abd'), /no CeTZ edit/);
  assert.throws(() => history.step('undo', 'outside change'), /history was reset/);
});

test('finds a new draw.io history action cell', () => {
  const original = new Map([['shape', { cell: { style: 'rounded=0;', parent: '1' } }]]);
  const current = new Map(original);
  current.set('action', { cell: { style: 'opacity=0;cetzAction=undo;', parent: '1' } });
  assert.deepEqual(historyAction(current, original), { id: 'action', action: 'undo', key: 'action' });
  const handled = new Set(['action']);
  assert.equal(historyAction(current, original, handled), null);
  current.set('next-action', { cell: { style: 'opacity=0;cetzAction=redo;', parent: '1' } });
  assert.deepEqual(historyAction(current, original, handled),
    { id: 'next-action', action: 'redo', key: 'next-action' });
  current.set('action', { cell: { style: 'cetzAction=undo;cetzActionToken=new-command;', parent: '1' } });
  assert.deepEqual(historyAction(current, original, handled),
    { id: 'action', action: 'undo', key: 'new-command' });
  assert.equal(historyAction(original, original), null);
});

test('live updates from one camera gesture share a GUI undo step without merging other edits', () => {
  const history = new EditHistory();
  history.record('a','b','orbit-1'); history.record('b','c','orbit-1');
  history.record('c','d'); history.record('d','e','orbit-2'); history.record('e','f','orbit-2');
  assert.equal(history.step('undo','f'),'d');
  assert.equal(history.step('undo','d'),'c');
  assert.equal(history.step('undo','c'),'a');
  assert.equal(history.step('redo','a'),'c');
});
