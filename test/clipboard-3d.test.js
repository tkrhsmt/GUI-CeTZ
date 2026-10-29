'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { locateCanvases, deletionRange } = require('../src/scanner');
const { renderEditable } = require('../src/advanced');
const { copyShapes, pasteShapes } = require('../src/clipboard');
const { planeCode } = require('../src/plane-editor');

const document = (body, version = '0.5.2') => `#import "@preview/cetz:${version}"\n#cetz.canvas({ import cetz.draw: *\n${body}\n})`;
const render = source => renderEditable(source, locateCanvases(source)[0], path.resolve('examples/three-dimensional.typ'));
const apply = (source, patches) => [...patches].sort((a, b) => b.start - a.start)
  .reduce((text, patch) => text.slice(0, patch.start) + patch.text + text.slice(patch.end), source);

for (const projection of ['ortho', 'perspective']) test(`${projection}: XYZ lines and content paste together, rename anchors and retain expressions`, async () => {
  const source = document(`${projection}({
    cetz.draw.line((0, 0, 1), (2, 3, 4), name: "edge", stroke: 2pt + red)
    content("edge.mid")[Label $x^2$]
  })`);
  const rendered = await render(source), indices = [0, 1];
  const clipboard = copyShapes(source, rendered, indices);
  const patches = pasteShapes(source, rendered, clipboard);
  const next = apply(source, patches), after = await render(next);
  assert.ok(next.includes('cetz.draw.line((0.5, -0.5, 1), (2.5, 2.5, 4), name: "edge-2", stroke: 2pt + red)'));
  assert.ok(next.includes('content("edge-2.mid")[Label $x^2$]'));
  assert.equal(after.workspace.views.length, 1);
  assert.equal(after.calls.filter(call => call.name === 'line').length, 2);
  assert.equal(after.calls.filter(call => call.name === 'content').length, 2);
  assert.equal(patches.selectStarts.length, 2);
  for (const start of patches.selectStarts) assert.ok(after.calls.some(call => call.start === start));
  const nextAgain = apply(next, pasteShapes(next, after, clipboard, 2));
  assert.ok(nextAgain.includes('name: "edge-3"'));
  assert.ok(nextAgain.includes('content("edge-3.mid")[Label $x^2$]'));
  await render(nextAgain);
});

test('a tilted managed plane copies its complete body once, preserves pose and allocates a new plane identity', async () => {
  const seed = document('');
  const code = planeCode(seed, 'gui-plane-1', { kind: 'xz', position: [1, 2, 3], angles: [20, 30, 40] },
    '\n    // Keep local expressions\n    let size = 2\n    rect((0, 0), (size, 1), name: "r")\n    content("r.center")[Text]\n  ');
  const source = document(`ortho({${code}})`), rendered = await render(source);
  const plane = rendered.workspace.planes[0];
  const clipboard = copyShapes(source, rendered, [plane.wrapperIndex, plane.index, 0, 1]);
  const patches = pasteShapes(source, rendered, clipboard, 1, [plane.wrapperIndex]);
  const next = apply(source, patches), after = await render(next), copied = after.workspace.planes[1];
  assert.equal(after.workspace.planes.length, 2);
  assert.equal(copied.key, 'gui-plane-2');
  assert.deepEqual(copied.position, [1.5, 1.5, 3]);
  assert.deepEqual(copied.angles, [20, 30, 40]);
  assert.equal((next.match(/let size = 2/g) || []).length, 2);
  assert.equal((next.match(/Keep local expressions/g) || []).length, 2);
  assert.ok(next.includes('content("r-2.center")[Text]'));
  assert.deepEqual(patches.selectStarts, [copied.wrapperStart]);
  const again = apply(next, pasteShapes(next, after, clipboard, 2));
  const last = (await render(again)).workspace.planes[2];
  assert.equal(last.key, 'gui-plane-3');
  assert.deepEqual(last.position, [2, 1, 3]);
});

for (const version of ['0.4.2', '0.5.2']) test(`${version}: ordinary XY/XZ/ZY planes retain local geometry and depth on paste`, async () => {
  const zy = version === '0.4.2' ? 'on-yz' : 'on-zy';
  const source = document(`ortho({on-xy(z: 2, {rect((0,0),(1,1))})\non-xz(y: 3, {circle((0,0))})\n${zy}(x: 4, {line((0,0),(1,1))})})`, version);
  const rendered = await render(source), planes = rendered.workspace.planes;
  const indices = planes.map(plane => plane.wrapperIndex);
  const patches = pasteShapes(source, rendered, copyShapes(source, rendered, indices));
  const next = apply(source, patches), after = await render(next);
  assert.equal(after.workspace.planes.length, 6);
  assert.deepEqual(after.workspace.planes.slice(3).map(plane => plane.position), [[0.5, -0.5, 2], [0.5, 2.5, 0], [4.5, -0.5, 0]]);
  assert.deepEqual(after.workspace.planes.slice(3).map(plane => plane.kind), ['xy', 'xz', 'zy']);
  assert.equal(new Set(after.workspace.planes.map(plane => plane.key)).size, 6);
  assert.equal(patches.selectStarts.length, 3);
});

