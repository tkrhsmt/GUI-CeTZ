'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { readAllCells } = require('../src/drawio');

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

async function extensionFixture(t, initialText) {
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
  const source = document(uri({ scheme: 'file', path: path.resolve('examples/clipboard-test.typ') }), initialText ||
    '#import "@preview/cetz:0.5.2"\n#cetz.canvas({\n  import cetz.draw: *\n' +
    '  rect((0, 0), (2, 1), name: "a")\n  content("a.center", [Text])\n})');
  const gui = await vscode.workspace.openTextDocument(extension.diagramUri(source.uri, 0));
  let serial = 0;
  function ownerIds(xml = gui.text) {
    return [...readAllCells(xml).keys()].filter(id => /^cetz-edit-\d+$/.test(id));
  }
  function selectedIndices() {
    const selected = /cetzSelect=([\d,]+);/.exec(gui.text)?.[1];
    const ids = ownerIds();
    return selected ? selected.split(',').map(id => ids.indexOf('cetz-edit-' + id)).join(',') : '';
  }
  function removeShapes(xml, indices) {
    const ids = ownerIds(xml);
    return indices.reduce((text, index) => text.replace(new RegExp('<mxCell id="' + ids[index] + '"[\\s\\S]*?</mxCell>'), ''), xml);
  }
  function action(name, targets = '') {
    const ids = ownerIds();
    const actualTargets = targets ? targets.split(',').map(index => ids[+index].slice('cetz-edit-'.length)).join(',') : '';
    return `<mxCell id="clipboard-${++serial}" style="cetzAction=${name};${actualTargets ? `cetzTargets=${actualTargets};` : ''}cetzActionToken=clipboard-${serial};" vertex="1" parent="1"><mxGeometry x="-1000" y="-1000" width="1" height="1" as="geometry"/></mxCell>`;
  }
  function save(xml) { gui.text = xml; gui.version++; changed({ document: gui }); }
  async function until(predicate) {
    const deadline = Date.now() + 5000;
    while (!predicate() && !errors.length && Date.now() < deadline)
      await new Promise(resolve => setTimeout(resolve, 20));
    assert.deepEqual(errors, []);
    assert.ok(predicate(), 'GUI synchronization completes');
  }
  return { source, gui, save, action, until, ownerIds, selectedIndices, removeShapes,
    editSource(text) { source.text = text; source.version++; changed({ document: source }); }, getClipboard: () => clipboard };
}

test('clipboard bridge handles rapid copy-paste, deletion and paste after the originals are gone', async t => {
  const { source, gui, save, action, until, selectedIndices, removeShapes, getClipboard } = await extensionFixture(t);
  save(gui.text.replace('</root>', action('copy', '0,1') + action('paste') + '</root>'));
  await until(() => selectedIndices() === '2,3');
  assert.match(getClipboard(), /rect\(\(0, 0\), \(2, 1\), name: "a"\)/);
  assert.match(source.text, /content\("a-2.center", \[Text\]\)/);
  assert.match(source.text, /rect\(\(0\.5, -0\.5\), \(2\.5, 0\.5\), name: "a-2"\)/);
  save(removeShapes(gui.text, [0, 1]));
  await until(() => !source.text.includes('name: "a"') && selectedIndices() === '');
  assert.doesNotMatch(source.text, /\n[ \t]*\n/);
  assert.match(source.text, /name: "a-2"/);
  const beforePaste = source.text;
  save(gui.text.replace('</root>', action('paste') + '</root>'));
  await until(() => selectedIndices() === '2,3');
  assert.match(source.text, /name: "a"/);
  assert.match(source.text, /content\("a.center", \[Text\]\)/);
  const afterPaste = source.text;
  save(gui.text.replace('</root>', action('undo') + '</root>'));
  await until(() => source.text === beforePaste && !gui.text.includes('cetzAction=undo;'));
  save(gui.text.replace('</root>', action('redo') + '</root>'));
  await until(() => source.text === afterPaste && !gui.text.includes('cetzAction=redo;'));
  save(gui.text.replace('</root>', action('paste') + action('paste') + '</root>'));
  await until(() => selectedIndices() === '4,5,6,7');
  assert.match(source.text, /name: "a-3"/);
  assert.match(source.text, /name: "a-4"/);
  assert.match(source.text, /rect\(\(1\.5, -1\.5\), \(3\.5, -0\.5\), name: "a-3"\)/);
  assert.match(source.text, /rect\(\(2, -2\), \(4, -1\), name: "a-4"\)/);
});

