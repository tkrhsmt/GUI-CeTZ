'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { launchHints } = require('../src/launch-hints');

const vscode = {
  InlayHintLabelPart: class { constructor(value) { this.value = value; } },
  InlayHint: class { constructor(position, label, kind) { Object.assign(this, { position, label, kind }); } },
  InlayHintKind: { Type: 1 }
};

test('offers a clickable launch hint for each real canvas and targets its own index', () => {
  const source = '"cetz.canvas({})"\n#cetz.canvas({})\n// cetz.canvas({})\n#cetz.canvas({})';
  const uri = { path: '/example.typ' };
  const document = {
    fileName: '/example.typ', uri, getText: () => source,
    positionAt(offset) { return { offset }; }
  };
  const range = { contains: () => true };
  const hints = launchHints(vscode, document, range);
  assert.equal(hints.length, 2);
  for (const [index, hint] of hints.entries()) {
    assert.equal(hint.position.offset, source.indexOf('#cetz.canvas', index ? source.indexOf('#cetz.canvas') + 1 : 0));
    assert.equal(hint.label[0].value, '▶ GUI CeTZ');
    assert.equal(hint.label[0].command.command, 'cetzEditor.open');
    assert.deepEqual(hint.label[0].command.arguments, [uri, index]);
  }
  assert.deepEqual(launchHints(vscode, { ...document, fileName: '/example.txt' }, range), []);
  assert.deepEqual(launchHints(vscode, document, { contains: () => false }), []);
});
