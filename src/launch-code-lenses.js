'use strict';
const { locateCanvases } = require('./scanner');

function launchCodeLenses(vscode, document) {
  if (!document.fileName.endsWith('.typ')) return [];
  const text = document.getText();
  return locateCanvases(text).map((canvas, index) => {
    const offset = text[canvas.start - 1] === '#' ? canvas.start - 1 : canvas.start;
    const position = document.positionAt(offset);
    return new vscode.CodeLens(new vscode.Range(position, position), {
      title: '▶ GUI CeTZ', tooltip: 'Open this CeTZ canvas in the GUI editor',
      command: 'cetzEditor.open', arguments: [document.uri, index]
    });
  });
}

module.exports = { launchCodeLenses };
