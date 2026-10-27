'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { outputName, exportTypst } = require('../src/export');

test('exports the current Typst document as PDF and names multipage images', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gui-cetz-export-'));
  const source = path.join(directory, 'diagram.typ');
  const output = path.join(directory, 'diagram.pdf');
  fs.writeFileSync(source, '#set page(width: 5cm, height: 5cm)\nHello');
  const vscode = {
    Uri: { file: fsPath => ({ fsPath }) },
    window: {
      showQuickPick: async () => 'PDF',
      showSaveDialog: async () => ({ fsPath: output }),
      showInformationMessage: () => {},
    },
  };
  try {
    await exportTypst(vscode, { uri: { fsPath: source }, isDirty: false });
    assert.ok(fs.statSync(output).size > 100);
    assert.equal(outputName(source, 'svg'), 'diagram-{0p}.svg');
    assert.equal(outputName(source, 'png'), 'diagram-{0p}.png');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
