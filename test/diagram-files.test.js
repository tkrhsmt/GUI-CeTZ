'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { diagramUri, sourceForDiagramUri, DiagramFiles, SCHEME } = require('../src/diagram-files');

const vscode = {
  Uri: { from: parts => ({ ...parts, toString() { return `${parts.scheme}:${parts.path}`; } }) },
  FileType: { File: 1, Directory: 2 },
  FileChangeType: { Created: 1, Changed: 2, Deleted: 3 },
  FileSystemError: {
    FileNotFound: () => new Error('FileNotFound'),
    FileExists: () => new Error('FileExists')
  },
  Disposable: class { constructor(dispose) { this.dispose = dispose; } },
  EventEmitter: class {
    constructor() { this.events = []; this.event = () => {}; }
    fire(event) { this.events.push(event); }
    dispose() {}
  }
};

test('keeps Draw.io documents in a virtual file system', () => {
  const uri = diagramUri(vscode, { path: '/project/figure.typ', authority: '' }, 1);
  assert.equal(uri.scheme, SCHEME);
  assert.equal(uri.path, '/project/figure.cetz-2.drawio');
  const provider = new DiagramFiles(vscode);
  assert.throws(() => provider.readFile(uri), /FileNotFound/);
  provider.writeFile(uri, Buffer.from('<mxfile/>'), { create: true, overwrite: true });
  assert.equal(Buffer.from(provider.readFile(uri)).toString(), '<mxfile/>');
  assert.equal(provider.stat(uri).type, vscode.FileType.File);
  assert.equal(provider.stat(vscode.Uri.from({ scheme: SCHEME, path: '/project' })).type,
    vscode.FileType.Directory);
  provider.writeFile(uri, Buffer.from('<mxfile changed="1"/>'), { create: true, overwrite: true });
  assert.equal(Buffer.from(provider.readFile(uri)).toString(), '<mxfile changed="1"/>');
  provider.initialize(uri, Buffer.from('<mxfile reset="1"/>'));
  assert.equal(Buffer.from(provider.readFile(uri)).toString(), '<mxfile changed="1"/>');
  assert.deepEqual(provider.changes.events.map(event => event[0].type),
    [vscode.FileChangeType.Created, vscode.FileChangeType.Changed]);
});

test('recovers a restored Draw.io tab from its Typst source URI', async () => {
  const uri = diagramUri(vscode, { path: '/project/my.diagram.typ', authority: '' }, 1);
  const source = sourceForDiagramUri(vscode, uri);
  assert.equal(source.sourceUri.scheme, 'file');
  assert.equal(source.sourceUri.path, '/project/my.diagram.typ');
  assert.equal(source.index, 1);
  let calls = 0;
  const provider = new DiagramFiles(vscode, async requested => {
    assert.equal(requested.toString(), uri.toString());
    calls++;
    return Buffer.from('<mxfile restored="1"/>');
  });
  const [stat, data] = await Promise.all([provider.stat(uri), provider.readFile(uri)]);
  assert.equal(stat.size, data.length);
  assert.equal(Buffer.from(data).toString(), '<mxfile restored="1"/>');
  assert.equal(calls, 1);
  assert.equal(Buffer.from(provider.readFile(uri)).toString(), '<mxfile restored="1"/>');
  assert.equal(sourceForDiagramUri(vscode, vscode.Uri.from({ scheme: SCHEME,
    path: '/project/unrelated.drawio' })), null);
});
