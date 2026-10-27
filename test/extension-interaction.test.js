'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

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

test('clipboard bridge handles rapid copy-paste, deletion and paste after the originals are gone', async t => {
  const docs = new Map(), errors = [], subscriptions = [];
  const disposable = { dispose() {} };
  const extensionPath = path.resolve(__dirname, '..');
  let provider, changed, clipboard = '';
  const uri = parts => ({ authority: '', ...parts, fsPath: parts.path,
    toString() { return this.scheme + ':' + this.path; } });
  function document(uri, text) {
    const doc = { uri, text, version: 1, getText() { return this.text; }, positionAt(offset) { return offset; } };
    docs.set(uri.toString(), doc);
    return doc;
  }
  const vscode = {
    Uri: { from: uri }, FileChangeType: { Created: 1, Changed: 2 },
    EventEmitter: class { constructor() { this.event = () => {}; } fire() {} dispose() {} },
    Range: class { constructor(start, end) { this.start = start; this.end = end; } },
    WorkspaceEdit: class {
      constructor() { this.edits = []; }
      replace(uri, range, text) { this.edits.push({ uri, range, text }); }
    },
    env: { clipboard: {
      async readText() { return clipboard; }, async writeText(text) { clipboard = text; }
    } },
    workspace: {
      registerFileSystemProvider(scheme, value) { provider = value; return disposable; },
      onDidChangeTextDocument(callback) { changed = callback; return disposable; },
      getConfiguration() { return { get() { return [{ file: path.join(extensionPath, 'src/cetz-drawio-plugin.js') }]; } }; },
      getWorkspaceFolder() {},
      async openTextDocument(uri) {
        return docs.get(uri.toString()) || document(uri, Buffer.from(await provider.readFile(uri)).toString());
      },
      async applyEdit(edit) {
        const groups = new Map();
        for (const item of edit.edits) {
          const key = item.uri.toString();
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(item);
        }
        for (const edits of groups.values()) {
          const doc = await this.openTextDocument(edits[0].uri);
          for (const item of edits.sort((a, b) => b.range.start - a.range.start))
            doc.text = doc.text.slice(0, item.range.start) + item.text + doc.text.slice(item.range.end);
          doc.version++;
          changed({ document: doc });
        }
        return true;
      }
    },
    languages: { registerCodeLensProvider() { return disposable; } },
    commands: { registerCommand() { return disposable; }, async executeCommand() {} },
    window: { showErrorMessage(message) { errors.push(message); } }
  };
  const originalLoad = Module._load;
  let extension;
  try {
    Module._load = function (name, parent, isMain) {
      return name === 'vscode' ? vscode : originalLoad.call(this, name, parent, isMain);
    };
    delete require.cache[require.resolve('../src/extension')];
    extension = require('../src/extension');
  } finally { Module._load = originalLoad; }
  extension.activate({ subscriptions, extensionPath });
  t.after(() => subscriptions.forEach(item => item.dispose()));
  const source = document(uri({ scheme: 'file', path: path.resolve('examples/clipboard-test.typ') }),
    '#import "@preview/cetz:0.5.2"\n#cetz.canvas({\n  import cetz.draw: *\n' +
    '  rect((0, 0), (2, 1), name: "a")\n  content("a.center", [Text])\n})');
  const gui = await vscode.workspace.openTextDocument(extension.diagramUri(source.uri, 0));
  let serial = 0;
  function action(name, targets = '') {
    return `<mxCell id="clipboard-${++serial}" style="cetzAction=${name};${targets ? `cetzTargets=${targets};` : ''}cetzActionToken=clipboard-${serial};" vertex="1" parent="1"><mxGeometry x="-1000" y="-1000" width="1" height="1" as="geometry"/></mxCell>`;
  }
  function save(xml) { gui.text = xml; gui.version++; changed({ document: gui }); }
  async function until(predicate) {
    const deadline = Date.now() + 5000;
    while (!predicate() && !errors.length && Date.now() < deadline)
      await new Promise(resolve => setTimeout(resolve, 20));
    assert.deepEqual(errors, []);
    assert.ok(predicate(), 'clipboard synchronization completes');
  }
  save(gui.text.replace('</root>', action('copy', '0,1') + action('paste') + '</root>'));
  await until(() => /cetzSelect=2,3;/.test(gui.text));
  assert.match(clipboard, /rect\(\(0, 0\), \(2, 1\), name: "a"\)/);
  assert.match(source.text, /content\("a-2.center", \[Text\]\)/);
  assert.match(source.text, /rect\(\(0\.5, -0\.5\), \(2\.5, 0\.5\), name: "a-2"\)/);
  save(gui.text.replace(/<mxCell id="cetz-edit-[01]"[\s\S]*?<\/mxCell>/g, ''));
  await until(() => !source.text.includes('name: "a"') && !gui.text.includes('cetzSelect=2,3;'));
  assert.doesNotMatch(source.text, /\n[ \t]*\n/);
  assert.match(source.text, /name: "a-2"/);
  const beforePaste = source.text;
  save(gui.text.replace('</root>', action('paste') + '</root>'));
  await until(() => /cetzSelect=2,3;/.test(gui.text));
  assert.match(source.text, /name: "a"/);
  assert.match(source.text, /content\("a.center", \[Text\]\)/);
  const afterPaste = source.text;
  save(gui.text.replace('</root>', action('undo') + '</root>'));
  await until(() => source.text === beforePaste && !gui.text.includes('cetzAction=undo;'));
  save(gui.text.replace('</root>', action('redo') + '</root>'));
  await until(() => source.text === afterPaste && !gui.text.includes('cetzAction=redo;'));
  save(gui.text.replace('</root>', action('paste') + action('paste') + '</root>'));
  await until(() => /cetzSelect=4,5,6,7;/.test(gui.text));
  assert.match(source.text, /name: "a-3"/);
  assert.match(source.text, /name: "a-4"/);
  assert.match(source.text, /rect\(\(1\.5, -1\.5\), \(3\.5, -0\.5\), name: "a-3"\)/);
  assert.match(source.text, /rect\(\(2, -2\), \(4, -1\), name: "a-4"\)/);
});
