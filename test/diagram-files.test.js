'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { diagramUri, DiagramFiles, SCHEME } = require('../src/diagram-files');

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
