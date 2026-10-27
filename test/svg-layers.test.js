'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { splitSvgLayers } = require('../src/svg-layers');
const { renderEditable, patchesFromEditable } = require('../src/advanced');
const { parseCanvas } = require('../src/diagram');
const { readAllCells } = require('../src/drawio');
const { SHAPES } = require('../src/templates');

const marker = (side, x, y) => `<path fill="#c0000${side}" stroke="#010204" stroke-width="0.001" transform="translate(${x} ${y})"/>`;

test('SVG layers retain transforms, definitions, text, and ordinary marker-colored artwork', () => {
  const svg = '<svg viewBox="0 0 100 100" width="100" height="100">' +
    '<defs><linearGradient id="paint"><stop offset="0" stop-color="red"/></linearGradient></defs>' +
    '<g transform="translate(2 3)">' + marker(0, 10, 30) +
    '<path fill="#c00000" stroke-width="8" d="M0 0 L10 10"/>' +
    '<text fill="url(#paint)">Hello &amp; world</text>' + marker(1, 20, 10) + '</g>' +
    '<path fill="blue" d="M50 50 L60 60"/></svg>';
  const result = splitSvgLayers(svg, 1);
  assert.equal(result.layers.length, 2);
  assert.equal(result.layers[0].owner, 0);
  assert.deepEqual(result.layers[0].bounds, [5, 5, 20, 30]);
  assert.equal(result.layers[1].owner, null);
  assert.match(result.layers[0].svg, /<g transform="translate\(2 3\)">/);
  assert.match(result.layers[0].svg, /Hello &amp; world/);
  assert.match(result.layers[0].svg, /<linearGradient id="paint">/);
  assert.match(result.svg, /fill="#c00000" stroke-width="8"/);
  assert.doesNotMatch(result.svg, /stroke="#010204"/);
  assert.doesNotMatch(result.layers[1].svg, /Hello/);
});

test('layer bounds remain positive with CeTZ 0.4 screen-coordinate marker ordering', () => {
  const svg = '<svg viewBox="0 0 100 100">' + marker(0, 10, 10) +
    '<path d="M10 10 L30 30"/>' + marker(1, 30, 30) + '</svg>';
  const layer = splitSvgLayers(svg, 1).layers[0];
  assert.deepEqual(layer.bounds, [8.5, 8.5, 23, 23]);
  assert.match(layer.svg, /viewBox="8\.5 8\.5 23 23"/);
});

test('every shape template carries its Typst artwork as children of its move handle', async () => {
  const file = path.resolve('examples/advanced.typ');
  for (const version of ['0.4.2', '0.5.2']) for (const shape of SHAPES) {
    // Boolean operations were added after CeTZ 0.4; every catalog entry is
    // checked on 0.5.2, while older compatible functions are checked on both.
    if (version === '0.4.2' && shape.label === 'boolean') continue;
    const name = version + '/' + shape.label;
    const source = '#import "@preview/cetz:' + version + '"\n#cetz.canvas({ import cetz.draw: *\n' + shape.call + '\n})';
    const rendered = await renderEditable(source, parseCanvas(source).canvas, file);
    const cells = readAllCells(rendered.xml);
    const artwork = [...cells].filter(([id]) => /^cetz-render-/.test(id));
    assert.ok(artwork.length, name);
    for (let index = 0; index < rendered.calls.length; index++) {
      const call = rendered.calls[index];
      if (!call.geometry || ['group', 'anchor'].includes(call.name)) continue;
      const children = artwork.filter(([, item]) => item.cell.parent === `cetz-edit-${index}`);
      assert.ok(children.length, `${name}: ${call.name} has moving artwork`);
      for (const [, item] of children) {
        assert.equal(item.cell.visible, '0', 'fragments stay hidden without the plugin');
        assert.ok(+item.geometry.width > 0 && +item.geometry.height > 0);
        const encoded = /(?:^|;)image=data:image\/svg\+xml,([^;]+)/.exec(item.cell.style);
        assert.ok(encoded, name);
        assert.doesNotMatch(decodeURIComponent(encoded[1]), /stroke="#010204"/);
      }
    }
    assert.doesNotMatch(cells.get('cetz-preview-image').cell.style, /(?:^|;)opacity=0;/);
    assert.notEqual(cells.get('cetz-preview-image').cell.visible, '0');
    assert.deepEqual(patchesFromEditable(source, rendered, rendered.xml, readAllCells), []);
  }
});

test('moving the owner writes coordinates while its rendered children stay local and protected', async () => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({ import cetz.draw: *; ' +
    'rect((0, 0), (2, 1), fill: red); content((1, 2), [Text]) })';
  const rendered = await renderEditable(source, parseCanvas(source).canvas, path.resolve('examples/basic.typ'));
  const moved = rendered.xml.replace(/(<mxCell id="cetz-edit-0"[\s\S]*?<mxGeometry x=")([\d.]+)/,
    (_, prefix, x) => prefix + (+x + rendered.calibration.unitX * 2.5));
  const patches = patchesFromEditable(source, rendered, moved, readAllCells);
  assert.equal(patches.length, 1);
  assert.match(patches[0].text, /rect\(\(1, 0\),\s*\(3, 1\), fill: red\)/);
  const damaged = rendered.xml.replace(/(<mxCell id="cetz-render-0"[\s\S]*?<mxGeometry x=")([+-]?[\d.]+)/,
    (_, prefix, x) => prefix + (+x + 10));
  assert.throws(() => patchesFromEditable(source, rendered, damaged, readAllCells), /rendered shape/);
  const removed = rendered.xml.replace(/<mxCell id="cetz-edit-0"[\s\S]*?<\/mxCell>/, '')
    .replace(/<mxCell id="cetz-render-\d+"[^>]*parent="cetz-edit-0"[\s\S]*?<\/mxCell>/g, '');
  assert.ok(patchesFromEditable(source, rendered, removed, readAllCells).some(patch => patch.text === ''));
});

test('CeTZ 0.4.2 also renders moving SVG children with measured content bounds', async () => {
  const source = '#import "@preview/cetz:0.4.2"\n#cetz.canvas({ import cetz.draw: *; ' +
    'rect((0, 0), (2, 1), fill: red); content((1, 2), [Text]); line((0, 3), (2, 3)) })';
  const rendered = await renderEditable(source, parseCanvas(source).canvas, path.resolve('examples/basic.typ'));
  const cells = readAllCells(rendered.xml);
  for (const index of [0, 1, 2]) assert.ok([...cells.values()].some(item =>
    item.cell.parent === `cetz-edit-${index}`));
  assert.equal(rendered.calls[1].contentCorners.length, 4);
});

test('a content call immediately before the closing canvas brace retains its live SVG', async () => {
  const source = '#import "@preview/cetz:0.5.2"\n#cetz.canvas({import cetz.draw: *;content((1,1), [Hi])})';
  const rendered = await renderEditable(source, parseCanvas(source).canvas, path.resolve('examples/basic.typ'));
  assert.equal(rendered.calls[0].contentCorners.length, 4);
  assert.ok([...readAllCells(rendered.xml).values()].some(item => item.cell.parent === 'cetz-edit-0'));
});
