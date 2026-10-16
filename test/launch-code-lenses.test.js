'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { launchCodeLenses } = require('../src/launch-code-lenses');

const vscode = {
  Range: class { constructor(start, end) { Object.assign(this, { start, end }); } },
  CodeLens: class { constructor(range, command) { Object.assign(this, { range, command }); } }
};

test('offers a CodeLens above each real canvas and targets its own index', () => {
  const source = '"cetz.canvas({})"\n#cetz.canvas({})\n// cetz.canvas({})\n#cetz.canvas({})';
  const uri = { path: '/example.typ' };
  const document = {
    fileName: '/example.typ', uri, getText: () => source,
    positionAt(offset) { return { offset }; }
  };
  const lenses = launchCodeLenses(vscode, document);
  assert.equal(lenses.length, 2);
  for (const [index, lens] of lenses.entries()) {
    assert.equal(lens.range.start.offset, source.indexOf('#cetz.canvas', index ? source.indexOf('#cetz.canvas') + 1 : 0));
    assert.equal(lens.command.title, '▶ GUI CeTZ');
    assert.equal(lens.command.command, 'cetzEditor.open');
    assert.deepEqual(lens.command.arguments, [uri, index]);
  }
  assert.deepEqual(launchCodeLenses(vscode, { ...document, fileName: '/example.txt' }), []);
});
