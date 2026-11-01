'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { readAllCells } = require('../src/drawio');
const { imageDiagram } = require('../src/preview');
const { bindScene, sceneRevision } = require('../src/scene');

const compressedDiagram = xml => '<mxfile><diagram>' +
  zlib.deflateRawSync(Buffer.from(encodeURIComponent(xml))).toString('base64') + '</diagram></mxfile>';

test('large exact previews can be read, bound and restored from compressed Draw.io saves', () => {
  const svg = '<svg viewBox="0 0 100 100"><!--' + 'preview '.repeat(750000) + '--><path d="M0 0L10 10"/></svg>';
  const xml = imageDiagram(svg);
  assert.ok(Buffer.byteLength(xml) > 5_000_000);
  assert.ok(readAllCells(xml).has('preview-image'));
  const bound = bindScene({}, '', xml, null);
  assert.equal(sceneRevision(bound), 1);
  const restored = readAllCells(compressedDiagram(bound));
  assert.equal(restored.get('preview-image').cell.style, readAllCells(bound).get('preview-image').cell.style);
  assert.ok(restored.has('cetz-scene-1'));
});

test('the XML size bound applies to both plain files and decompressed saves', () => {
  const oversized = '<mxGraphModel><!--' + 'a'.repeat(64 * 1024 * 1024) + '--></mxGraphModel>';
  assert.throws(() => readAllCells(oversized), /XML is too large/);
  assert.throws(() => readAllCells(compressedDiagram(oversized)), /XML is too large/);
});
