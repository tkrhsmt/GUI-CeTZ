'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

test('typing in Typst does not register cursor-driven virtual document edits', () => {
  const commands = new Map();
  const disposable = { dispose() {} };
  const vscode = {
    EventEmitter: class { constructor() { this.event = () => {}; } fire() {} dispose() {} },
    workspace: {
      registerFileSystemProvider() { return disposable; },
      onDidChangeTextDocument() { return disposable; }
    },
    languages: { registerCodeLensProvider() { return disposable; } },
    commands: { registerCommand(name, callback) { commands.set(name, callback); return disposable; } },
    window: {
      onDidChangeTextEditorSelection() {
        throw new Error('Ordinary Typst cursor movement must not edit the virtual diagram.');
      }
    }
  };
  const originalLoad = Module._load;
  let extension;
  try {
    Module._load = function (name, parent, isMain) {
      return name === 'vscode' ? vscode : originalLoad.call(this, name, parent, isMain);
    };
    extension = require('../src/extension');
  } finally { Module._load = originalLoad; }
  extension.activate({ subscriptions: [], extensionPath: '/tmp/gui-cetz-test' });
  assert.ok(commands.has('cetzEditor.selectInGui'));
});
