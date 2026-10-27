'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { locateCanvases, deletionRange } = require('../src/scanner');
const { locateEditableCalls, renderEditable, patchesFromEditable } = require('../src/advanced');
const { readAllCells } = require('../src/drawio');
const { copyShapes, pasteShapes } = require('../src/clipboard');

function setup(source) {
  const canvas = locateCanvases(source)[0];
  return { canvas, calls: locateEditableCalls(source, canvas) };
}
function apply(source, patches) {
  return [...patches].sort((a, b) => b.start - a.start).reduce((text, patch) =>
    text.slice(0, patch.start) + patch.text + text.slice(patch.end), source);
}
function assertTranslatedCopies(rendered, count, dx = 0.5, dy = -0.5) {
  for (let i = 0; i < count; i++) {
    const before = rendered.calls[i].geometry, after = rendered.calls[i + count].geometry;
    assert.ok(before && after, 'both copies remain editable');
    assert.ok(Math.abs(after.x - before.x - dx * rendered.calibration.unitX * 2.5) < 0.002, `shape ${i} x`);
    assert.ok(Math.abs(after.y - before.y + dy * rendered.calibration.unitY * 2.5) < 0.002, `shape ${i} y`);
    assert.ok(Math.abs(after.width - before.width) < 0.002, `shape ${i} width`);
    assert.ok(Math.abs(after.height - before.height) < 0.002, `shape ${i} height`);
  }
}

test('standalone deletion includes indentation, a semicolon and the line ending', () => {
  for (const eol of ['\n', '\r\n']) {
    const source = `before${eol}  circle(${eol}    (0, 0)${eol}  ); \t${eol}after`;
    const start = source.indexOf('circle'), end = source.indexOf(');') + 1;
    assert.equal(apply(source, [{ ...deletionRange(source, start, end), text: '' }]), `before${eol}after`);
  }
  for (const source of ['  circle((0, 0)) // keep\n', 'other(); circle((0, 0)); last()']) {
    const start = source.indexOf('circle'), end = source.indexOf('))', start) + 2;
    assert.deepEqual(deletionRange(source, start, end), { start, end });
  }
});

test('copy captures code independently of later edits and supports repeated paste', () => {
  const source = '#cetz.canvas({\n  circle((0, 0), radius: 1, name: "a")\n})';
  const clipboard = copyShapes(source, setup(source), [0]);
  const empty = '#cetz.canvas({\n})';
  const pasted = apply(empty, pasteShapes(empty, setup(empty), clipboard));
  assert.equal(apply(empty, pasteShapes(empty, setup(empty), clipboard.replace(/\n/g, '\r\n'))), pasted);
  assert.match(pasted, /circle\(\(0\.5, -0\.5\), radius: 1, name: "a"\)/);
  const again = apply(pasted, pasteShapes(pasted, setup(pasted), clipboard, 2));
  assert.match(again, /name: "a-2"/);
  assert.match(again, /circle\(\(1, -1\), radius: 1, name: "a-2"\)/);
  assert.match(apply(again, pasteShapes(again, setup(again), clipboard, 3)), /circle\(\(1\.5, -1\.5\), radius: 1, name: "a-3"\)/);
});

