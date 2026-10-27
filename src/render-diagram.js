'use strict';

const { renderEditable } = require('./advanced');
const { renderCanvas, imageDiagram } = require('./preview');

async function renderDiagram(source, canvas, filePath) {
  let editable = null;
  try { editable = await renderEditable(source, canvas, filePath); }
  catch { /* Keep the exact Typst preview when individual calls cannot be edited. */ }
  let xml = editable?.xml || imageDiagram(await renderCanvas(source, canvas, filePath));
  if (!editable && require('./three-dimensional').is3DCanvas(source, canvas))
    xml = xml.replace(/(<mxCell id="preview-image"[^>]*style=")/, '$1cetzMode=3d;');
  return { editable, xml };
}

module.exports = { renderDiagram };
