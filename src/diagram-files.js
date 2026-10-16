'use strict';
const path = require('path');

const SCHEME = 'gui-cetz';

function diagramUri(vscode, sourceUri, index) {
  const parsed = path.posix.parse(sourceUri.path);
  return vscode.Uri.from({ scheme: SCHEME, authority: sourceUri.authority,
    path: path.posix.join(parsed.dir, `${parsed.name}.cetz-${index + 1}.drawio`) });
}

class DiagramFiles {
  constructor(vscode) {
    this.vscode = vscode;
    this.files = new Map();
    this.changes = new vscode.EventEmitter();
    this.onDidChangeFile = this.changes.event;
  }

  watch() { return new this.vscode.Disposable(() => {}); }

  stat(uri) {
    const file = this.files.get(uri.toString());
    if (file) return { type: this.vscode.FileType.File, ctime: file.ctime,
      mtime: file.mtime, size: file.data.length };
    if (!uri.path.endsWith('.drawio'))
      return { type: this.vscode.FileType.Directory, ctime: 0, mtime: 0, size: 0 };
    throw this.vscode.FileSystemError.FileNotFound(uri);
  }

  readFile(uri) {
    const file = this.files.get(uri.toString());
    if (!file) throw this.vscode.FileSystemError.FileNotFound(uri);
    return file.data;
  }

  writeFile(uri, data, options) {
    const key = uri.toString(), previous = this.files.get(key);
    if (!previous && !options.create) throw this.vscode.FileSystemError.FileNotFound(uri);
    if (previous && !options.overwrite) throw this.vscode.FileSystemError.FileExists(uri);
    const now = Math.max(Date.now(), (previous?.mtime || 0) + 1);
    this.files.set(key, { data: Uint8Array.from(data), ctime: previous?.ctime || now, mtime: now });
    this.changes.fire([{ type: previous ? this.vscode.FileChangeType.Changed : this.vscode.FileChangeType.Created, uri }]);
  }

  initialize(uri, data) {
    if (!this.files.has(uri.toString()))
      this.writeFile(uri, data, { create: true, overwrite: false });
  }

  readDirectory(uri) {
    const prefix = uri.toString().replace(/\/$/, '') + '/';
    const entries = new Map();
    for (const key of this.files.keys()) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length), name = rest.split('/')[0];
      entries.set(name, rest.includes('/') ? this.vscode.FileType.Directory : this.vscode.FileType.File);
    }
    return [...entries];
  }

  createDirectory() {}

  delete(uri) {
    if (!this.files.delete(uri.toString())) throw this.vscode.FileSystemError.FileNotFound(uri);
    this.changes.fire([{ type: this.vscode.FileChangeType.Deleted, uri }]);
  }

  rename(oldUri, newUri, options) {
    const data = this.readFile(oldUri);
    this.writeFile(newUri, data, { create: true, overwrite: options.overwrite });
    this.delete(oldUri);
  }

  dispose() { this.changes.dispose(); this.files.clear(); }
}

module.exports = { SCHEME, diagramUri, DiagramFiles };
