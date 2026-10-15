'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { locateCanvases } = require('../src/scanner');
const { parseCanvas } = require('../src/diagram');
const { xmlForDiagram, patchesFromXml, readCells } = require('../src/drawio');
const { renderCanvas, imageDiagram } = require('../src/preview');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

function apply(text, patches) {
  return [...patches].sort((a, b) => b.start - a.start).reduce((s, p) => s.slice(0, p.start) + p.text + s.slice(p.end), text);
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
test('accepts compressed Draw.io diagrams', () => {
  const xml = xmlForDiagram(source, parseCanvas(source));
  const inner = /<mxGraphModel[\s\S]*<\/mxGraphModel>/.exec(xml)[0];
  const encoded = zlib.deflateRawSync(Buffer.from(encodeURIComponent(inner))).toString('base64');
  assert.equal(readCells(`<mxfile><diagram>${encoded}</diagram></mxfile>`).size, 3);
});
test('rejects deletion of linked cells', () => {
  const model = parseCanvas(source);
  assert.throws(() => patchesFromXml(source, model, '<mxGraphModel/>'), /deleted/);
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
  assert.match(xml, /id="preview-image"/);
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
