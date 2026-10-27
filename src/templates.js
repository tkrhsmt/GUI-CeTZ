'use strict';
const { callFromPoints } = require('./placement');
const { OPERATION_NAMES } = require('./path-operations');

// These are source templates, not approximations of CeTZ geometry. Typst renders
// the resulting canvas so marks, curves, paths, anchors and styles stay exact.
const SHAPES = [
  { label: 'polygon', call: 'polygon((0, 0), 6, radius: 1)' },
  { label: 'circle-through', call: 'circle-through((0, 0), (1, 1), (2, 0))' },
  { label: 'arc-through', call: 'arc-through((0, 0), (1, 1), (2, 0))' },
  { label: 'bezier-through', call: 'bezier-through((0, 0), (1, 1), (2, 0))' },
  { label: 'arc', call: 'arc((0, 0), start: 30deg, stop: 150deg, radius: 1)' },
  { label: 'mark', call: 'mark((0, 0), (1, 0), symbol: ">", scale: 3)' },
  { label: 'n-star', call: 'n-star((0, 0), 5, radius: 1, fill: yellow)' },
  { label: 'grid', call: 'grid((0, 0), (3, 2), step: 0.5, stroke: gray)' },
  { label: 'bezier', call: 'bezier((0, 0), (2, 0), (0.5, 1), (1.5, 1))' },
  { label: 'hobby', call: 'hobby((0, 0), (1, 1), (2, 0), (3, 1))' },
  { label: 'catmull', call: 'catmull((0, 0), (1, 1), (2, 0), (3, 1))' },
];
const PREVIEW_PRIMITIVES = [
  { label: 'rect', call: 'rect((0, 0), (2, 1))' },
  { label: 'circle', call: 'circle((0, 0), radius: 1)' },
  { label: 'content', call: 'content((0, 0), "Text")' },
  { label: 'line', call: 'line((0, 0), (2, 0))' }
];

const ALL_SHAPES = PREVIEW_PRIMITIVES.concat(SHAPES);
const PLACEMENT_SHAPES = ALL_SHAPES;
const ALL_FUNCTIONS = ALL_SHAPES.concat(OPERATION_NAMES.map(label => ({ label, operation: true })));

function insertionFor(source, canvas, call) {
  const body = source.slice(canvas.bodyStart, canvas.bodyEnd);
  const indent = /^([ \t]*)\S/m.exec(body)?.[1] || '  ';
  const needsImport = !/\bimport\s+cetz\.draw\s*:\s*\*/.test(body);
  const lines = call.split('\n').map(line => indent + line).join('\n');
  const before = body.endsWith('\n') ? '' : '\n';
  return { offset: canvas.bodyEnd, text: `${before}${needsImport ? indent + 'import cetz.draw: *\n' : ''}${lines}\n` };
}

function callFromGeometry(name, item, calibration) {
  if (!calibration || !['rect', 'circle', 'content', 'line'].includes(name)) return null;
  const ux = calibration.unitX * 2.5, uy = calibration.unitY * 2.5;
  const x = screen => Math.round((screen - calibration.originX) / ux * 4) / 4;
  const y = screen => Math.round((calibration.originY - screen) / uy * 4) / 4;
  const point = (screenX, screenY) => `(${x(screenX)}, ${y(screenY)})`;
  const g = item.geometry || {};
  const [gx, gy, width, height] = [g.x, g.y, g.width, g.height].map(Number);
  if (![gx, gy, width, height].every(Number.isFinite)) return null;
  if (name === 'line') {
    const start = item.source ? [Number(item.source.x), Number(item.source.y)] : [gx, gy + height];
    const end = item.target ? [Number(item.target.x), Number(item.target.y)] : [gx + width, gy];
    if (![...start, ...end].every(Number.isFinite)) return null;
    return `line(${point(...start)}, ${point(...end)})`;
  }
  if (width <= 0 || height <= 0) return null;
  if (name === 'rect') return `rect(${point(gx, gy + height)}, ${point(gx + width, gy)})`;
  const center = point(gx + width / 2, gy + height / 2);
  if (name === 'content') return `content(${center}, "Text")`;
  const rx = Math.round(width / (2 * ux) * 100) / 100;
  const ry = Math.round(height / (2 * uy) * 100) / 100;
  return `circle(${center}, radius: ${Math.abs(rx - ry) < 0.01 ? rx : `(${rx}, ${ry})`})`;
}

function templateInsertions(source, canvas, cells, originalCells = new Map(), calibration) {
  const calls = [];
  for (const [id, item] of cells) {
    if (originalCells.has(id) || item.cell.parent !== '1') continue;
    const name = /(?:^|;)cetzTemplate=([\w-]+)(?:;|$)/.exec(item.cell.style || '')?.[1];
    if (!name) continue;
    if (OPERATION_NAMES.includes(name)) throw new Error('Select existing objects and use Path operations.');
    const shape = PLACEMENT_SHAPES.find(entry => entry.label === name);
    if (!shape) throw new Error(`Unknown CeTZ shape template: ${name}`);
    const encoded = /(?:^|;)cetzPoints=([^;]+)(?:;|$)/.exec(item.cell.style || '')?.[1];
    if (encoded) {
      let points;
      try { points = JSON.parse(decodeURIComponent(encoded)); }
      catch { throw new Error('Invalid CeTZ placement points.'); }
      calls.push(callFromPoints(name, points));
    } else calls.push(callFromGeometry(name, item, calibration) || shape.call);
  }
  if (!calls.length) return [];
  const insertion = insertionFor(source, canvas, calls.join('\n'));
  return [{ start: insertion.offset, end: insertion.offset, text: insertion.text }];
}

module.exports = { SHAPES, ALL_SHAPES, PLACEMENT_SHAPES, ALL_FUNCTIONS, insertionFor, templateInsertions };