test('3D clipboard survives deletion of the original XYZ shapes and preserves their parent projection', async () => {
  const source = document('ortho(x: 25deg, {line((0,0,0),(1,2,3))\ncontent((2,2,2))[Saved]})');
  const rendered = await render(source), clipboard = copyShapes(source, rendered, [0, 1]);
  const empty = apply(source, rendered.calls.filter(call => ['line', 'content'].includes(call.name))
    .map(call => ({ ...deletionRange(source, call.start, call.end), text: '' })));
  const target = await render(empty), next = apply(empty, pasteShapes(empty, target, clipboard));
  const after = await render(next);
  assert.equal(after.workspace.views.length, 1);
  assert.ok(next.includes('content((2.5, 1.5, 2))[Saved]'));
  assert.equal(after.calls.filter(call => call.name === 'line').length, 1);
});

test('objects from multiple views return to their respective parents and selected destinations accept cross-view paste', async () => {
  const source = document('ortho(x: 20deg, {line((0,0,0),(1,2,3))})\nperspective(x: 40deg, {content((2,2,2))[Other]})');
  const rendered = await render(source), indices = rendered.calls.flatMap((call, index) => ['line', 'content'].includes(call.name) ? [index] : []);
  const patches = pasteShapes(source, rendered, copyShapes(source, rendered, indices));
  assert.equal(patches.length, 2);
  const after = await render(apply(source, patches));
  for (const view of after.workspace.views) assert.equal(after.calls.filter(call => call.group === after.calls[view.index]).length, 2);
  for (const start of patches.selectStarts) assert.ok(after.calls.some(call => call.start === start));
  const viewIndex = rendered.calls.findIndex(call => call.name === 'perspective');
  const copied = copyShapes(source, rendered, [0]);
  const moved = await render(apply(source, pasteShapes(source, rendered, copied, 1, [viewIndex])));
  assert.equal(moved.calls.filter(call => call.name === 'line' && call.group.name === 'perspective').length, 1);
});

test('local plane line/content paste inside the plane, preserve Z-free coordinates and allow another selected plane', async () => {
  const seed = document(''), p = (key, z) => planeCode(seed, key, { kind: 'xy', position: [0, 0, z], angles: [0, 0, 0] }, '\nline((0,0),(1,1))\ncontent((0,1))[Text]\n');
  const source = document(`ortho({${p('gui-plane-1', 1)}\n${p('gui-plane-2', 3)}})`), rendered = await render(source);
  const line = rendered.calls.findIndex(call => call.name === 'line');
  const clipboard = copyShapes(source, rendered, [line]);
  const next = apply(source, pasteShapes(source, rendered, clipboard));
  const after = await render(next);
  assert.ok(next.includes('line((0.5, -0.5),(1.5, 0.5))'));
  const first = after.workspace.planes[0];
  assert.equal(after.calls.filter(call => call.name === 'line' && call.start > first.bodyStart && call.end < first.bodyEnd).length, 2);
  const target = rendered.workspace.planes[1];
  const moved = await render(apply(source, pasteShapes(source, rendered, clipboard, 1, [target.wrapperIndex])));
  const second = moved.workspace.planes[1];
  assert.equal(moved.calls.filter(call => call.name === 'line' && call.start > second.bodyStart && call.end < second.bodyEnd).length, 2);
});

test('content with a computed position keeps its expression and text when copied alone', async () => {
  const source = document('ortho({let p = (1,2,3)\ncontent(p, [*Rich* $x$], angle: 10deg)})');
  const rendered = await render(source), clip = copyShapes(source, rendered, [0]);
  const next = apply(source, pasteShapes(source, rendered, clip));
  assert.ok(next.includes('content((rel: (0.5, -0.5, 0), to: p), [*Rich* $x$], angle: 10deg)'));
  await render(next);
  assert.throws(() => copyShapes(source, rendered, [rendered.calls.length - 1]), /plane, line or content/);
  assert.throws(() => pasteShapes(source, rendered, 'unrelated clipboard'), /Copy 3D CeTZ/);
});