test('pasting shapes renames internal anchor references and preserves text and external references', async () => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({\n  import cetz.draw: *\n' +
    '  rect((0, 0), (2, 1), name: "a")\n' +
    '  content("a.north", [a])\n' +
    '  line("a.east", "a.west")\n})';
  const clipboard = copyShapes(source, setup(source), [0, 1, 2]);
  const pasted = apply(source, pasteShapes(source, setup(source), clipboard));
  assert.match(pasted, /name: "a-2"/);
  assert.match(pasted, /content\("a-2.north", \[a\]\)/);
  assert.match(pasted, /line\("a-2.east", "a-2.west"\)/);
  const external = copyShapes(source, setup(source), [1]);
  const externalPaste = apply(source, pasteShapes(source, setup(source), external));
  assert.match(externalPaste, /content\(\(rel: \(0\.5, -0\.5\), to: "a.north"\), \[a\]\)/);
  const rendered = await renderEditable(pasted, setup(pasted).canvas, path.resolve('examples/basic.typ'));
  assertTranslatedCopies(rendered, 3);
  const renderedExternal = await renderEditable(externalPaste, setup(externalPaste).canvas, path.resolve('examples/basic.typ'));
  const original = renderedExternal.calls[1].geometry, copied = renderedExternal.calls[3].geometry;
  assert.ok(Math.abs(copied.x - original.x - renderedExternal.calibration.unitX * 1.25) < 0.002);
  assert.ok(Math.abs(copied.y - original.y - renderedExternal.calibration.unitY * 1.25) < 0.002);
});

test('copying a group and its selected children pastes each child once with matching qualified names', async () => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({\n  import cetz.draw: *\n' +
    '  group({\n    circle((0, 0), radius: 1, name: "a")\n    content("a.center", [a])\n  }, name: "g")\n' +
    '  line("g.a.east", "g.a.west")\n})';
  const rendered = setup(source);
  const clipboard = copyShapes(source, rendered, rendered.calls.map((_, index) => index));
  const pasted = apply(source, pasteShapes(source, rendered, clipboard));
  assert.equal((pasted.match(/circle\(/g) || []).length, 2);
  assert.match(pasted, /name: "g-2"/);
  assert.match(pasted, /content\("a-2.center", \[a\]\)/);
  assert.match(pasted, /line\("g-2.a-2.east", "g-2.a-2.west"\)/);
  const next = await renderEditable(pasted, setup(pasted).canvas, path.resolve('examples/basic.typ'));
  assertTranslatedCopies(next, rendered.calls.length);
});

test('copy and paste offset rotated shapes in world coordinates and preserve multiline calls', async () => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *;\n  scope({ rotate(30deg, origin: (0, 0)); circle((0, 0),\n    radius: 1, name: "a") })\n})';
  const clipboard = copyShapes(source, setup(source), [0]);
  const pasted = apply(source, pasteShapes(source, setup(source), clipboard));
  assert.match(pasted, /rotate\(30deg, origin: \(0, 0\)\); circle\(\([\d.-]+, [\d.-]+\),\n\s+radius: 1, name: "a-2"\)/);
  assertTranslatedCopies(await renderEditable(pasted, setup(pasted).canvas, path.resolve('examples/basic.typ')), 1);
  assert.throws(() => pasteShapes(source, setup(source), 'unrelated clipboard text'), /Copy CeTZ shapes/);
});

test('paste offsets mixed coordinates, relative corners, anchors, transforms and compound paths once', async () => {
  const source = '#import "@preview/cetz:0.5.2"\n#let p = (3, 2)\n#cetz.canvas({ import cetz.draw: *;\n' +
    'anchor("origin", (0, 0))\n' +
    'rect((0.13, 0.17), (rel: (2, 1)), name: "r")\n' +
    'line("r.east", (5, 0))\n' +
    'content(p, [Text])\n' +
    'line((1, 2), ((), "|-", (5, 0)))\n' +
    'line((1, 2), (rel: (2, 1)))\n' +
    'scope({ translate(x: 1, y: 2)\nscale(x: 2, y: 1)\ncircle((0, 0), radius: 1) })\n' +
    'compound-path({ rect((6, 0), (7, 1)); circle((6.5, 0.5), radius: 0.1) })\n})';
  const rendered = setup(source);
  const clipboard = copyShapes(source, rendered, rendered.calls.map((_, index) => index));
  const pasted = apply(source, pasteShapes(source, rendered, clipboard));
  assert.match(pasted, /rect\(\(0\.63, -0\.33\), \(rel: \(2, 1\)\), name: "r-2"\)/);
  const next = await renderEditable(pasted, setup(pasted).canvas, path.resolve('examples/basic.typ'));
  assertTranslatedCopies(next, rendered.calls.length);
});

test('deleting adjacent rendered shapes removes their complete lines without overlapping patches', async () => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({\n  import cetz.draw: *\n' +
    '  circle((0, 0), radius: 1)\n  circle((3, 0), radius: 1)\n  circle((6, 0), radius: 1)\n})';
  const rendered = await renderEditable(source, setup(source).canvas, path.resolve('examples/basic.typ'));
  const xml = rendered.xml.replace(/<mxCell id="cetz-edit-[01]"[\s\S]*?<\/mxCell>/g, '');
  const patches = patchesFromEditable(source, rendered, xml, readAllCells);
  assert.equal(patches.length, 2);
  assert.equal(apply(source, patches), source.replace('  circle((0, 0), radius: 1)\n  circle((3, 0), radius: 1)\n', ''));
});

test('all newly added shapes paste with an offset and retain their editable geometry', async () => {
  const { SHAPES } = require('../src/templates');
  const names = new Set(['polygon', 'circle-through', 'arc-through', 'bezier-through', 'boolean']);
  for (const shape of SHAPES.filter(shape => names.has(shape.label))) {
    const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *\n' + shape.call + '\n})';
    const original = setup(source);
    const next = apply(source, pasteShapes(source, original, copyShapes(source, original, [0])));
    const rendered = await renderEditable(next, setup(next).canvas, path.resolve('examples/basic.typ'));
    assert.equal(rendered.calls.length, 2, shape.label);
    assertTranslatedCopies(rendered, 1);
  }
});
