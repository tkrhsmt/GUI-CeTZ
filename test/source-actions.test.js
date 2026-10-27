'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { locateCanvases } = require('../src/scanner');
const { locateEditableCalls } = require('../src/advanced');
const { sourceAction, sourceActionPatches } = require('../src/source-actions');
const path = require('node:path');
const { renderEditable } = require('../src/advanced');
const { patchesFromEditable } = require('../src/advanced');
const { readAllCells } = require('../src/drawio');

function setup(source) {
  const canvas = locateCanvases(source)[0];
  return { canvas, calls: locateEditableCalls(source, canvas) };
}
function apply(source, patches) {
  return patches.sort((a, b) => b.start - a.start)
    .reduce((text, patch) => text.slice(0, patch.start) + patch.text + text.slice(patch.end), source);
}

test('selection uses the latest notification without swallowing edit actions', () => {
  const marker = (action, indices, token) => ({ cell: { parent: '1', style:
    `cetzAction=${action};cetzTargets=${indices};cetzActionToken=${token};` } });
  const cells = new Map([
    ['a', marker('select', '0', 'first')],
    ['b', marker('select', '1,2', 'last')]
  ]);
  assert.deepEqual(sourceAction(cells, new Map()).indices, [1, 2]);
  cells.set('c', marker('rotate', '1', 'edit'));
  assert.equal(sourceAction(cells, new Map()).action, 'rotate');
  assert.deepEqual(sourceAction(cells, new Map(), new Set(['first', 'last', 'edit'])), null);
});

test('duplicate copies selected literal shapes with offsets and unique names', () => {
  const source = '#cetz.canvas({\n  import cetz.draw: *\n  rect((0, 0), (2, 1), name: "box")\n  circle((3, 1), radius: 1)\n})';
  const next = apply(source, sourceActionPatches(source, setup(source),
    { action: 'duplicate', indices: [0, 1] }));
  assert.match(next, /rect\(\(0\.5, -0\.5\),\s*\(2\.5, 0\.5\), name: "box-2"\)/);
  assert.match(next, /circle\(\(3\.5, 0\.5\), radius: 1\)/);
  assert.match(next, /rect\(\(0, 0\), \(2, 1\), name: "box"\)/);
});

test('reorder swaps only adjacent safe calls', () => {
  const source = '#cetz.canvas({\n  import cetz.draw: *\n  rect((0, 0), (2, 1))\n  circle((3, 1))\n})';
  const next = apply(source, sourceActionPatches(source, setup(source),
    { action: 'forward', indices: [0] }));
  assert.ok(next.indexOf('circle((3, 1))') < next.indexOf('rect((0, 0), (2, 1))'));
  const withState = source.replace('  circle', '  translate(x: 1)\n  circle');
  assert.throws(() => sourceActionPatches(withState, setup(withState),
    { action: 'forward', indices: [0] }), /statement/);
});

test('source action recognizes only new selection markers', () => {
  const cells = new Map([['marker', { cell: { parent: '1', style:
    'cetzAction=duplicate;cetzTargets=1,2;cetzActionToken=unique;' } }]]);
  assert.deepEqual(sourceAction(cells, new Map()),
    { id: 'marker', action: 'duplicate', key: 'unique', indices: [1, 2] });
  assert.equal(sourceAction(cells, new Map(), new Set(['unique'])), null);
  const exportCell = new Map([['export', { cell: { parent: '1', style:
    'cetzAction=export;cetzActionToken=save;' } }]]);
  assert.deepEqual(sourceAction(exportCell, new Map()),
    { id: 'export', action: 'export', key: 'save', indices: [] });
});