test('move-delete-undo restores the moved shape, including undo before the deletion autosaves', async t => {
  const initial = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({\n  import cetz.draw: *\n  circle((0, 0), radius: 1)\n})';
  for (const rapid of [false, true]) {
    const { source, gui, save, action, until, ownerIds } = await extensionFixture(t, initial);
    const unit = Number(/cetzUnitX=([^;]+)/.exec(gui.text)[1]);
    const movedXml = gui.text.replace(/(<mxCell id="cetz-edit-0"[\s\S]*?<mxGeometry x=")([\d.-]+)/,
      (_, prefix, x) => prefix + (+x + unit));
    save(movedXml);
    await until(() => source.text.includes('circle((1, 0), radius: 1)') && gui.text !== movedXml);
    const moved = source.text;
    const deletedXml = gui.text.replace(/<mxCell id="cetz-edit-0"[\s\S]*?<\/mxCell>/, '');
    if (!rapid) {
      save(deletedXml);
      await until(() => !source.text.includes('circle(') && gui.text !== deletedXml);
      save(gui.text.replace('</root>', action('undo') + '</root>'));
    } else save(deletedXml.replace('</root>', action('undo') + '</root>'));
    await until(() => !gui.text.includes('cetzAction=undo;'));
    assert.equal(source.text, moved, 'undo deletion keeps the preceding movement');
    assert.ok([...readAllCells(gui.text).values()].some(item =>
      /^cetz-render-\d+$/.test(item.cell.id) && item.cell.parent === ownerIds()[0]));
    save(gui.text.replace('</root>', action('redo') + '</root>'));
    await until(() => !gui.text.includes('cetzAction=redo;'));
    assert.doesNotMatch(source.text, /circle\(/);
    save(gui.text.replace('</root>', action('undo') + '</root>'));
    await until(() => source.text === moved && !gui.text.includes('cetzAction=undo;'));
    save(gui.text.replace('</root>', action('undo') + '</root>'));
    await until(() => source.text === initial && !gui.text.includes('cetzAction=undo;'));
  }
});

test('deleting a middle element never retargets late saves or following actions to another survivor', async t => {
  const initial = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({\n  import cetz.draw: *\n' +
    '  circle((0, 0), radius: 1, name: "a")\n' +
    '  circle((3, 0), radius: 0.5, name: "b")\n' +
    '  circle((6, 0), radius: 1, name: "c")\n})';
  const { source, gui, save, action, until, ownerIds, removeShapes } = await extensionFixture(t, initial);
  const oldXml = gui.text, oldIds = ownerIds();
  const deletedXml = removeShapes(oldXml, [1]);
  save(deletedXml);
  await until(() => !source.text.includes('name: "b"') && gui.text !== deletedXml);
  const afterDelete = source.text;
  assert.ok(ownerIds().every(id => !oldIds.includes(id)), 'the new scene cannot merge a survivor with the deleted shape');
  save(deletedXml.replace('</root>', action('undo') + '</root>'));
  await until(() => source.text === initial && !gui.text.includes('cetzAction=undo;'));
  save(gui.text.replace('</root>', action('redo') + '</root>'));
  await until(() => source.text === afterDelete && !gui.text.includes('cetzAction=redo;'));
  const currentXml = gui.text;
  const unit = Number(/cetzUnitX=([^;]+)/.exec(gui.text)[1]);
  const moveCell = (xml, id) => xml.replace(new RegExp('(<mxCell id="' + id + '"[\\s\\S]*?<mxGeometry x=")([\\d.-]+)'),
    (_, prefix, x) => prefix + (+x + unit));
  // Simulate delayed webview autosaves after the extension already published
  // the post-deletion diagram, including a save missing an unrelated survivor.
  for (const stale of [moveCell(deletedXml, oldIds[2]), removeShapes(oldXml, [0, 1])]) {
    save(stale);
    await until(() => gui.text === currentXml);
    assert.equal(source.text, afterDelete, 'stale state must not move or delete remaining source calls');
  }
  const movedXml = moveCell(gui.text, ownerIds()[1]);
  save(movedXml);
  await until(() => source.text.includes('circle((7, 0), radius: 1, name: "c")') && gui.text !== movedXml);
  assert.match(source.text, /circle\(\(0, 0\), radius: 1, name: "a"\)/);
  const afterMove = source.text;
  save(gui.text.replace('</root>', action('duplicate', '1') + '</root>'));
  await until(() => source.text.includes('name: "c-2"') && !gui.text.includes('cetzAction=duplicate;'));
  assert.match(source.text, /circle\(\(7\.5, -0\.5\), radius: 1, name: "c-2"\)/);
  for (const expected of [afterMove, afterDelete, initial]) {
    save(gui.text.replace('</root>', action('undo') + '</root>'));
    await until(() => source.text === expected && !gui.text.includes('cetzAction=undo;'));
  }
});

test('property edits synchronize through the source bridge and undo as a single change', async t => {
  const initial = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *\nline((0, 0), (2, 1), stroke: 1pt + black)\n})';
  const { source, gui, action, save, until } = await extensionFixture(t, initial);
  const cell = [...readAllCells(gui.text)].find(([id]) => /^cetz-edit-/.test(id))[1];
  const model = JSON.parse(decodeURIComponent(/cetzProperties=([^;]+);/.exec(cell.cell.style)[1]));
  const value = encodeURIComponent(JSON.stringify({ base: model.base,
    values: { '$0': '(0.03125, -1.125)', close: 'true', stroke: '2pt + green' } }))
    .replace(/[!'()*]/g, char => '%' + char.charCodeAt(0).toString(16));
  const marker = action('properties', '0').replace('cetzAction=properties;', 'cetzAction=properties;cetzValue=' + value + ';');
  save(gui.text.replace('</root>', marker + '</root>'));
  await until(() => source.text.includes('stroke: 2pt + green') && gui.text.includes('cetzStrokeColor=#2ecc40'));
  assert.match(source.text, /line\(\(0.03125, -1.125\), \(2, 1\), stroke: 2pt \+ green, close: true\)/);
  save(gui.text.replace('</root>', '<mxCell id="property-undo" style="cetzAction=undo;cetzActionToken=property-undo;" vertex="1" parent="1"><mxGeometry x="-1000" y="-1000" width="1" height="1" as="geometry"/></mxCell></root>'));
  await until(() => source.text === initial && gui.text.includes('cetzStrokeColor=#000000'));
});

test('incomplete automatic properties keep the last valid preview without an error until Typst accepts the draft', async t => {
  const initial = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *\ncircle((0, 0), radius: 1, stroke: black)\n})';
  const { source, gui, action, save, until } = await extensionFixture(t, initial);
  const originalVersion = source.version;
  function propertyCell() { return [...readAllCells(gui.text)].find(([id]) => /^cetz-edit-/.test(id))[1]; }
  const originalCell = propertyCell();
  const originalProperties = /cetzProperties=([^;]+);/.exec(originalCell.cell.style)[1];
  async function submit(values) {
    const base = JSON.parse(decodeURIComponent(/cetzProperties=([^;]+);/.exec(propertyCell().cell.style)[1])).base;
    const value = encodeURIComponent(JSON.stringify({ base, values }))
      .replace(/[!'()*]/g, char => '%' + char.charCodeAt(0).toString(16));
    const marker = action('properties', '0').replace('cetzAction=properties;', 'cetzAction=properties;cetzValue=' + value + ';');
    const submitted = gui.text.replace('</root>', marker + '</root>');
    save(submitted);
    await until(() => gui.text !== submitted && !gui.text.includes('cetzAction=properties;'));
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  for (const values of [{ radius: '(' }, { stroke: 'red +' }, { stroke: 'not-yet-defined-color' }, { radius: '"not a radius"' }]) {
    await submit(values);
    assert.equal(source.text, initial);
    assert.equal(source.version, originalVersion);
    assert.equal(/cetzProperties=([^;]+);/.exec(propertyCell().cell.style)[1], originalProperties);
    assert.deepEqual(propertyCell().geometry, originalCell.geometry);
    assert.doesNotMatch(gui.text, /cetzStatus=/, 'draft validation does not show an error banner');
  }
  await submit({ radius: '2', stroke: '2pt + red' });
  assert.match(source.text, /radius: 2, stroke: 2pt \+ red/);
  assert.ok(source.version > originalVersion);
  assert.match(propertyCell().cell.style, /cetzStrokeColor=#ff4136/);
  assert.doesNotMatch(gui.text, /cetzStatus=/);
});

test('Boolean native saves remain operable through property changes, movement, deletion and undo', async t => {
  const initial = '#import "@preview/cetz:0.5.3"\n#cetz.canvas({ import cetz.draw: *\nboolean({ rect((3, 2.5), (4.5, 4)) }, { rect((3.5, 4.5), (6, 3)) }, op: "difference", fill: blue)\ncircle((8, 0), radius: 1)\n})';
  const { source, gui, save, action, until, ownerIds, removeShapes } = await extensionFixture(t, initial);
  // mxCodec drops default-valued rectangle coordinates during every save.
  const nativeSave = xml => xml.replace(/(<mxCell\b[^>]*\bid="cetz-render-\d+"[\s\S]*?<mxGeometry)([^>]+)/g,
    (_, prefix, attributes) => prefix + attributes.replace(/\s[xy]="0"/g, ''));
  const owner = readAllCells(gui.text).get(ownerIds()[0]);
  const base = JSON.parse(decodeURIComponent(/cetzProperties=([^;]+);/.exec(owner.cell.style)[1])).base;
  const value = encodeURIComponent(JSON.stringify({ base, values: { op: '"union"', fill: 'green' } }))
    .replace(/[!'()*]/g, char => '%' + char.charCodeAt(0).toString(16));
  const marker = action('properties', '0').replace('cetzAction=properties;', 'cetzAction=properties;cetzValue=' + value + ';');
  save(nativeSave(gui.text).replace('</root>', marker + '</root>'));
  await until(() => source.text.includes('op: "union"') && !gui.text.includes('cetzAction=properties;'));
  assert.doesNotMatch(gui.text, /cetzStatus=/);
  const afterProperties = source.text;
  const id = ownerIds()[0];
  const movedXml = nativeSave(gui.text).replace(new RegExp('(<mxCell id="' + id + '"[\\s\\S]*?<mxGeometry x=")([\\d.]+)'),
    (_, prefix, x) => prefix + (+x + 40));
  save(movedXml);
  await until(() => source.text !== afterProperties && gui.text !== movedXml);
  assert.doesNotMatch(gui.text, /cetzStatus=/);
  save(nativeSave(gui.text).replace('</root>', action('undo') + '</root>'));
  await until(() => source.text === afterProperties && !gui.text.includes('cetzAction=undo;'));
  save(removeShapes(nativeSave(gui.text), [0]));
  await until(() => !source.text.includes('boolean('));
  save(nativeSave(gui.text).replace('</root>', action('undo') + '</root>'));
  await until(() => source.text === afterProperties && !gui.text.includes('cetzAction=undo;'));
  assert.doesNotMatch(gui.text, /cetzStatus=/);
});

test('selection operations select their result, support undo, and keep rect-around attached to the originals', async t => {
  const initial = '#import "@preview/cetz:0.5.3"\n#cetz.canvas({ import cetz.draw: *\ncircle((0, 0), radius: 1.5, fill: red)\npolygon((0.5, 0), 5, radius: 1.5)\nn-star((0, 0.5), 5, radius: 1.5)\n})';
  const { source, gui, action, save, until, selectedIndices, ownerIds } = await extensionFixture(t, initial);
  save(gui.text.replace('</root>', action('boolean-difference', '2,0,1') + '</root>'));
  await until(() => source.text.includes('op: "difference"') && ownerIds().length === 1 && selectedIndices() === '0');
  assert.doesNotMatch(source.text, /rect\(/);
  assert.doesNotMatch(gui.text, /cetzStatus=/);
  save(gui.text.replace('</root>', action('undo') + '</root>'));
  await until(() => source.text === initial && ownerIds().length === 3);
  save(gui.text.replace('</root>', action('make-rect-around', '0,1,2') + '</root>'));
  await until(() => source.text.includes('rect-around(') && ownerIds().length === 4 && selectedIndices() === '3');
  assert.match(source.text, /rect-around\("shape-1", "shape-2", "shape-3", padding: 0.1/);
  const oldFrame = readAllCells(gui.text).get(ownerIds()[3]).geometry;
  const id = ownerIds()[0];
  const moved = gui.text.replace(new RegExp('(<mxCell id="' + id + '"[\\s\\S]*?<mxGeometry x=")([\\d.]+)'),
    (_, prefix, x) => prefix + (+x + 500));
  save(moved);
  await until(() => gui.text !== moved && +readAllCells(gui.text).get(ownerIds()[3]).geometry.width > +oldFrame.width);
  assert.ok(source.text.includes('rect-around("shape-1", "shape-2", "shape-3"'));
  assert.doesNotMatch(gui.text, /cetzStatus=/);
});

test('fixing a source render error clears both file and live scene error status', async t => {
  const initial = '#import "@preview/cetz:0.5.3"\n#cetz.canvas({ import cetz.draw: *\ncircle((0, 0), radius: 1)\n})';
  const { source, gui, editSource, until } = await extensionFixture(t, initial);
  editSource(initial.replace('radius: 1', 'radius: missing-radius'));
  await until(() => /cetzStatus=/.test(gui.text));
  assert.match(gui.text, /cetzError=[^;]+;/);
  editSource(initial);
  await until(() => !/cetzStatus=/.test(gui.text));
  assert.equal(source.text, initial);
  assert.match(gui.text, /cetzError=;/);
  assert.equal([...readAllCells(gui.text).keys()].filter(id => /^cetz-edit-/.test(id)).length, 1);
});

test('a valid unchanged GUI save clears a resolved edit error without changing Typst', async t => {
  const initial = '#import "@preview/cetz:0.5.3"\n#cetz.canvas({ import cetz.draw: *\ncircle((0, 0), radius: 1)\n})';
  const { source, gui, save, until } = await extensionFixture(t, initial);
  save(gui.text.replace('cetzKind=circle;', 'cetzKind=circle;unsupportedStyle=1;'));
  await until(() => /cetzStatus=/.test(gui.text));
  assert.equal(source.text, initial);
  assert.doesNotMatch(gui.text, /unsupportedStyle/);
  save(gui.text.replace('cetzKind=circle;', 'cetzKind=circle;cetzSnapStep=0.25;'));
  await until(() => !/cetzStatus=/.test(gui.text));
  assert.match(gui.text, /cetzError=;/);
  assert.equal(source.text, initial);
});
