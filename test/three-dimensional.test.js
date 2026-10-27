'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { locateCanvases } = require('../src/scanner');
const { is3DCanvas, locate3DCalls } = require('../src/three-dimensional');
const { renderEditable, patchesFromEditable } = require('../src/advanced');
const { renderCanvas } = require('../src/preview');
const { readAllCells } = require('../src/drawio');
const { propertyModel, propertyPatches } = require('../src/properties');
const { sourceActionPatches } = require('../src/source-actions');
const { bindScene } = require('../src/scene');
const file = path.resolve('examples/three-dimensional.typ');
const document = (body, version = '0.5.2') => `#import "@preview/cetz:${version}"\n#cetz.canvas({ import cetz.draw: *\n${body}\n})`;
const canvas = source => locateCanvases(source)[0];
const render = source => renderEditable(source, canvas(source), file);
const apply = (source, patches) => patches.sort((a, b) => b.start - a.start)
  .reduce((s, p) => s.slice(0, p.start) + p.text + s.slice(p.end), source);
const action = (call, index, values) => ({ action: 'properties', indices: [index],
  value: encodeURIComponent(JSON.stringify({ base: call.call, values })) });
function svgFrom(rendered) {
  return decodeURIComponent(/image=data:image\/svg\+xml,([^;]+)/.exec(readAllCells(rendered.xml).get('cetz-preview-image').cell.style)[1]);
}
// The splitter can duplicate empty grouping elements at layer boundaries.
// Removing these identity groups preserves all transforms, defs and paint order.
const normalized = svg => svg.replace(/<g>|<\/g>/g, '');

test('3D detection ignores comments, strings and content but finds projections and XYZ tuples/dictionaries', () => {
  for (const body of ['ortho({})', 'on-xy({})', 'on-xz({})', 'on-zy({})', 'perspective({})',
    'line((1,2,3), (0,0,0))', 'line((0,0), (rel: (1,2,3)))', 'set-viewport((0,0),(1,1),bounds:(1,2,3))', 'circle((x: 1, y: 2, z: 3))', 'translate(z: 2)', 'rotate(x: 45deg)', 'rotate(pitch: 20deg)', 'on-yz({})', 'set-transform(matrix)'])
    assert.equal(is3DCanvas(document(body), canvas(document(body))), true, body);
  for (const body of ['// ortho({})\nrect((0,0), (1,1))', '/* (1,2,3) */ circle((0,0))',
    'content((0,0), "ortho({})")', 'content((0,0), [ortho((1,2,3))])', 'line((0,0), (1,1))', 'hobby((0,0), (1,1), ta: (1.2,0.8,1.5))'])
    assert.equal(is3DCanvas(document(body), canvas(document(body))), false, body);
});

test('3D discovery respects nested scopes, named bodies, unknown functions and dynamic code', () => {
  const source = document('ortho(body: { scope({ group(name: "g", { on-zy({line((0,0,0), (1,2,3))}) }) }) })\n' +
    'for i in range(3) { circle((i,0,1)) }\ncustom({rect((0,0),(1,1))})\ncontent((0,0,0), [line((1,2),(3,4))])');
  const calls = locate3DCalls(source, canvas(source));
  assert.deepEqual(calls.map(c => c.name), ['line', 'on-zy', 'group', 'scope', 'ortho', 'content']);
  assert.equal(calls[0].group, calls[1]);
  for (const call of calls) assert.equal(source.slice(call.start, call.end), call.call);
});

for (const version of ['0.4.2', '0.5.2']) test(`3D ${version}: exact rendering, depth order, planes, nested transforms, text and positive bounds`, async () => {
  const source = document(`ortho(x: 25deg, y: 40deg, z: 10deg, sorted: true, {
    on-xy(z: -1, { rect((0,0), (2,1), fill: red) })
    on-xz(y: 1, { circle((0,0), radius: 0.7, fill: blue) })
    ${version === '0.4.2' ? 'on-yz' : 'on-zy'}(x: 2, { rect((0,0), (2,1), fill: green) })
    scope({translate(z: 0.5); scale(x: 2, y: 1, z: 1); group(name: "g", {
      line((0,0,0), (1,2,3), stroke: 2pt + black)
      bezier((0,0,0), (1,2,3), (0,1,1), (1,1,2))
    })})
    content((0,1,2), [3D])
  })`, version);
  const rendered = await render(source);
  assert.equal(rendered.mode, '3d');
  assert.equal(normalized(svgFrom(rendered)), normalized(await renderCanvas(source, canvas(source), file)));
  assert.doesNotMatch(svgFrom(rendered), /stroke="#010204"/);
  assert.doesNotMatch(rendered.xml, /cetz-axis-x|cetz-axis-y|cetz-point-|cetzOriginX=/);
  assert.match(rendered.xml, /grid="0"/);
  for (const call of rendered.calls) {
    assert.ok(call.projectedBounds, call.name);
    assert.ok(Object.values(call.geometry).every(Number.isFinite), call.name);
    assert.ok(call.geometry.width > 0 && call.geometry.height > 0, call.name);
  }
  assert.deepEqual(patchesFromEditable(source, rendered, rendered.xml, readAllCells), []);
});

