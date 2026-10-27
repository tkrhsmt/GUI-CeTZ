'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { bindScene, sceneRevision, sourceIndices } = require('../src/scene');
const { renderEditable, patchesFromEditable } = require('../src/advanced');
const { parseCanvas } = require('../src/diagram');
const { readAllCells } = require('../src/drawio');

const file = path.resolve('examples/basic.typ');
const render = source => renderEditable(source, parseCanvas(source).canvas, file);
const apply = (source, patches) => [...patches].sort((a, b) => b.start - a.start).reduce((text, patch) =>
  text.slice(0, patch.start) + patch.text + text.slice(patch.end), source);
function remove(xml, id) { return xml.replace(new RegExp('<mxCell id="' + id + '"[\\s\\S]*?</mxCell>'), ''); }

test('structural edits allocate fresh IDs and subsequent edits target the correct surviving call', async () => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *;\n' +
    'circle((0, 0), radius: 1)\ncircle((3, 0), radius: 0.5)\ncircle((6, 0), radius: 1)\n})';
  const session = {}, before = await render(source);
  const oldXml = bindScene(session, source, before.xml, before);
  const deleted = remove(oldXml, 'cetz-edit-1');
  const remaining = apply(source, patchesFromEditable(source, before, deleted, readAllCells));
  const next = await render(remaining);
  const xml = bindScene(session, remaining, next.xml, next);
  const oldIds = new Set([...readAllCells(oldXml).keys()].filter(id => /^cetz-(edit|render|point|guide)-/.test(id)));
  for (const id of readAllCells(xml).keys()) assert.ok(!oldIds.has(id), 'structural edits never reuse a previous shape ID');
  assert.notEqual(sceneRevision(xml), sceneRevision(oldXml));
  assert.deepEqual(sourceIndices(next, next.cellIds), [0, 1]);
  assert.throws(() => sourceIndices(next, [1]), /no longer exists/);
  const id = next.cellIds[1], unit = next.calibration.unitX * 2.5;
  const movedXml = xml.replace(new RegExp('(<mxCell id="cetz-edit-' + id + '"[\\s\\S]*?<mxGeometry x=")([\\d.-]+)'),
    (_, prefix, x) => prefix + (+x + unit));
  const moved = apply(remaining, patchesFromEditable(remaining, next, movedXml, readAllCells));
  assert.match(moved, /circle\(\(0, 0\), radius: 1\)/);
  assert.match(moved, /circle\(\(7, 0\), radius: 1\)/);
  assert.doesNotMatch(moved, /radius: 0\.5/);
  const last = await render(moved);
  const lastXml = bindScene(session, moved, last.xml, last);
  assert.deepEqual(last.cellIds, next.cellIds, 'ordinary movement keeps the surviving IDs stable');
  assert.notEqual(sceneRevision(lastXml), sceneRevision(xml), 'a newer source snapshot invalidates old saves');
});

test('point, guide and group references follow the new scene IDs', async () => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *;\n' +
    'circle((6, 0), radius: 1)\ngroup({ bezier((0, 0), (3, 0), (1, 1), (2, 1)) }, name: "g")\n})';
  const session = {}, first = await render(source);
  const old = bindScene(session, source, first.xml, first);
  const updated = apply(source, patchesFromEditable(source, first, remove(old, 'cetz-edit-0'), readAllCells));
  const next = await render(updated), xml = bindScene(session, updated, next.xml, next);
  const cells = readAllCells(xml);
  for (const [index, call] of next.calls.entries()) {
    const id = next.cellIds[index];
    assert.ok(cells.has('cetz-edit-' + id));
    for (let j = 0; j < (call.points || []).length; j++) assert.ok(cells.has(`cetz-point-${id}-${j}`));
    if (call.group) assert.match(cells.get('cetz-edit-' + id).cell.style,
      new RegExp('cetzGroup=' + next.cellIds[next.calls.indexOf(call.group)] + ';'));
  }
  for (const [id, item] of cells) {
    if (/^cetz-render-/.test(id) && item.cell.parent !== '1') assert.ok(cells.has(item.cell.parent));
  }
  assert.deepEqual(patchesFromEditable(updated, next, xml, readAllCells), []);
});

test('deleting an outer group and a nested child produces no overlapping source deletions', async () => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({\nimport cetz.draw: *\n' +
    'group({\n  group({ circle((0, 0), radius: 1) }, name: "inner")\n}, name: "outer")\n' +
    'circle((6, 0), radius: 1)\n})';
  const rendered = await render(source);
  const outer = rendered.calls.findIndex(call => call.name === 'group' && !call.group);
  const child = rendered.calls.findIndex(call => call.name === 'circle' && call.group);
  const xml = remove(remove(rendered.xml, `cetz-edit-${outer}`), `cetz-edit-${child}`);
  const patches = patchesFromEditable(source, rendered, xml, readAllCells);
  assert.equal(patches.length, 1);
  const updated = apply(source, patches);
  assert.doesNotMatch(updated, /group\(/);
  assert.match(updated, /circle\(\(6, 0\), radius: 1\)/);
  assert.equal((await render(updated)).calls.length, 1);
});
