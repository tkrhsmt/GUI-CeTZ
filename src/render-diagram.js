'use strict';

const { renderEditable } = require('./advanced');
const { renderCanvas, imageDiagram } = require('./preview');

async function renderDiagram(source, canvas, filePath) {
  let editable = null;
  try { editable = await renderEditable(source, canvas, filePath); }
  catch { /* Keep the exact Typst preview when individual calls cannot be edited. */ }
  return { editable,
    xml: editable?.xml || imageDiagram(await renderCanvas(source, canvas, filePath)) };
}

module.exports = { renderDiagram };
