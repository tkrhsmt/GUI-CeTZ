'use strict';

const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);

function outputName(file, format) {
  const base = path.basename(file, path.extname(file));
  return `${base}${format === 'pdf' ? '' : '-{0p}'}.${format}`;
}

async function exportTypst(vscode, document) {
  if (!document || !document.uri?.fsPath?.endsWith('.typ'))
    throw new Error('Open a .typ file before exporting.');
  const format = await vscode.window.showQuickPick(['PDF', 'SVG', 'PNG'], {
    title: 'CeTZ: Export Typst document', placeHolder: 'Choose an output format'
  });
  if (!format) return;
  const extension = format.toLowerCase();
  const ppi = extension === 'png' ? await vscode.window.showQuickPick(['144', '300'], {
    title: 'CeTZ: PNG resolution', placeHolder: 'Choose pixels per inch'
  }) : undefined;
  if (extension === 'png' && !ppi) return;
  const output = await vscode.window.showSaveDialog({
    title: `Export ${format}`,
    defaultUri: vscode.Uri.file(path.join(path.dirname(document.uri.fsPath),
      outputName(document.uri.fsPath, extension))),
    filters: { [format]: [extension] }
  });
  if (!output) return;
  if (document.isDirty && !await document.save())
    throw new Error('Save the Typst source before exporting.');
  const args = ['compile', document.uri.fsPath, output.fsPath];
  if (ppi) args.push('--ppi', ppi);
  try { await run('typst', args, { cwd: path.dirname(document.uri.fsPath), maxBuffer: 1024 * 1024 }); }
  catch (error) { throw new Error((error.stderr || error.message || String(error)).trim()); }
  vscode.window.showInformationMessage(`CeTZ: Exported ${format} to ${output.fsPath}`);
}

module.exports = { outputName, exportTypst };
