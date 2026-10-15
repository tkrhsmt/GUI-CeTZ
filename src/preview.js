'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');
const { locateCanvases } = require('./scanner');

function definitionPrelude(prefix) {
  const lines = prefix.split('\n'), kept = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*#(?:import|let|set|show)\b/.test(lines[i])) continue;
    let statement = lines[i];
    let depth = bracketBalance(statement);
    while (i + 1 < lines.length && (depth > 0 || /(?:=|,|\+)\s*$/.test(statement))) {
      statement += '\n' + lines[++i];
      depth = bracketBalance(statement);
    }
    kept.push(statement);
  }
  return kept.join('\n');
}
function bracketBalance(text) {
  let depth = 0, quoted = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\' && quoted) { i++; continue; }
    if (text[i] === '"') { quoted = !quoted; continue; }
    if (quoted) continue;
    if ('([{'.includes(text[i])) depth++;
    if (')]}'.includes(text[i])) depth--;
  }
  return depth;
}
function compileSvg(input, filePath) {
  return new Promise((resolve, reject) => {
    const child = spawn('typst', ['compile', '-', '--root', path.dirname(filePath), '--format', 'svg', '-'], {
      cwd: path.dirname(filePath), stdio: ['pipe', 'pipe', 'pipe']
    });
    let output = '', errors = '';
    const timer = setTimeout(() => child.kill(), 15000);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { output += chunk; if (output.length > 8_000_000) child.kill(); });
    child.stderr.on('data', chunk => { errors += chunk; });
    child.stdin.on('error', error => { if (error.code !== 'EPIPE') reject(error); });
    child.on('error', error => reject(error.code === 'ENOENT'
      ? new Error('Typst CLI was not found. Install Typst and make sure `typst` is on PATH.') : error));
    child.on('close', code => {
      clearTimeout(timer);
      code === 0 ? resolve(output) : reject(new Error(`Typst preview failed: ${errors.trim() || `exit ${code}`}`));
    });
    child.stdin.end(input);
  });
}

// Typst is the authority for CeTZ geometry, including custom resolvers,
// context, paths and projections.
async function renderCanvas(source, canvas, filePath) {
  const callStart = source[canvas.start - 1] === '#' ? canvas.start - 1 : canvas.start;
  let prefix = source.slice(0, callStart);
  for (const earlier of locateCanvases(prefix).reverse()) {
    const start = prefix[earlier.start - 1] === '#' ? earlier.start - 1 : earlier.start;
    prefix = prefix.slice(0, start) + prefix.slice(earlier.end);
  }
  const selected = source.slice(callStart, canvas.end);
  const page = '#set page(width: auto, height: auto, margin: 0pt, fill: none)';
  const prelude = definitionPrelude(prefix);
  let stdout;
  try {
    stdout = await compileSvg(`${prelude}\n${page}\n${selected}\n`, filePath);
  } catch (error) {
    if (prelude === prefix.trim()) throw error;
    stdout = await compileSvg(`${prefix}\n${page}\n${selected}\n`, filePath);
  }
  if (!/^<svg\b/.test(stdout)) throw new Error('Typst did not produce an SVG preview.');
  return stdout;
}

function imageDiagram(svg) {
  const size = /<svg\b[^>]*viewBox="[^"]*?\s([\d.]+)\s([\d.]+)"/.exec(svg);
  if (!size) throw new Error('Typst SVG has no viewBox.');
  const width = Math.max(1, Number(size[1]) * 2.5);
  const height = Math.max(1, Number(size[2]) * 2.5);
  const image = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="GUI-CeTZ"><diagram id="cetz-canvas" name="CeTZ preview"><mxGraphModel grid="1" page="0" pageWidth="${width}" pageHeight="${height}"><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="preview-image" value="" style="shape=image;imageAspect=1;movable=0;resizable=0;editable=0;deletable=0;rotatable=0;connectable=0;image=${image};" vertex="1" parent="1" connectable="0"><mxGeometry x="0" y="0" width="${width}" height="${height}" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>\n`;
}

module.exports = { renderCanvas, imageDiagram };