test('culling preserves Outline-only objects and painting order without inserting pre-projection markers', async () => {
  const source = document('ortho(cull-face: "cw", {\nrect((0,0), (1,1), fill: red)\n' +
    'line((0,0,0),(2,1,2))\nanchor("P", (1,2,3))\n})');
  const rendered = await render(source);
  assert.equal(normalized(svgFrom(rendered)), normalized(await renderCanvas(source, canvas(source), file)));
  const hidden = rendered.calls.filter(call => !call.projectedBounds);
  assert.ok(hidden.some(call => call.name === 'anchor'));
  hidden.forEach(call => {
    const index = rendered.calls.indexOf(call);
    const cell = readAllCells(rendered.xml).get(`cetz-edit-${index}`);
    assert.equal(cell.cell.visible, '0');
    assert.match(cell.cell.style, /cetzProperties=/);
  });
});

test('perspective keeps the installed CeTZ projection output authoritative', async () => {
  const source = document('perspective(distance: 8, { on-xy(z: -1, {rect((0,0),(1,1),fill:red)})\nline((0,0,0),(2,1,3)) })');
  const rendered = await render(source);
  assert.equal(normalized(svgFrom(rendered)), normalized(await renderCanvas(source, canvas(source), file)));
});

test('Properties preserve XYZ precision, comments and nested projection bodies', async () => {
  const source = document('ortho(x: 25deg, {\non-xz(y: 2, {\nline(/* keep */ (1,2,0), (3,4,5)) // tail\n})\n})');
  const rendered = await render(source);
  const line = rendered.calls[0];
  assert.deepEqual(propertyModel(line).fields.find(f => f.key === '$1').point, [3,4,5]);
  const next = apply(source, propertyPatches(rendered, action(line, 0, { '$1': '(3.012345678, 4, -2)' })));
  assert.match(next, /line\(\/\* keep \*\/ \(1,2,0\), \(3.012345678, 4, -2\)\) \/\/ tail/);
  await render(next);
  const ortho = rendered.calls.at(-1), index = rendered.calls.length - 1;
  const fields = propertyModel(ortho).fields;
  assert.ok(fields.some(f => f.key === 'x'));
  assert.ok(!fields.some(f => f.key[0] === '$' || f.key === 'body' || f.key === 'fill'));
  const changed = apply(source, sourceActionPatches(source, rendered, action(ortho, index, { x: '45deg', sorted: 'false' })));
  assert.match(changed, /ortho\(x: 45deg/);
  assert.ok(changed.includes(line.call));
  assert.throws(() => propertyPatches(rendered, action(ortho, index, { '$0': '{}' })), /nested shapes/);
  assert.throws(() => propertyPatches(rendered, { ...action(line, 0, { '$0': '(0,0,0)' }), value: encodeURIComponent(JSON.stringify({base:'stale',values:{}})) }), /changed/);
});

test('3D native saves reject geometry edits and invalid additions and 2D source operations, including bound scenes', async () => {
  const source = document('ortho({line((0,0,0), (1,2,3))})');
  const rendered = await render(source);
  rendered.xml = bindScene({}, source, rendered.xml, rendered);
  assert.deepEqual(patchesFromEditable(source, rendered, rendered.xml, readAllCells), []);
  const item = readAllCells(rendered.xml).get('cetz-edit-0');
  const moved = rendered.xml.replace(`x="${item.geometry.x}"`, `x="${+item.geometry.x + 1}"`);
  assert.throws(() => patchesFromEditable(source, rendered, moved, readAllCells), /3D/);
  const removed = rendered.xml.replace(/<mxCell id="cetz-edit-0"[^>]*>.*?<\/mxCell>/, '');
  const deletions=patchesFromEditable(source, rendered, removed, readAllCells);
  assert.equal(deletions.length,1); assert.equal(deletions[0].text,'');
  const added = rendered.xml.replace('</root>', '<mxCell id="new" style="cetzTemplate=circle;" vertex="1" parent="1"><mxGeometry width="1" height="1" as="geometry"/></mxCell></root>');
  assert.throws(() => patchesFromEditable(source, rendered, added, readAllCells), /3D/);
  for (const name of ['rotate','scale','group','duplicate','connect-straight','forward','auto-share'])
    assert.throws(() => sourceActionPatches(source, rendered, { action: name, indices:[0] }), /3D/);
});
