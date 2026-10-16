'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { ensureDrawioPlugin } = require('../src/plugin-settings');

function fixture(plugins, scope = {}) {
  const updates = [];
  const vscode = {
    ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
    workspace: {
      getWorkspaceFolder: () => ({ uri: { fsPath: '/project' } }),
      getConfiguration: () => ({
        get: () => plugins,
        inspect: () => scope,
        update: async (...args) => updates.push(args)
      })
    }
  };
  return { vscode, updates };
}

test('registers the packaged Draw.io plugin while preserving existing plugins', async () => {
  const { vscode, updates } = fixture([{ file: '/other/plugin.js' }]);
  await ensureDrawioPlugin(vscode, '/extensions/gui-cetz', {});
  assert.deepEqual(updates, [['plugins', [
    { file: '/other/plugin.js' },
    { file: path.join('/extensions/gui-cetz', 'src', 'cetz-drawio-plugin.js') }
  ], vscode.ConfigurationTarget.Global]]);
});

test('uses an existing workspace scope and does not duplicate the development plugin', async () => {
  const { vscode, updates } = fixture([{ file: '${workspaceFolder}/src/cetz-drawio-plugin.js' }],
    { workspaceValue: [{ file: '${workspaceFolder}/src/cetz-drawio-plugin.js' }] });
  await ensureDrawioPlugin(vscode, '/project', {});
  assert.equal(updates.length, 0);
  const configured = fixture([{ file: '/other/plugin.js' }], { workspaceFolderValue: [] });
  await ensureDrawioPlugin(configured.vscode, '/extensions/gui-cetz', {});
  assert.equal(configured.updates[0][2], vscode.ConfigurationTarget.WorkspaceFolder);
});

test('replaces old CeTZ plugin entries instead of loading duplicate palettes', async () => {
  const current = '/extensions/gui-cetz/src/cetz-drawio-plugin.js';
  const { vscode, updates } = fixture([
    { file: '/old-extension/src/cetz-drawio-plugin.js' },
    { file: '/other/plugin.js' },
    { file: current }
  ]);
  await ensureDrawioPlugin(vscode, '/extensions/gui-cetz', {});
  assert.deepEqual(updates[0][1], [{ file: '/other/plugin.js' }, { file: current }]);
});
