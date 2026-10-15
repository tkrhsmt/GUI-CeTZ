'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { locateCanvases } = require('../src/scanner');
const { parseCanvas } = require('../src/diagram');
const { xmlForDiagram, patchesFromXml, readCells, readAllCells } = require('../src/drawio');
const { renderCanvas, imageDiagram } = require('../src/preview');
const { renderEditable, patchesFromEditable, locateEditableCalls } = require('../src/advanced');
const { renderDiagram } = require('../src/render-diagram');
const { MARK_NAMES, sideValues, sideEdits } = require('../src/marks');
const { SHAPES, insertionFor, templateInsertions } = require('../src/templates');
const { historyAction } = require('../src/history');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

function apply(text, patches) {
  return [...patches].sort((a, b) => b.start - a.start).reduce((s, p) => s.slice(0, p.start) + p.text + s.slice(p.end), text);
}
function snappedMove(rendered, pixels) {
  return Math.round(pixels / (rendered.calibration.unitX * 2.5) * 4) / 4 * rendered.calibration.unitX * 2.5;
}
function snappedHandle(rendered, geometry, dx, dy) {
  const c = rendered.calibration;
  const x = Math.round((+geometry.x + 7 + dx - c.originX) / (c.unitX * 2.5) * 4) / 4;
  const y = Math.round((c.originY - +geometry.y - 7 - dy) / (c.unitY * 2.5) * 4) / 4;
  return { x: c.originX + x * c.unitX * 2.5 - 7,
    y: c.originY - y * c.unitY * 2.5 - 7 };
}
const source = `#import "@preview/cetz:0.4.2"
#let accent = blue.lighten(80%)
#cetz.canvas({
  import cetz.draw: *
  // Main node
  rect((0, 0), (3, 2), fill: accent)
  circle((1.5, 1), radius: 0.2, fill: red)
  line((3, 1), (5, 1), stroke: 1pt + black)
})`;