test('connects two shapes through named CeTZ anchors', async () => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({\n  import cetz.draw: *\n' +
    '  rect((0, 0), (2, 1))\n  rect((4, 0), (6, 1))\n})';
  const rendered = setup(source);
  rendered.calls[0].geometry = { x: 0, y: 0, width: 100, height: 50 };
  rendered.calls[1].geometry = { x: 200, y: 0, width: 100, height: 50 };
  const next = apply(source, sourceActionPatches(source, rendered,
    { action: 'connect-elbow', indices: [0, 1] }));
  assert.match(next, /name: "shape-1"/);
  assert.match(next, /name: "shape-2"/);
  assert.match(next, /line\("shape-1\.east", .*"shape-2\.west".*mark: \(end: ">"\)\)/);
  await renderEditable(next, locateCanvases(next)[0], path.join(__dirname, '../examples/basic.typ'));
});

test('groups adjacent shapes, keeps child calls editable, and ungroups them', async () => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({\n  import cetz.draw: *\n' +
    '  rect((0, 0), (2, 1))\n  circle((4, 0), radius: 1)\n})';
  const grouped = apply(source, sourceActionPatches(source, setup(source),
    { action: 'group', indices: [0, 1] }));
  assert.match(grouped, /group\(name: "group-1", \{/);
  const rendered = await renderEditable(grouped, locateCanvases(grouped)[0],
    path.join(__dirname, '../examples/basic.typ'));
  assert.deepEqual(rendered.calls.map(call => call.name), ['rect', 'circle', 'group']);
  assert.match(rendered.xml, /id="cetz-edit-2"/);
  const ungrouped = apply(grouped, sourceActionPatches(grouped, rendered,
    { action: 'ungroup', indices: [2] }));
  assert.doesNotMatch(ungrouped, /group\(/);
  assert.match(ungrouped, /rect\(\(0, 0\), \(2, 1\)\)/);
});

test('shares a line point through a named CeTZ anchor', async () => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({\n  import cetz.draw: *\n' +
    '  line((0, 0), (2, 1))\n})';
  const shared = apply(source, sourceActionPatches(source, setup(source),
    { action: 'share-point', indices: [0] }));
  assert.match(shared, /anchor\("P1", \(0, 0\)\)/);
  assert.match(shared, /line\("P1", \(2, 1\)\)/);
  const rendered = await renderEditable(shared, locateCanvases(shared)[0],
    path.join(__dirname, '../examples/basic.typ'));
  assert.deepEqual(rendered.calls.map(call => call.name), ['anchor', 'line']);
  assert.match(rendered.xml, /id="cetz-point-0-0"/);
  const moved = rendered.xml.replace(/(<mxCell id="cetz-point-0-0"[\s\S]*?<mxGeometry x=")([\d.]+)/,
    (_, prefix, x) => prefix + (Number(x) + rendered.calibration.unitX * 2.5));
  const next = apply(shared, patchesFromEditable(shared, rendered, moved, readAllCells));
  assert.match(next, /anchor\("P1", \(1, 0\)\)/);
  assert.match(next, /line\("P1", \(2, 1\)\)/);
});

test('rotates a polygon and scales a circle through literal arguments', () => {
  const source = '#cetz.canvas({\n  import cetz.draw: *\n' +
    '  polygon((0, 0), radius: 2)\n  circle((4, 0), radius: 1)\n})';
  const rendered = setup(source);
  rendered.calls[0].geometry = { x: 0, y: 0, width: 100, height: 100 };
  rendered.calls[1].geometry = { x: 200, y: 0, width: 100, height: 100 };
  rendered.calibration = { originX: 0, originY: 0, unitX: 20, unitY: 20 };
  const rotated = apply(source, sourceActionPatches(source, rendered,
    { action: 'rotate', value: '30', indices: [0] }));
  assert.match(rotated, /polygon\(\(0, 0\), radius: 2, angle: 30deg\)/);
  const scaled = apply(source, sourceActionPatches(source, rendered,
    { action: 'scale', value: '1.5', indices: [1] }));
  assert.match(scaled, /circle\(\([^)]*\), radius: 1\.5\)/);
});

test('reconnects a named straight connector end to another shape', async () => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({\n  import cetz.draw: *\n' +
    '  rect((0, 0), (2, 1), name: "a")\n' +
    '  rect((4, 0), (6, 1), name: "b")\n' +
    '  rect((8, 0), (10, 1), name: "c")\n' +
    '  line("a.east", "b.west")\n})';
  const rendered = await renderEditable(source, locateCanvases(source)[0],
    path.join(__dirname, '../examples/basic.typ'));
  const next = apply(source, sourceActionPatches(source, rendered,
    { action: 'reconnect', value: 'end', indices: [3, 2] }));
  assert.match(next, /line\("a\.east",\s*"c\.west"\)/);
  await renderEditable(next, locateCanvases(next)[0], path.join(__dirname, '../examples/basic.typ'));
});

test('reconnects an elbow while keeping its bend', async () => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({\n  import cetz.draw: *\n' +
    '  rect((0, 0), (2, 1), name: "a")\n' +
    '  rect((4, 0), (6, 1), name: "b")\n' +
    '  rect((8, 0), (10, 1), name: "c")\n' +
    '  line("a.east", ("a.east", "-|", ("a.east", 35%, "b.west")), ' +
    '("b.west", "-|", ("a.east", 35%, "b.west")), "b.west")\n})';
  const rendered = await renderEditable(source, locateCanvases(source)[0],
    path.join(__dirname, '../examples/basic.typ'));
  const next = apply(source, sourceActionPatches(source, rendered,
    { action: 'reconnect', value: 'end', indices: [3, 2] }));
  assert.match(next, /"a\.east", 35%, "c\.west"/);
  assert.doesNotMatch(next, /"b\.west"/);
  await renderEditable(next, locateCanvases(next)[0], path.join(__dirname, '../examples/basic.typ'));
});

test('rotates any literal shape with one editable scope and removes it at zero', async () => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({\n  import cetz.draw: *\n' +
    '  rect((0, 0), (2, 1))\n})';
  const first = await renderEditable(source, locateCanvases(source)[0],
    path.join(__dirname, '../examples/basic.typ'));
  const rotated = apply(source, sourceActionPatches(source, first,
    { action: 'rotate', value: '30', indices: [0] }));
  assert.match(rotated, /scope\(\{ rotate\(30deg, origin: \(1, 0\.5\)\); rect/);
  const second = await renderEditable(rotated, locateCanvases(rotated)[0],
    path.join(__dirname, '../examples/basic.typ'));
  assert.equal(second.calls[0].rotation.angle, 30);
  assert.ok(second.calls[0].geometry.width > first.calls[0].geometry.width);
  const reset = apply(rotated, sourceActionPatches(rotated, second,
    { action: 'rotate', value: '0', indices: [0] }));
  assert.doesNotMatch(reset, /scope\(/);
  assert.match(reset, /rect\(\(0, 0\), \(2, 1\)\)/);
});

test('rotated shape edits retain usable geometry controls', async () => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({\n  import cetz.draw: *\n' +
    '  line((0, 0), (2, 1), stroke: 1pt + black)\n})';
  const file = path.join(__dirname, '../examples/basic.typ');
  const first = await renderEditable(source, locateCanvases(source)[0], file);
  const rotated = apply(source, sourceActionPatches(source, first,
    { action: 'rotate', value: '30', indices: [0] }));
  const rendered = await renderEditable(rotated, locateCanvases(rotated)[0], file);
  const cells = readAllCells(rendered.xml);
  assert.equal(cells.has('cetz-rotate-0'), false);
  assert.doesNotMatch(cells.get('cetz-edit-0').cell.style, /movable=0|resizable=0/);
  assert.doesNotMatch(cells.get('cetz-point-0-0').cell.style, /movable=0/);
  const move = (id, dx, dy) => rendered.xml.replace(
    new RegExp(`(<mxCell id="${id}"[\\s\\S]*?<mxGeometry x=")([^"]+)(" y=")([^"]+)`),
    (_, a, x, b, y) => a + (+x + dx) + b + (+y + dy));
  const moved = apply(rotated, patchesFromEditable(rotated, rendered,
    move('cetz-edit-0', 20, 0), readAllCells));
  assert.match(moved, /scope\(\{ rotate\(30deg/);
  assert.doesNotMatch(moved, /line\(\(0, 0\), \(2, 1\)/);
  await renderEditable(moved, locateCanvases(moved)[0], file);
  const pointMoved = apply(rotated, patchesFromEditable(rotated, rendered,
    move('cetz-point-0-0', 20, 0), readAllCells));
  assert.match(pointMoved, /scope\(\{ rotate\(30deg/);
  await renderEditable(pointMoved, locateCanvases(pointMoved)[0], file);
  const resizedXml = rendered.xml.replace(
    /(<mxCell id="cetz-edit-0"[\s\S]*?<mxGeometry[^>]*?width=")([^"]+)/,
    (_, prefix, width) => prefix + (+width + 20));
  const resized = apply(rotated, patchesFromEditable(rotated, rendered, resizedXml, readAllCells));
  assert.match(resized, /scope\(\{ rotate\(30deg/);
  await renderEditable(resized, locateCanvases(resized)[0], file);
  const styledXml = rendered.xml.replace(
    /(<mxCell id="cetz-edit-0"[^>]*?)cetzStrokeColor=#000000;/,
    '$1cetzStrokeColor=#ff0000;');
  const styled = apply(rotated, patchesFromEditable(rotated, rendered, styledXml, readAllCells));
  assert.match(styled, /scope\(\{ rotate\(30deg/);
  assert.match(styled, /stroke: \(paint: rgb\("#ff0000"\), thickness: 1pt\)/);
  await renderEditable(styled, locateCanvases(styled)[0], file);
  const scaled = apply(rotated, sourceActionPatches(rotated, rendered,
    { action: 'scale', value: '1.5', indices: [0] }));
  assert.match(scaled, /scope\(\{ rotate\(30deg/);
  await renderEditable(scaled, locateCanvases(scaled)[0], file);
});

test('a rotated shape can still be duplicated and grouped', async () => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({\n  import cetz.draw: *\n' +
    '  scope({ rotate(30deg, origin: (1, 0.5)); rect((0, 0), (2, 1), name: "a") })\n' +
    '  circle((4, 1), radius: 1)\n})';
  const file = path.join(__dirname, '../examples/basic.typ');
  const rendered = await renderEditable(source, locateCanvases(source)[0], file);
  const duplicated = apply(source, sourceActionPatches(source, rendered,
    { action: 'duplicate', indices: [0] }));
  assert.match(duplicated, /rotate\(30deg[\s\S]*name: "a-2"/);
  await renderEditable(duplicated, locateCanvases(duplicated)[0], file);
  const grouped = apply(source, sourceActionPatches(source, rendered,
    { action: 'group', indices: [0, 1] }));
  assert.match(grouped, /group\(name: "group-1"[\s\S]*rotate\(30deg/);
  await renderEditable(grouped, locateCanvases(grouped)[0], file);
});

test('shared points can be created and detached inside a rotated shape', async () => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({\n  import cetz.draw: *\n' +
    '  scope({ rotate(30deg, origin: (1, 0.5)); line((0, 0), (2, 1)) })\n})';
  const file = path.join(__dirname, '../examples/basic.typ');
  const rendered = await renderEditable(source, locateCanvases(source)[0], file);
  const shared = apply(source, sourceActionPatches(source, rendered,
    { action: 'share-point', indices: [0] }));
  assert.match(shared, /anchor\("P1", \(0, 0\)\)/);
  assert.match(shared, /rotate\(30deg[\s\S]*line\("P1", \(2, 1\)\)/);
  const next = await renderEditable(shared, locateCanvases(shared)[0], file);
  const line = next.calls.findIndex(call => call.name === 'line');
  const detached = apply(shared, sourceActionPatches(shared, next,
    { action: 'detach-point', indices: [line] }));
  assert.match(detached, /rotate\(30deg[\s\S]*line\(\(0, 0\), \(2, 1\)\)/);
  await renderEditable(detached, locateCanvases(detached)[0], file);
});

test('automatically shares coincident literal coordinates across selected calls', async () => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({\n  import cetz.draw: *\n' +
    '  line((0, 0), (2, 1))\n  circle((0, 0), radius: 1)\n})';
  const next = apply(source, sourceActionPatches(source, setup(source),
    { action: 'auto-share', indices: [0, 1] }));
  assert.match(next, /anchor\("P1", \(0, 0\)\)/);
  assert.match(next, /line\("P1", \(2, 1\)\)/);
  assert.match(next, /circle\("P1", radius: 1\)/);
  await renderEditable(next, locateCanvases(next)[0], path.join(__dirname, '../examples/basic.typ'));
});

test('groups separated named shapes and rewrites external anchor references', async () => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({\n  import cetz.draw: *\n' +
    '  rect((0, 0), (2, 1), name: "a")\n' +
    '  circle((3, 0), radius: 1)\n' +
    '  rect((6, 0), (8, 1), name: "b")\n' +
    '  line("a.east", "b.west")\n})';
  const grouped = apply(source, sourceActionPatches(source, setup(source),
    { action: 'group', indices: [0, 2] }));
  assert.match(grouped, /group\(name: "group-1", \{[\s\S]*name: "a"[\s\S]*name: "b"/);
  assert.ok(grouped.indexOf('circle(') > grouped.indexOf('group('));
  assert.match(grouped, /line\("group-1\.a\.east", "group-1\.b\.west"\)/);
  const rendered = await renderEditable(grouped, locateCanvases(grouped)[0],
    path.join(__dirname, '../examples/basic.typ'));
  const groupIndex = rendered.calls.findIndex(call => call.name === 'group');
  const ungrouped = apply(grouped, sourceActionPatches(grouped, rendered,
    { action: 'ungroup', indices: [groupIndex] }));
  assert.match(ungrouped, /line\("a\.east", "b\.west"\)/);
  await renderEditable(ungrouped, locateCanvases(ungrouped)[0],
    path.join(__dirname, '../examples/basic.typ'));
  const dependent = source.replace('circle((3, 0), radius: 1)',
    'circle((3, 0), radius: 1, name: "middle")')
    .replace('rect((6, 0), (8, 1), name: "b")',
      'rect("middle.east", (rel: (2, 1)), name: "b")');
  assert.throws(() => sourceActionPatches(dependent, setup(dependent),
    { action: 'group', indices: [0, 2] }), /depends on a definition/);
  const withComment = source.replace('  line("a.east", "b.west")',
    '  // "a.east" explains the first endpoint\n  line("a.east", "b.west")');
  const groupedComment = apply(withComment, sourceActionPatches(withComment, setup(withComment),
    { action: 'group', indices: [0, 2] }));
  assert.match(groupedComment, /\/\/ "a\.east" explains/);
});

test('outline reorder moves shapes in source order and protects named dependencies', () => {
  const source = '#cetz.canvas({\n  import cetz.draw: *\n' +
    '  rect((0, 0), (2, 1))\n  circle((3, 0))\n  line((4, 0), (5, 0))\n})';
  const moved = apply(source, sourceActionPatches(source, setup(source),
    { action: 'move-before', indices: [2, 0] }));
  assert.ok(moved.indexOf('line(') < moved.indexOf('rect('));
  const dependent = source.replace('rect((0, 0), (2, 1))', 'rect((0, 0), (2, 1), name: "a")')
    .replace('circle((3, 0))', 'circle("a.east")');
  assert.throws(() => sourceActionPatches(dependent, setup(dependent),
    { action: 'move-after', indices: [0, 1] }), /anchor reference/);
  const shared = '#cetz.canvas({\n  import cetz.draw: *\n' +
    '  anchor("P", (0, 0))\n  line("P", (2, 0))\n})';
  assert.throws(() => sourceActionPatches(shared, setup(shared),
    { action: 'move-after', indices: [0, 1] }), /anchor reference/);
});

test('property actions rename and detach a shared CeTZ anchor', async () => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({\n  import cetz.draw: *\n' +
    '  anchor("P", (1, 2))\n  line("P", (3, 2))\n})';
  const renamed = apply(source, sourceActionPatches(source, setup(source),
    { action: 'rename-anchor', value: 'Q', indices: [0] }));
  assert.match(renamed, /anchor\("Q", \(1, 2\)\)/);
  assert.match(renamed, /line\("Q", \(3, 2\)\)/);
  const detached = apply(renamed, sourceActionPatches(renamed, setup(renamed),
    { action: 'detach-point', indices: [1] }));
  assert.match(detached, /line\(\(1, 2\), \(3, 2\)\)/);
  await renderEditable(detached, locateCanvases(detached)[0],
    path.join(__dirname, '../examples/basic.typ'));
});

test('connector properties choose explicit CeTZ anchor sides', async () => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({\n  import cetz.draw: *\n' +
    '  rect((0, 0), (2, 1), name: "a")\n  rect((4, 0), (6, 1), name: "b")\n})';
  const rendered = await renderEditable(source, locateCanvases(source)[0],
    path.join(__dirname, '../examples/basic.typ'));
  const next = apply(source, sourceActionPatches(source, rendered,
    { action: 'connect-elbow', value: 'south-north', indices: [0, 1] }));
  assert.match(next, /line\("a\.south"/);
  assert.match(next, /"b\.north"/);
  await renderEditable(next, locateCanvases(next)[0],
    path.join(__dirname, '../examples/basic.typ'));
});

test('layer property moves a shape to the front', () => {
  const source = '#cetz.canvas({\n  import cetz.draw: *\n' +
    '  rect((0, 0), (2, 1))\n  circle((3, 0))\n  line((4, 0), (5, 0))\n})';
  const next = apply(source, sourceActionPatches(source, setup(source),
    { action: 'front', indices: [0] }));
  assert.ok(next.indexOf('rect(') > next.indexOf('line('));
});
