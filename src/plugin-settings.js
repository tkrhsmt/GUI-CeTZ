'use strict';
const path = require('path');

// Draw.io only loads plugins named in its configuration. The development
// workspace has this setting, but a VSIX installed in another workspace does not.
async function ensureDrawioPlugin(vscode, extensionPath, resource) {
  const file = path.join(extensionPath, 'src', 'cetz-drawio-plugin.js');
  const config = vscode.workspace.getConfiguration('hediet.vscode-drawio', resource);
  const plugins = config.get('plugins') || [];
  const folder = vscode.workspace.getWorkspaceFolder(resource);
  const resolved = entry => (entry || '').replace(/\$\{workspaceFolder\}/g, folder?.uri.fsPath || '');
  const isCetzPlugin = plugin => plugin &&
    path.normalize(resolved(plugin.file)).endsWith(path.join('src', 'cetz-drawio-plugin.js'));
  if (plugins.filter(isCetzPlugin).length === 1 &&
    path.normalize(resolved(plugins.find(isCetzPlugin).file)) === path.normalize(file)) return;

  const inspected = config.inspect('plugins') || {};
  const target = inspected.workspaceFolderValue !== undefined
    ? vscode.ConfigurationTarget.WorkspaceFolder
    : inspected.workspaceValue !== undefined
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
  await config.update('plugins', [...plugins.filter(plugin => !isCetzPlugin(plugin)), { file }], target);
}

module.exports = { ensureDrawioPlugin };