test('locates real canvases, ignoring strings and nested comments', () => {
  const text = '"cetz.canvas({})" // cetz.canvas({})\n/* x /* cetz.canvas({}) */ y */\n' + source;
  assert.equal(locateCanvases(text).length, 1);
  assert.equal(parseCanvas(text).elements.length, 3);
});
test('finds canvases with length and other canvas options', () => {
  const text = '#cetz.canvas(length: 5mm, { import cetz.draw: *; circle((0, 0)) }, padding: 1)';
  const canvases = locateCanvases(text);
  assert.equal(canvases.length, 1);
  assert.equal(canvases[0].advancedOptions, true);
  assert.match(text.slice(canvases[0].bodyStart, canvases[0].bodyEnd), /circle/);
  assert.ok(parseCanvas(text).unsupported.length);
});
test('exports three shape cells and edits only coordinate literals', () => {
  const model = parseCanvas(source);
  const xml = xmlForDiagram(source, model);
  assert.equal(readCells(xml).size, 3);
  const moved = xml.replace('x="160" y="240" width="240" height="160"', 'x="240" y="240" width="240" height="160"');
  const next = apply(source, patchesFromXml(source, model, moved));
  assert.match(next, /rect\(\(1, 0\), \(4, 2\), fill: accent\)/);
  assert.match(next, /\/\/ Main node/);
  assert.match(next, /circle\(\(1\.5, 1\), radius: 0\.2, fill: red\)/);
  assert.equal(patchesFromXml(next, parseCanvas(next), xmlForDiagram(next, parseCanvas(next))).length, 0);
});
test('does not edit expression-based shapes', () => {
  const text = '#cetz.canvas({ let x = 3; rect((x, 0), (4, 2)); circle((1, 1), radius: 1) })';
  const model = parseCanvas(text);
  assert.equal(model.elements.length, 1);
  assert.ok(model.unsupported.length >= 1);
});
test('does not crash when a shape has spread coordinates', () => {
  const text = '#cetz.canvas({ let corners = ((0, 0), (2, 2)); rect(..corners); circle((1, 1)) })';
  const model = parseCanvas(text);
  assert.equal(model.elements.length, 1);
  assert.equal(model.elements[0].kind, 'circle');
  assert.ok(model.unsupported.some(item => item.startsWith('rect at ')));
});
test('accepts compressed Draw.io diagrams', () => {
  const xml = xmlForDiagram(source, parseCanvas(source));
  const inner = /<mxGraphModel[\s\S]*<\/mxGraphModel>/.exec(xml)[0];
  const encoded = zlib.deflateRawSync(Buffer.from(encodeURIComponent(inner))).toString('base64');
  assert.equal(readCells(`<mxfile><diagram>${encoded}</diagram></mxfile>`).size, 3);
});
test('deletes only the selected linked CeTZ call', () => {
  const model = parseCanvas(source);
  const xml = xmlForDiagram(source, model);
  const removed = xml.replace(/<mxCell id="cetz-0-1"[\s\S]*?<\/mxCell>/, '');
  const updated = apply(source, patchesFromXml(source, model, removed));
  assert.doesNotMatch(updated, /circle\(\(1\.5, 1\)/);
  assert.match(updated, /rect\(\(0, 0\)/);
  assert.match(updated, /line\(\(3, 1\)/);
});
test('moves a circle and a free line without changing surrounding Typst', () => {
  const model = parseCanvas(source);
  const xml = xmlForDiagram(source, model);
  const movedCircle = xml.replace('x="264" y="304" width="32" height="32"', 'x="344" y="224" width="32" height="32"');
  const movedLine = movedCircle.replace('x="400" y="320" as="sourcePoint"', 'x="480" y="320" as="sourcePoint"');
  const next = apply(source, patchesFromXml(source, model, movedLine));
  assert.match(next, /circle\(\(2\.5, 2\), radius: 0\.2, fill: red\)/);
  assert.match(next, /line\(\(4, 1\), \(5, 1\), stroke: 1pt \+ black\)/);
  assert.match(next, /fill: accent/);
});
test('edits a relative rectangle without changing its coordinate model', () => {
  const text = '#cetz.canvas({ rect((1, 2), (rel: (3, 4))) })';
  const model = parseCanvas(text), xml = xmlForDiagram(text, model);
  const moved = xml.replace('x="240" y="-80" width="240" height="320"', 'x="320" y="-80" width="240" height="320"');
  const next = apply(text, patchesFromXml(text, model, moved));
  assert.match(next, /rect\(\(2, 2\), \(rel: \(3, 4\)\)\)/);
});
test('supports ellipse radii and line waypoints', () => {
  const text = '#cetz.canvas({ circle((0, 0), radius: (1, 0.5)) line((0, 0), (1, 1), (2, 0)) })';
  const model = parseCanvas(text), xml = xmlForDiagram(text, model);
  assert.equal(model.elements.length, 2);
  assert.match(xml, /width="160" height="80"/);
  const moved = xml.replace('<mxPoint x="240" y="320"/>', '<mxPoint x="320" y="320"/>');
  const next = apply(text, patchesFromXml(text, model, moved));
  assert.match(next, /line\(\(0, 0\), \(2, 1\), \(2, 0\)\)/);
});
test('moves and edits plain content text', () => {
  const text = '#cetz.canvas({ content((1, 2), [Hello]) })';
  const model = parseCanvas(text), xml = xmlForDiagram(text, model);
  const moved = xml.replace('value="Hello"', 'value="World"').replace('x="180" y="222"', 'x="260" y="142"');
  const next = apply(text, patchesFromXml(text, model, moved));
  assert.match(next, /content\(\(2, 3\), \[World\]\)/);
});
test('converts a new Draw.io rectangle into a CeTZ call', () => {
  const text = '#cetz.canvas({ import cetz.draw: * })';
  const model = parseCanvas(text), xml = xmlForDiagram(text, model);
  const extra = '<mxCell id="new1" value="" style="rounded=0;fillColor=#ff0000;" vertex="1" parent="1"><mxGeometry x="160" y="240" width="160" height="80" as="geometry"/></mxCell>';
  const changed = xml.replace('</root>', extra + '</root>');
  const patches = patchesFromXml(text, model, changed);
  assert.equal(patches.needsRefresh, true);
  assert.match(apply(text, patches), /rect\(\(0, 1\), \(2, 2\), fill: rgb\("#ff0000"\)\)/);
});
test('changes a literal fill color while preserving other arguments', () => {
  const text = '#cetz.canvas({ rect((0, 0), (2, 1), fill: red, name: "node") })';
  const model = parseCanvas(text), xml = xmlForDiagram(text, model);
  const changed = xml.replace('fillColor=#ff0000', 'fillColor=#00ff00');
  const next = apply(text, patchesFromXml(text, model, changed));
  assert.match(next, /fill: rgb\("#00ff00"\), name: "node"/);
});
test('respects literal translate and scale while editing source coordinates', () => {
  const text = '#cetz.canvas({ translate(x: 2, y: 1) scale(2) rect((0, 0), (1, 1)) })';
  const model = parseCanvas(text), xml = xmlForDiagram(text, model);
  assert.match(xml, /x="320" y="160" width="160" height="160"/);
  const moved = xml.replace('x="320" y="160" width="160" height="160"', 'x="480" y="160" width="160" height="160"');
  const next = apply(text, patchesFromXml(text, model, moved));
  assert.match(next, /rect\(\(1, 0\), \(2, 1\)\)/);
});
test('hides shapes following unsupported transforms', () => {
  const text = '#cetz.canvas({ rect((0,0),(1,1)) rotate(45deg) rect((2,2),(3,3)) })';
  const model = parseCanvas(text);
  assert.equal(model.elements.length, 1);
  assert.ok(model.unsupported.length >= 2);
});
test('round trips line arrowheads as CeTZ marks', () => {
  const text = '#cetz.canvas({ line((0, 0), (2, 0), mark: (end: ">")) })';
  const model = parseCanvas(text), xml = xmlForDiagram(text, model);
  assert.match(xml, /endArrow=classic/);
  assert.equal(patchesFromXml(text, model, xml).length, 0);
  const changed = xml.replace('startArrow=none;', 'startArrow=diamond;');
  assert.match(apply(text, patchesFromXml(text, model, changed)), /mark: \(start: "<>", end: ">"\)/);
});
test('CeTZ mark names and shorthands resolve without losing other mark options', () => {
  assert.equal(MARK_NAMES.length, 16);
  for (const name of MARK_NAMES)
    assert.deepEqual(sideValues(`(start: "${name}", end: "${name}")`),
      { start: name, end: name });
  assert.deepEqual(sideValues('(symbol: ">", end: "<>", length: 2pt)'),
    { start: 'triangle', end: 'diamond' });
  assert.equal(sideEdits('(symbol: ">", end: "<>", length: 2pt)', { start: 'bar' }),
    '(symbol: ">", end: "<>", length: 2pt, start: "bar")');
});
test('all built-in marks can be selected on editable line endpoints', async () => {
  const lines = MARK_NAMES.map((name, index) =>
    `line((0, ${index}), (2, ${index}), mark: (start: "${name}", end: "${name}"))`).join('\n');
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *\n' + lines + '\n})';
  const file = path.resolve('examples/advanced.typ');
  const rendered = await renderEditable(source, parseCanvas(source).canvas, file);
  for (let i = 0; i < MARK_NAMES.length; i++) {
    const style = readAllCells(rendered.xml).get(`cetz-edit-${i}`).cell.style;
    assert.match(style, new RegExp(`cetzStartMark=${MARK_NAMES[i]};`));
    assert.match(style, new RegExp(`cetzEndMark=${MARK_NAMES[i]};`));
  }
  const changed = rendered.xml.replace('cetzStartMark=triangle;', 'cetzStartMark=curved-stealth;');
  const updated = apply(source, patchesFromEditable(source, rendered, changed, readAllCells));
  assert.match(updated, /line\(\(0, 0\), \(2, 0\), mark: \(start: "curved-stealth", end: "triangle"\)\)/);
  const refreshed = await renderEditable(updated, parseCanvas(updated).canvas, file);
  assert.match(readAllCells(refreshed.xml).get('cetz-edit-0').cell.style,
    /cetzStartMark=curved-stealth;/);
});
test('line mark edits preserve the other endpoint and mark options', async () => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *\n' +
    'line((0, 0), (2, 0))\n' +
    'line((0, 1), (2, 1), mark: (symbol: ">", length: 2pt))\n})';
  const file = path.resolve('examples/advanced.typ');
  const rendered = await renderEditable(source, parseCanvas(source).canvas, file);
  const changed = rendered.xml.replace('cetzEndMark=none;', 'cetzEndMark=parenthesis;')
    .replace('cetzStartMark=triangle;', 'cetzStartMark=bar;');
  const updated = apply(source, patchesFromEditable(source, rendered, changed, readAllCells));
  assert.match(updated, /line\(\(0, 0\), \(2, 0\), mark: \(end: "parenthesis"\)\)/);
  assert.match(updated, /mark: \(symbol: ">", length: 2pt, start: "bar"\)/);
  await renderEditable(updated, parseCanvas(updated).canvas, file);
});
test('turns a new rectangle label into separate CeTZ content', () => {
  const text = '#cetz.canvas({ import cetz.draw: * })';
  const xml = xmlForDiagram(text, parseCanvas(text));
  const extra = '<mxCell id="new2" value="Node" style="rounded=0;" vertex="1" parent="1"><mxGeometry x="160" y="240" width="160" height="80" as="geometry"/></mxCell>';
  const next = apply(text, patchesFromXml(text, parseCanvas(text), xml.replace('</root>', extra + '</root>')));
  assert.match(next, /rect\(\(0, 1\), \(2, 2\)\)/);
  assert.match(next, /content\(\(1, 1\.5\), \[Node\]\)/);
});
test('adds typed labels to an existing rectangle', () => {
  const text = '#cetz.canvas({ rect((0, 0), (2, 1)) })';
  const model = parseCanvas(text), xml = xmlForDiagram(text, model);
  const patches = patchesFromXml(text, model, xml.replace('id="cetz-0-0" value=""', 'id="cetz-0-0" value="Node"'));
  assert.equal(patches.needsRefresh, true);
  assert.match(apply(text, patches), /content\(\(1, 0\.5\), \[Node\]\)/);
});
test('shows and edits a rounded rectangle', () => {
  const text = '#cetz.canvas({ rect((0, 0), (2, 1), radius: 25%) })';
  const model = parseCanvas(text), xml = xmlForDiagram(text, model);
  assert.match(xml, /rounded=1;arcSize=25/);
  const changed = xml.replace('arcSize=25', 'arcSize=35');
  assert.match(apply(text, patchesFromXml(text, model, changed)), /radius: 35%/);
});
test('rejects Draw.io styling that would not be written to Typst', () => {
  const text = '#cetz.canvas({ rect((0, 0), (2, 1)) })';
  const model = parseCanvas(text), xml = xmlForDiagram(text, model);
  assert.throws(() => patchesFromXml(text, model, xml.replace('rounded=0;', 'rounded=0;shadow=1;')), /shadow/);
  assert.throws(() => patchesFromXml(text, model, xml.replace('rounded=0;', 'ellipse;')), /kind/);
});
test('round trips literal stroke thickness and dash', () => {
  const text = '#cetz.canvas({ line((0, 0), (2, 0), stroke: (paint: red, thickness: 2pt, dash: "dashed")) })';
  const model = parseCanvas(text), xml = xmlForDiagram(text, model);
  assert.match(xml, /strokeColor=#ff0000;strokeWidth=5\.6444;dashed=1;dashPattern=3 3;/);
  const changed = xml.replace('strokeWidth=5.6444', 'strokeWidth=11.2889').replace('dashPattern=3 3', 'dashPattern=1 2');
  assert.match(apply(text, patchesFromXml(text, model, changed)), /stroke: \(paint: rgb\("#ff0000"\), thickness: 4pt, dash: "dotted"\)/);
});
test('renders complex CeTZ operations using Typst as a locked image', async () => {
  const text = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *\n  set-style(stroke: (paint: blue, thickness: 2pt, dash: "dashed"))\n  group({ rect((0, 0), (2, 1)); arc((1, 1), start: 0deg, stop: 180deg) })\n})';
  const diagram = parseCanvas(text);
  assert.ok(diagram.unsupported.length >= 2);
  const svg = await renderCanvas(text, diagram.canvas, path.resolve('examples/extended.typ'));
  const xml = imageDiagram(svg);
  assert.match(xml, /<diagram id="cetz-canvas" name="CeTZ preview">/);
  assert.match(xml, /id="preview-image"/);
  assert.match(xml, /<mxGraphModel grid="1"/);
  assert.doesNotMatch(svg, /<path fill="#ffffff" fill-rule="nonzero" d="M 0 0v /);
  assert.match(xml, /movable=0;resizable=0;editable=0/);
  assert.match(xml, /data:image\/svg\+xml,/);
});
test('routes the requested advanced draw operations through Typst', () => {
  const names = ['arc', 'mark', 'n-star', 'grid', 'rect-around', 'bezier', 'hobby', 'catmull',
    'merge-path', 'compound-path', 'boolean', 'hide', 'intersections', 'group', 'anchor', 'scope',
    'copy-anchors', 'set-ctx', 'get-ctx', 'for-each-anchor', 'on-layer', 'floating', 'set-style',
    'fill', 'stroke', 'register-mark', 'set-transform', 'rotate', 'set-origin', 'move-to', 'set-to',
    'set-viewport', 'ortho', 'perspective', 'on-xy', 'on-xz', 'on-zy', 'register-coordinate-resolver'];
  for (const name of names) {
    const model = parseCanvas(`#cetz.canvas({ ${name}() })`);
    assert.ok(model.unsupported.length, `${name} must use Typst rendering`);
  }
});
test('inserts and renders every advanced shape template', async () => {
  const file = path.resolve('examples/advanced.typ');
  for (const shape of SHAPES) {
    const original = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({\n})';
    const insertion = insertionFor(original, parseCanvas(original).canvas, shape.call);
    const source = original.slice(0, insertion.offset) + insertion.text + original.slice(insertion.offset);
    assert.match(source, /import cetz\.draw: \*/, shape.label);
    const diagram = parseCanvas(source);
    assert.ok(diagram.unsupported.length, `${shape.label} must use an exact Typst preview`);
    const xml = imageDiagram(await renderCanvas(source, diagram.canvas, file));
    assert.match(xml, /id="preview-image"/, shape.label);
  }
});
test('inserts into an imported canvas without duplicating the draw import', () => {
  const source = '#cetz.canvas({\n  import cetz.draw: *\n  rect((0, 0), (1, 1))\n})';
  const insertion = insertionFor(source, parseCanvas(source).canvas, SHAPES[0].call);
  const updated = source.slice(0, insertion.offset) + insertion.text + source.slice(insertion.offset);
  assert.equal((updated.match(/import cetz\.draw: \*/g) || []).length, 1);
  assert.match(updated, /rect\(\(0, 0\), \(1, 1\)\)[\s\S]*arc\(\(0, 0\)/);
});
test('inserts a CeTZ menu template from a basic Draw.io canvas', () => {
  const text = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({\n  rect((0, 0), (1, 1))\n})';
  const model = parseCanvas(text);
  const cell = '<mxCell id="menu-arc" value="arc" style="rounded=0;cetzTemplate=arc;" vertex="1" parent="1"><mxGeometry x="500" y="500" width="120" height="80" as="geometry"/></mxCell>';
  const xml = xmlForDiagram(text, model).replace('</root>', cell + '</root>');
  const patches = patchesFromXml(text, model, xml);
  assert.equal(patches.needsRefresh, true);
  const updated = apply(text, patches);
  assert.match(updated, /import cetz\.draw: \*/);
  assert.match(updated, /arc\(\(0, 0\), start: 30deg/);
  assert.doesNotMatch(updated, /cetzTemplate/);
});
test('rejects unknown CeTZ menu templates', () => {
  const text = '#cetz.canvas({})', canvas = parseCanvas(text).canvas;
  const cells = new Map([['cell', { cell: { parent: '1', style: 'cetzTemplate=unknown;' } }]]);
  assert.throws(() => templateInsertions(text, canvas, cells), /Unknown CeTZ shape template/);
});
test('inserts basic CeTZ primitives from a rendered preview palette', () => {
  const text = '#cetz.canvas({ import cetz.draw: *; arc((0, 0), start: 0deg, stop: 90deg) })';
  const canvas = parseCanvas(text).canvas;
  for (const name of ['rect', 'circle', 'content', 'line']) {
    const cells = new Map([['new', { cell: { parent: '1', style: `cetzTemplate=${name};` } }]]);
    const updated = apply(text, templateInsertions(text, canvas, cells));
    assert.match(updated, new RegExp(`\\b${name}\\(`));
  }
});
test('primitive-only and mixed canvases use the same Typst-backed Draw.io cells', async () => {
  const prefix = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *\n';
  const primitive = prefix + 'rect((0, 0), (2, 1), fill: red)\n' +
    'circle((4, 0), radius: 1)\nline((0, 2), (2, 2))\n})';
  const mixed = primitive.replace('\n})', '\narc((6, 0), start: 30deg, stop: 150deg)\n})');
  const file = path.resolve('examples/advanced.typ');
  assert.equal(parseCanvas(primitive).unsupported.length, 0);
  for (const source of [primitive, mixed]) {
    const result = await renderDiagram(source, parseCanvas(source).canvas, file);
    assert.ok(result.editable);
    assert.match(result.xml, /id="cetz-preview-background"/);
    assert.doesNotMatch(result.xml, /id="preview-image"|id="cetz-0-/);
    for (const index of [0, 1, 2]) assert.ok(readAllCells(result.xml).get(`cetz-edit-${index}`));
    const original = readAllCells(result.xml).get('cetz-edit-0').geometry;
    const moved = result.xml.replace(/(<mxCell id="cetz-edit-0"[\s\S]*?<mxGeometry x=")([\d.]+)/,
      (_, head, x) => head + (Number(x) + 20));
    const updated = apply(source, patchesFromEditable(source, result.editable, moved, readAllCells));
    assert.match(updated, /rect\(\([\d.]+, 0\),\s*\([\d.]+, 1\), fill: red\)/);
    const refreshed = await renderDiagram(updated, parseCanvas(updated).canvas, file);
    const after = readAllCells(refreshed.xml).get('cetz-edit-0').geometry;
    assert.ok(Math.abs(+after.x - +original.x - snappedMove(result.editable, 20)) < 0.5);
  }
});
test('renders a canvas inside a presentation block when its show rule creates multiple pages', async () => {
  const text = '#import "@preview/cetz:0.5.2"\n' +
    '#let slide(body) = body\n#show: it => { pagebreak(); it }\n' +
    '#slide[\n#cetz.canvas({ import cetz.draw: *; line((0, 0), (1, 1)) })\n]';
  const file = path.resolve('examples/advanced.typ');
  const rendered = await renderDiagram(text, parseCanvas(text).canvas, file);
  assert.ok(rendered.editable);
  assert.ok(readAllCells(rendered.xml).get('cetz-edit-0'));
});
test('renders slide-local overlay methods used inside a canvas', async () => {
  const text = '#import "@preview/cetz:0.5.2"\n' +
    '#let utils = (methods: self => (only: (range, body) => body))\n' +
    '#let slide(body) = body\n#show: it => { pagebreak(); it }\n' +
    '#slide[\n#let self = none\n#let (only) = utils.methods(self)\n' +
    '#cetz.canvas({ import cetz.draw: *; line((0, 0), (1, 1)); ' +
    'only("2-", { line((1, 1), (2, 2)) }) })\n]';
  const file = path.resolve('examples/advanced.typ');
  const rendered = await renderDiagram(text, parseCanvas(text).canvas, file);
  assert.ok(rendered.editable);
  assert.ok(readAllCells(rendered.xml).get('cetz-edit-0'));
});
test('renders a canvas used as a figure argument', async () => {
  const text = '#import "@preview/cetz:0.5.2"\n' +
    '#let accent = blue\n#figure(\n  cetz.canvas({\n' +
    '    import cetz.draw: *\n    rect((0, 0), (2, 1), fill: accent)\n' +
    '  }),\n  caption: [Example],\n)';
  const file = path.resolve('examples/basic.typ');
  const rendered = await renderDiagram(text, parseCanvas(text).canvas, file);
  assert.ok(rendered.editable);
  assert.ok(readAllCells(rendered.xml).get('cetz-edit-0'));
});
test('Draw.io grid lines and source coordinates follow CeTZ quarter units', async () => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *\n' +
    'rect((0, 0), (2, 1))\n})';
  const file = path.resolve('examples/advanced.typ');
  const rendered = await renderDiagram(source, parseCanvas(source).canvas, file);
  const calibration = rendered.editable.calibration;
  const gridSize = Number(/<mxGraphModel[^>]*gridSize="([^"]+)"/.exec(rendered.xml)[1]);
  assert.ok(Math.abs(gridSize * 4 - calibration.unitX * 2.5) < 0.0001);
  assert.ok(Math.abs(calibration.originX / (gridSize * 4) - Math.round(calibration.originX / (gridSize * 4))) < 0.00001);
  assert.ok(Math.abs(calibration.originY / (gridSize * 4) - Math.round(calibration.originY / (gridSize * 4))) < 0.00001);
  const background = readAllCells(rendered.xml).get('cetz-preview-background').geometry;
  const backgroundStyle = readAllCells(rendered.xml).get('cetz-preview-background').cell.style;
  assert.match(backgroundStyle, new RegExp(`cetzOriginX=${calibration.originX};`));
  assert.match(backgroundStyle, new RegExp(`cetzOriginY=${calibration.originY};`));
  assert.ok(Math.abs(Number(/cetzUnitX=([\d.]+);/.exec(backgroundStyle)[1]) - calibration.unitX * 2.5) < 0.00001);
  assert.ok(Math.abs(Number(/cetzUnitY=([\d.]+);/.exec(backgroundStyle)[1]) - calibration.unitY * 2.5) < 0.00001);
  for (const id of ['cetz-axis-x', 'cetz-axis-y', 'cetz-axis-x-label',
    'cetz-axis-y-label', 'cetz-origin-dot', 'cetz-axis-origin-label'])
    assert.ok(readAllCells(rendered.xml).get(id), id);
  assert.match(rendered.xml, new RegExp(`<mxCell id="cetz-axis-x"[\\s\\S]*?<mxPoint x="[^"]+" y="${calibration.originY}" as="sourcePoint"`));
  assert.match(rendered.xml, new RegExp(`<mxCell id="cetz-axis-y"[\\s\\S]*?<mxPoint x="${calibration.originX}" y="[^"]+" as="sourcePoint"`));
  assert.match(rendered.xml, /id="cetz-axis-origin-label" value="\(0, 0\)"/);
  assert.ok(Math.abs(+background.x + calibration.zero.x * 2.5 - calibration.originX) < 0.0001);
  assert.ok(Math.abs(+background.y + calibration.zero.y * 2.5 - calibration.originY) < 0.0001);
  const rectStyle = readAllCells(rendered.xml).get('cetz-edit-0').cell.style;
  const anchorY = Number(/cetzSnapOffsetY=([\d.]+);/.exec(rectStyle)[1]);
  assert.ok(Math.abs(anchorY - calibration.unitY * 2.5) < 0.0001);
  const moved = rendered.xml.replace(/(<mxCell id="cetz-edit-0"[\s\S]*?<mxGeometry x=")([\d.]+)/,
    (_, head, x) => head + (Number(x) + gridSize));
  const updated = apply(source, patchesFromEditable(source, rendered.editable, moved, readAllCells));
  assert.match(updated, /rect\(\(0\.25, 0\),\s*\(2\.25, 1\)\)/);
  assert.doesNotMatch(updated, /rect\([^\n]*\d+\.\d{3,}/);
});
test('a repeated history marker does not undo a following shape resize', async () => {
  const file = path.resolve('examples/advanced.typ');
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *\n' +
    'rect((0, 0), (2, 1))\n})';
  const first = await renderDiagram(source, parseCanvas(source).canvas, file);
  const marker = '<mxCell id="old-undo" style="opacity=0;cetzAction=undo;" vertex="1" parent="1">' +
    '<mxGeometry x="-1000" y="-1000" width="1" height="1" as="geometry"/></mxCell>';
  const moved = first.xml.replace(/(<mxCell id="cetz-edit-0"[\s\S]*?<mxGeometry x=")([\d.]+)/,
    (_, head, x) => head + (Number(x) + first.editable.calibration.gridSize));
  const afterMove = apply(source, patchesFromEditable(source, first.editable, moved, readAllCells));
  const second = await renderDiagram(afterMove, parseCanvas(afterMove).canvas, file);
  const resized = second.xml.replace(/(<mxCell id="cetz-edit-0"[\s\S]*?width=")([\d.]+)/,
    (_, head, width) => head + (Number(width) * 1.5)).replace('</root>', marker + '</root>');
  assert.equal(historyAction(readAllCells(resized), readAllCells(second.xml), new Set(['old-undo'])), null);
  const afterResize = apply(afterMove,
    patchesFromEditable(afterMove, second.editable, resized, readAllCells));
  assert.match(afterResize, /rect\(\(0\.25, 0\),\s*\(3\.25, 1\)\)/);
});
test('a changed Typst drawing updates its preview image cell during live merge', async () => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *\nline((0, 0), (2, 0))\n})';
  const file = path.resolve('examples/advanced.typ');
  const before = await renderEditable(source, parseCanvas(source).canvas, file);
  const step = before.calibration.unitX * 2.5 / 4;
  const dragged = before.xml.replace(/(<mxCell id="cetz-point-0-1"[\s\S]*?<mxGeometry x=")([\d.]+)/,
    (_, head, x) => head + (Number(x) + step));
  const afterSource = apply(source, patchesFromEditable(source, before, dragged, readAllCells));
  assert.match(afterSource, /line\(\(0, 0\),\s*\(2\.25, 0\)\)/);
  const after = await renderEditable(afterSource, parseCanvas(afterSource).canvas, file);
  assert.match(before.xml, /<diagram id="cetz-canvas" name="CeTZ shapes">/);
  assert.match(after.xml, /<diagram id="cetz-canvas" name="CeTZ shapes">/);
  const oldImage = readAllCells(before.xml).get('cetz-preview-image');
  const newImage = readAllCells(after.xml).get('cetz-preview-image');
  assert.ok(oldImage);
  assert.ok(newImage);
  assert.notEqual(oldImage.cell.style, newImage.cell.style);
  assert.ok(readAllCells(after.xml).get('cetz-preview-background'));
  const damaged = before.xml.replace('image=data:image/svg+xml,', 'image=data:image/svg+xml,broken');
  assert.throws(() => patchesFromEditable(source, before, damaged, readAllCells), /preview image/);
});
test('the preview expands when a control point moves beyond its old image bounds', async () => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *\nline((0, 0), (2, 0))\n})';
  const file = path.resolve('examples/advanced.typ');
  const before = await renderEditable(source, parseCanvas(source).canvas, file);
  const imageBefore = readAllCells(before.xml).get('cetz-preview-image').geometry;
  const endpointX = before.calibration.originX + 8 * before.calibration.unitX * 2.5 - 7;
  const dragged = before.xml.replace(/(<mxCell id="cetz-point-0-1"[\s\S]*?<mxGeometry x=")([\d.]+)/,
    (_, head) => head + endpointX);
  const afterSource = apply(source, patchesFromEditable(source, before, dragged, readAllCells));
  assert.match(afterSource, /line\(\(0, 0\),\s*\(8, 0\)\)/);
  const after = await renderEditable(afterSource, parseCanvas(afterSource).canvas, file);
  const cells = readAllCells(after.xml);
  const imageAfter = cells.get('cetz-preview-image').geometry;
  const pointAfter = cells.get('cetz-point-0-1').geometry;
  const pageWidth = Number(/pageWidth="([^"]+)"/.exec(after.xml)[1]);
  assert.ok(+imageAfter.width > +imageBefore.width);
  assert.ok(+pointAfter.x + 7 >= +imageAfter.x);
  assert.ok(+pointAfter.x + 7 <= +imageAfter.x + +imageAfter.width);
  assert.ok(pageWidth > +imageAfter.x + +imageAfter.width);
  const negativeSource = afterSource.replace('(8, 0)', '(-8, 8)');
  const negative = await renderEditable(negativeSource, parseCanvas(negativeSource).canvas, file);
  const negativeCells = readAllCells(negative.xml);
  const negativeImage = negativeCells.get('cetz-preview-image').geometry;
  const negativePoint = negativeCells.get('cetz-point-0-1').geometry;
  assert.ok(+negativeImage.x >= 160 && +negativeImage.y >= 160);
  assert.ok(+negativePoint.x >= 0 && +negativePoint.y >= 0);
  assert.ok(Number(/pageWidth="([^"]+)"/.exec(negative.xml)[1]) >
    +negativeImage.x + +negativeImage.width);
  assert.ok(Number(/pageHeight="([^"]+)"/.exec(negative.xml)[1]) >
    +negativeImage.y + +negativeImage.height);
});
test('an empty canvas uses the same coordinate grid and accepts a shape template', async () => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *\n})';
  const file = path.resolve('examples/advanced.typ');
  const rendered = await renderDiagram(source, parseCanvas(source).canvas, file);
  assert.deepEqual(rendered.editable.calls, []);
  assert.match(rendered.xml, /<mxGraphModel grid="1" gridSize="[\d.]+"/);
  const template = '<mxCell id="new-circle" value="" style="cetzTemplate=circle;" vertex="1" parent="1"><mxGeometry x="500" y="500" width="80" height="80" as="geometry"/></mxCell>';
  const inserted = rendered.xml.replace('</root>', template + '</root>');
  const updated = apply(source, patchesFromEditable(source, rendered.editable, inserted, readAllCells));
  assert.match(updated, /circle\(\(0, 0\), radius: 1\)/);
});
test('palette insertion regenerates the image and adds an editable shape', async () => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *\nline((0, 0), (2, 0))\n})';
  const file = path.resolve('examples/advanced.typ');
  const before = await renderEditable(source, parseCanvas(source).canvas, file);
  const template = '<mxCell id="palette-circle" value="" style="ellipse;cetzTemplate=circle;" vertex="1" parent="1"><mxGeometry x="500" y="500" width="80" height="80" as="geometry"/></mxCell>';
  const inserted = before.xml.replace('</root>', template + '</root>');
  const updated = apply(source, patchesFromEditable(source, before, inserted, readAllCells));
  assert.match(updated, /circle\(\(0, 0\), radius: 1\)/);
  const after = await renderEditable(updated, parseCanvas(updated).canvas, file);
  assert.ok(readAllCells(after.xml).get('cetz-edit-1'));
  assert.ok(readAllCells(after.xml).get('cetz-preview-image'));
  assert.notEqual(readAllCells(before.xml).get('cetz-preview-image').cell.style,
    readAllCells(after.xml).get('cetz-preview-image').cell.style);
  assert.equal(readAllCells(after.xml).has('palette-circle'), false);
});
test('the primitive example keeps relative rectangles and polygons editable', async () => {
  const file = path.resolve('examples/extended.typ');
  const source = fs.readFileSync(file, 'utf8');
  const result = await renderDiagram(source, parseCanvas(source).canvas, file);
  assert.deepEqual(result.editable.calls.map(call => call.name),
    ['rect', 'circle', 'line', 'content', 'polygon']);
  const cells = readAllCells(result.xml);
  assert.ok(cells.get('cetz-edit-0'));
  assert.ok(cells.get('cetz-edit-4'));
  const moved = result.xml.replace(/(<mxCell id="cetz-edit-0"[\s\S]*?<mxGeometry x=")([\d.]+)/,
    (_, head, x) => head + (Number(x) + 20));
  const updated = apply(source, patchesFromEditable(source, result.editable, moved, readAllCells));
  assert.match(updated, /rect\(\([\d.]+, 0\),\s*\(rel: \(3, 2\)\)/);
  assert.match(updated, /polygon\(\(6, 1\), 5, radius: 0\.8\)/);
  await renderDiagram(updated, parseCanvas(updated).canvas, file);
});
test('moves and deletes basic primitives in a Typst-rendered Draw.io preview', async () => {
  const file = path.resolve('examples/advanced.typ');
  const calls = ['rect((0, 0), (2, 1))', 'circle((0, 0), radius: 1)',
    'content((0, 0), [Text])', 'line((0, 0), (2, 0))'];
  for (const call of calls) {
    const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *\n' +
      'arc((0, 0), start: 0deg, stop: 90deg)\n' + call + '\n})';
    const rendered = await renderEditable(source, parseCanvas(source).canvas, file);
    const cell = readAllCells(rendered.xml).get('cetz-edit-1');
    assert.ok(cell, call);
    const moved = rendered.xml.replace(/(<mxCell id="cetz-edit-1"[\s\S]*?<mxGeometry x=")([\d.]+)/,
      (_, prefix, x) => prefix + (Number(x) + 20));
    const updated = apply(source, patchesFromEditable(source, rendered, moved, readAllCells));
    assert.doesNotMatch(updated, /scope\(\{/);
    const rerendered = await renderEditable(updated, parseCanvas(updated).canvas, file);
    const after = readAllCells(rerendered.xml).get('cetz-edit-1');
    assert.ok(Math.abs(Number(after.geometry.x) - Number(cell.geometry.x) - snappedMove(rendered, 20)) < 0.5, call);
    const resized = rendered.xml.replace(/(<mxCell id="cetz-edit-1"[\s\S]*?width=")([\d.]+)/,
      (_, prefix, width) => prefix + (Number(width) * 1.5));
    if (call.startsWith('content')) {
      assert.throws(() => patchesFromEditable(source, rendered, resized, readAllCells), /text size/);
    } else {
      const resizedSource = apply(source, patchesFromEditable(source, rendered, resized, readAllCells));
      if (call.startsWith('rect')) {
        const withEmptyUndo = resized.replace('</root>',
          '<mxCell id="empty-undo" style="opacity=0;cetzAction=undo;" vertex="1" parent="1">' +
          '<mxGeometry x="-1000" y="-1000" width="1" height="1" as="geometry"/></mxCell></root>');
        assert.equal(apply(source, patchesFromEditable(source, rendered, withEmptyUndo, readAllCells)),
          resizedSource);
      }
      assert.doesNotMatch(resizedSource, /scope\(\{/);
      if (call.startsWith('circle')) assert.match(resizedSource, /radius: \(1\.5, 1\)/);
      const resizedRender = await renderEditable(resizedSource, parseCanvas(resizedSource).canvas, file);
      const resizedCell = readAllCells(resizedRender.xml).get('cetz-edit-1');
      assert.ok(Math.abs(Number(resizedCell.geometry.width) - Number(cell.geometry.width) * 1.5) < 0.5, call);
    }
    const removed = rendered.xml.replace(/<mxCell id="cetz-edit-1"[\s\S]*?<\/mxCell>/, '');
    const deleted = apply(source, patchesFromEditable(source, rendered, removed, readAllCells));
    assert.doesNotMatch(deleted, new RegExp(call.split('(')[0] + '\\('), call);
  }
});
test('flattens an existing generated scope into literal circle arguments on edit', async () => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *\n' +
    'arc((0, 0), start: 0deg, stop: 90deg)\n' +
    'scope({\n  translate(x: 1, y: 2)\n  scale(x: 2, y: 2)\n  circle((0, 0), radius: 1)\n})\n})';
  const file = path.resolve('examples/advanced.typ');
  const rendered = await renderEditable(source, parseCanvas(source).canvas, file);
  const before = readAllCells(rendered.xml).get('cetz-edit-1');
  const moved = rendered.xml.replace(/(<mxCell id="cetz-edit-1"[\s\S]*?<mxGeometry x=")([\d.]+)/,
    (_, prefix, x) => prefix + (Number(x) + 20));
  const updated = apply(source, patchesFromEditable(source, rendered, moved, readAllCells));
  assert.doesNotMatch(updated, /scope\(\{|translate\(|scale\(/);
  assert.match(updated, /circle\(\([\d.]+, 2\), radius: 2\)/);
  const rerendered = await renderEditable(updated, parseCanvas(updated).canvas, file);
  const after = readAllCells(rerendered.xml).get('cetz-edit-1');
  assert.ok(Math.abs(Number(after.geometry.x) - Number(before.geometry.x) - snappedMove(rendered, 20)) < 0.5);
});
test('drags individual curve and line points by editing only their CeTZ coordinates', async () => {
  const file = path.resolve('examples/advanced.typ');
  const calls = [
    'bezier((0, 0), (2, 0), (0.5, 1), (1.5, 1))',
    'hobby((0, 0), (1, 1), (2, 0), (3, 1))',
    'catmull((0, 0), (1, 1), (2, 0), (3, 1))',
    'line((0, 0), (1, 1), (2, 0))'
  ];
  for (const call of calls) {
    const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *\n' +
      'arc((0, 0), start: 0deg, stop: 90deg)\n' + call + '\n})';
    const rendered = await renderEditable(source, parseCanvas(source).canvas, file);
    const cells = readAllCells(rendered.xml);
    const before = cells.get('cetz-point-1-2');
    assert.ok(before, call);
    if (call.startsWith('bezier')) {
      assert.ok(cells.get('cetz-guide-1-0'));
      assert.ok(cells.get('cetz-guide-1-1'));
    }
    const moved = rendered.xml.replace(/(<mxCell id="cetz-point-1-2"[\s\S]*?<mxGeometry x=")([\d.]+)(" y=")([\d.]+)/,
      (_, prefix, x, middle, y) => prefix + (Number(x) + 20) + middle + (Number(y) - 10));
    const patches = patchesFromEditable(source, rendered, moved, readAllCells);
    assert.equal(patches.length, 1, call);
    const updated = apply(source, patches);
    assert.doesNotMatch(updated, /scope\(\{/);
    assert.match(updated, /arc\(\(0, 0\), start: 0deg, stop: 90deg\)/);
    const rerendered = await renderEditable(updated, parseCanvas(updated).canvas, file);
    const afterCells = readAllCells(rerendered.xml);
    const after = afterCells.get('cetz-point-1-2');
    const target = snappedHandle(rendered, before.geometry, 20, -10);
    assert.ok(Math.abs(Number(after.geometry.x) - target.x) < 0.6, call);
    assert.ok(Math.abs(Number(after.geometry.y) - target.y) < 0.6, call);
    assert.equal(afterCells.get('cetz-point-1-0').geometry.x, cells.get('cetz-point-1-0').geometry.x, call);
    assert.throws(() => patchesFromEditable(source, rendered,
      rendered.xml.replace('id="cetz-point-1-2" value="" style=', 'id="cetz-point-1-2" value="changed" style='),
      readAllCells), /control points can only be moved/);
  }
});
test('editing a Bezier control point also removes an older generated scope', async () => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *\n' +
    'scope({\n  translate(x: 1, y: 2)\n  scale(x: 2, y: 2)\n' +
    '  bezier((0, 0), (2, 0), (0.5, 1), (1.5, 1))\n})\n})';
  const file = path.resolve('examples/advanced.typ');
  const rendered = await renderEditable(source, parseCanvas(source).canvas, file);
  const before = readAllCells(rendered.xml).get('cetz-point-0-2');
  const moved = rendered.xml.replace(/(<mxCell id="cetz-point-0-2"[\s\S]*?<mxGeometry x=")([\d.]+)/,
    (_, prefix, x) => prefix + (Number(x) + 20));
  const updated = apply(source, patchesFromEditable(source, rendered, moved, readAllCells));
  assert.doesNotMatch(updated, /scope\(\{|translate\(|scale\(/);
  const rerendered = await renderEditable(updated, parseCanvas(updated).canvas, file);
  const after = readAllCells(rerendered.xml).get('cetz-point-0-2');
  const target = snappedHandle(rendered, before.geometry, 20, 0);
  assert.ok(Math.abs(Number(after.geometry.x) - target.x) < 0.6);
});
test('arc position, center, and endpoint handles update the corresponding arguments', async () => {
  const file = path.resolve('examples/advanced.typ');
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *\n' +
    'arc((0, 0), start: 30deg, stop: 150deg, radius: 1)\n})';
  const rendered = await renderEditable(source, parseCanvas(source).canvas, file);
  const cells = readAllCells(rendered.xml);
  assert.ok(cells.get('cetz-point-0-0'));
  assert.ok(cells.get('cetz-point-0-1'));
  assert.ok(cells.get('cetz-point-0-2'));
  assert.match(cells.get('cetz-point-0-0').cell.style, /strokeColor=#2563eb/);
  assert.match(cells.get('cetz-point-0-1').cell.style, /strokeColor=#e28b23/);
  assert.match(cells.get('cetz-point-0-2').cell.style, /strokeColor=#e28b23/);
  assert.ok(cells.get('cetz-guide-0-0'));
  assert.ok(cells.get('cetz-guide-0-1'));
  for (const index of [0, 1, 2]) {
    const before = cells.get(`cetz-point-0-${index}`);
    const moved = rendered.xml.replace(new RegExp(`(<mxCell id="cetz-point-0-${index}"[\\s\\S]*?<mxGeometry x=")([\\d.]+)(" y=")([\\d.]+)`),
      (_, prefix, x, middle, y) => prefix + (Number(x) + 20) + middle + (Number(y) - 10));
    const updated = apply(source, patchesFromEditable(source, rendered, moved, readAllCells));
    assert.doesNotMatch(updated, /scope\(\{|translate\(|scale\(/);
    if (index === 0) assert.match(updated, /arc\(\([\d.]+, [\d.]+\), start: 30deg, stop: 150deg, radius: 1\)/);
    else if (index === 1) {
      assert.match(updated, /start: [\d.-]+deg, stop: 150deg/);
      assert.match(updated, /radius: [\d.]+/);
    } else {
      assert.match(updated, /start: 30deg, stop: [\d.-]+deg/);
      assert.match(updated, /radius: [\d.]+/);
    }
    const rerendered = await renderEditable(updated, parseCanvas(updated).canvas, file);
    const after = readAllCells(rerendered.xml).get(`cetz-point-0-${index}`);
    const target = snappedHandle(rendered, before.geometry, 20, -10);
    assert.ok(Math.abs(Number(after.geometry.x) - target.x) < 1, String(index));
    assert.ok(Math.abs(Number(after.geometry.y) - target.y) < 1, String(index));
  }
});
test('arc endpoint editing preserves an elliptical radius', async () => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *\n' +
    'arc((0, 0), start: 0deg, stop: 90deg, radius: (2, 1))\n})';
  const file = path.resolve('examples/advanced.typ');
  const rendered = await renderEditable(source, parseCanvas(source).canvas, file);
  const before = readAllCells(rendered.xml).get('cetz-point-0-2');
  const moved = rendered.xml.replace(/(<mxCell id="cetz-point-0-2"[\s\S]*?<mxGeometry x=")([\d.]+)/,
    (_, prefix, x) => prefix + (Number(x) + 20));
  const updated = apply(source, patchesFromEditable(source, rendered, moved, readAllCells));
  assert.match(updated, /radius: \([\d.]+, [\d.]+\)/);
  const rerendered = await renderEditable(updated, parseCanvas(updated).canvas, file);
  const after = readAllCells(rerendered.xml).get('cetz-point-0-2');
  const target = snappedHandle(rendered, before.geometry, 20, 0);
  assert.ok(Math.abs(Number(after.geometry.x) - target.x) < 1);
});
test('arc handles coincide with the anchors rendered by CeTZ', async () => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *\n' +
    'arc((0, 0), start: 30deg, stop: 150deg, radius: (2, 1), name: "a")\n' +
    'circle("a.arc-start", radius: 0.03, fill: rgb("#ff0000"), stroke: none)\n' +
    'circle("a.origin", radius: 0.03, fill: rgb("#00ff00"), stroke: none)\n' +
    'circle("a.arc-end", radius: 0.03, fill: rgb("#0000ff"), stroke: none)\n})';
  const rendered = await renderEditable(source, parseCanvas(source).canvas, path.resolve('examples/advanced.typ'));
  const cells = readAllCells(rendered.xml);
  for (const [index, fill] of ['#ff0000', '#00ff00', '#0000ff'].entries()) {
    const marker = new RegExp(`<path\\b[^>]*fill="${fill}"[^>]*>`).exec(rendered.calibration.svg)?.[0];
    assert.ok(marker, fill);
    const position = /transform="translate\(([^)]+)\)"/.exec(marker)[1].trim().split(/[\s,]+/).map(Number);
    const expectedX = rendered.calibration.originX + (position[0] + rendered.calibration.unitX * 0.03 - rendered.calibration.zero.x) * 2.5;
    const expectedY = rendered.calibration.originY + (position[1] + rendered.calibration.unitY * 0.03 - rendered.calibration.zero.y) * 2.5;
    const handle = cells.get(`cetz-point-0-${index}`).geometry;
    assert.ok(Math.abs(+handle.x + 7 - expectedX) < 0.1, `${fill} x`);
    assert.ok(Math.abs(+handle.y + 7 - expectedY) < 0.1, `${fill} y`);
  }
});
test('advanced shape palette settings update CeTZ stroke and fill arguments', async () => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *\n' +
    'arc((0, 0), start: 0deg, stop: 90deg, radius: 1)\n' +
    'circle((3, 0), radius: 1, fill: yellow)\n})';
  const file = path.resolve('examples/advanced.typ');
  const rendered = await renderEditable(source, parseCanvas(source).canvas, file);
  const arc = rendered.xml.replace('cetzStrokeColor=#000000;', 'cetzStrokeColor=#ff0000;')
    .replace('cetzStrokeWidth=1;', 'cetzStrokeWidth=2;')
    .replace('cetzDash=solid;', 'cetzDash=dashed;');
  const stroked = apply(source, patchesFromEditable(source, rendered, arc, readAllCells));
  assert.match(stroked, /arc\([^\n]+stroke: \(paint: rgb\("#ff0000"\), thickness: 2pt, dash: "dashed"\)\)/);
  assert.doesNotMatch(stroked, /scope\(\{|translate\(|scale\(/);
  const rerendered = await renderEditable(stroked, parseCanvas(stroked).canvas, file);
  const filled = rerendered.xml.replace('cetzFillColor=#ffff00;', 'cetzFillColor=#00aa00;');
  const updated = apply(stroked, patchesFromEditable(stroked, rerendered, filled, readAllCells));
  assert.match(updated, /circle\(\(3, 0\), radius: 1, fill: rgb\("#00aa00"\)\)/);
  await renderEditable(updated, parseCanvas(updated).canvas, file);
});
test('moves each advanced CeTZ shape independently in Draw.io', async () => {
  const file = path.resolve('examples/advanced.typ');
  for (const shape of SHAPES) {
    const source = `#import "@preview/cetz:0.5.2"\n#cetz.canvas({\nimport cetz.draw: *\n${shape.call}\n})`;
    const rendered = await renderEditable(source, parseCanvas(source).canvas, file);
    assert.equal(rendered.calls.length, 1, shape.label);
    assert.match(rendered.xml, /<mxGraphModel grid="1"/);
    const before = readAllCells(rendered.xml).get('cetz-edit-0');
    assert.ok(before, shape.label);
    const edited = rendered.xml.replace(/(<mxCell id="cetz-edit-0"[\s\S]*?<mxGeometry x=")([\d.]+)/,
      (_, prefix, x) => prefix + (Number(x) + 10));
    const patches = patchesFromEditable(source, rendered, edited, readAllCells);
    assert.equal(patches.length, 1, shape.label);
    const updated = apply(source, patches);
    assert.doesNotMatch(updated, /scope\(\{/, shape.label);
    assert.equal(locateEditableCalls(updated, parseCanvas(updated).canvas).length, 1, shape.label);
    const rerendered = await renderEditable(updated, parseCanvas(updated).canvas, file);
    const after = readAllCells(rerendered.xml).get('cetz-edit-0');
    assert.ok(Math.abs(Number(after.geometry.x) - Number(before.geometry.x) - snappedMove(rendered, 10)) < 0.5, shape.label);
  }
});
test('adds and deletes individual shapes in an advanced Draw.io canvas', async () => {
  const text = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({\nimport cetz.draw: *\n' +
    'n-star((0, 0), 5, radius: 1, fill: yellow)\n' +
    'bezier((3, 0), (5, 0), (3.5, 1), (4.5, 1))\n})';
  const rendered = await renderEditable(text, parseCanvas(text).canvas, path.resolve('examples/advanced.typ'));
  const withoutStar = rendered.xml.replace(/<mxCell id="cetz-edit-0"[\s\S]*?<\/mxCell>/, '');
  const deleted = apply(text, patchesFromEditable(text, rendered, withoutStar, readAllCells));
  assert.doesNotMatch(deleted, /n-star\(/);
  assert.match(deleted, /bezier\(\(3, 0\)/);
  const cell = '<mxCell id="menu-grid" value="grid" style="cetzTemplate=grid;" vertex="1" parent="1"><mxGeometry x="500" y="500" width="120" height="80" as="geometry"/></mxCell>';
  const inserted = rendered.xml.replace('</root>', cell + '</root>');
  const updated = apply(text, patchesFromEditable(text, rendered, inserted, readAllCells));
  assert.match(updated, /grid\(\(0, 0\), \(3, 2\)/);
  const reordered = rendered.xml.replace(
    'id="cetz-preview-background" value="" style=',
    'value="" id="cetz-preview-background" style=');
  assert.deepEqual(patchesFromEditable(text, rendered, reordered, readAllCells), []);
  assert.throws(() => patchesFromEditable(text, rendered,
    rendered.xml.replace('movable=0', 'movable=1'), readAllCells), /preview background cannot be edited/);
});
test('resizes one advanced shape without changing a neighboring call', async () => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({\nimport cetz.draw: *\n' +
    'n-star((0, 0), 5, radius: 1, fill: yellow)\n' +
    'bezier((3, 0), (5, 0), (3.5, 1), (4.5, 1))\n})';
  const file = path.resolve('examples/advanced.typ');
  const rendered = await renderEditable(source, parseCanvas(source).canvas, file);
  assert.equal(rendered.calls.length, 2);
  const original = readAllCells(rendered.xml).get('cetz-edit-0').geometry;
  const edited = rendered.xml.replace(/(<mxCell id="cetz-edit-0"[\s\S]*?<mxGeometry x="[\d.]+" y="[\d.]+" width=")([\d.]+)(" height=")([\d.]+)/,
    (_, prefix, width, middle, height) => prefix + (Number(width) * 1.5) + middle + (Number(height) * 1.5));
  const updated = apply(source, patchesFromEditable(source, rendered, edited, readAllCells));
  assert.match(updated, /radius: 1\.5/);
  assert.doesNotMatch(updated, /scope\(\{/);
  assert.match(updated, /bezier\(\(3, 0\), \(5, 0\), \(3\.5, 1\), \(4\.5, 1\)\)/);
  const rerendered = await renderEditable(updated, parseCanvas(updated).canvas, file);
  const resized = readAllCells(rerendered.xml).get('cetz-edit-0').geometry;
  assert.ok(Math.abs(Number(resized.width) - Number(original.width) * 1.5) < 0.02);
  assert.throws(() => patchesFromEditable(source, rendered,
    rendered.xml.replace('strokeOpacity=35', 'strokeOpacity=100'), readAllCells), /style in Typst/);
});
test('renders only the selected canvas when earlier canvases exist', async () => {
  const text = '#import "@preview/cetz:0.5.2"\n' +
    '#cetz.canvas({ import cetz.draw: *; rect((0, 0), (20, 20)) })\n' +
    '#cetz.canvas({ import cetz.draw: *; arc((0, 0), start: 0deg, stop: 90deg) })';
  const svg = await renderCanvas(text, parseCanvas(text, 1).canvas, path.resolve('examples/advanced.typ'));
  const width = Number(/viewBox="0 0 ([\d.]+)/.exec(svg)[1]);
  assert.ok(width < 100, `the previous 20-unit canvas leaked into the preview: ${width}`);
});
test('keeps definitions but omits preceding prose from the preview', async () => {
  const text = '#import "@preview/cetz:0.5.2"\nA long paragraph before the canvas.\n' +
    '#let r = (\n  1 + 1\n)\n' +
    '#cetz.canvas({ import cetz.draw: *; arc((0, 0), start: 0deg, stop: 90deg, radius: r) })';
  const svg = await renderCanvas(text, parseCanvas(text).canvas, path.resolve('examples/advanced.typ'));
  const width = Number(/viewBox="0 0 ([\d.]+)/.exec(svg)[1]);
  assert.ok(width < 100, `preceding prose leaked into the preview: ${width}`);
  assert.ok(width > 50, `the multiline radius definition was lost: ${width}`);
});
test('compiles the advanced example into a Draw.io preview', async () => {
  const file = path.resolve('examples/advanced.typ');
  const source = fs.readFileSync(file, 'utf8');
  const diagram = parseCanvas(source);
  assert.ok(diagram.unsupported.length > 0);
  const xml = imageDiagram(await renderCanvas(source, diagram.canvas, file));
  assert.match(xml, /id="preview-image"/);
  assert.match(xml, /image=data:image\/svg\+xml,%3Csvg/);
});
test('resolves local imports next to the source file', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gui-cetz-'));
  try {
    fs.writeFileSync(path.join(dir, 'settings.typ'), '#let radius = 1\n');
    const text = '#import "@preview/cetz:0.5.2"\n#import "settings.typ": radius\n' +
      '#cetz.canvas({ import cetz.draw: *; arc((0, 0), start: 0deg, stop: 90deg, radius: radius) })';
    const svg = await renderCanvas(text, parseCanvas(text).canvas, path.join(dir, 'main.typ'));
    assert.match(svg, /^<svg\b/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
