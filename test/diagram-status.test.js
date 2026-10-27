'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { withDiagramStatus } = require('../src/diagram-status');

test('diagram status encodes multiline errors and clears after a successful sync', () => {
  const xml = '<mxfile host="GUI-CeTZ"><diagram id="x"/></mxfile>';
  const error = 'unexpected "shape" & bad syntax\nline 3';
  const failed = withDiagramStatus(xml, error);
  assert.match(failed, new RegExp('cetzStatus="' + encodeURIComponent(error) + '"'));
  assert.equal(withDiagramStatus(failed, null), xml);
  assert.equal(withDiagramStatus(failed, 'next error'), withDiagramStatus(xml, 'next error'));
});

test('scene status updates and clears idempotently alongside the cached file attribute', () => {
  const xml = '<mxfile><diagram><mxGraphModel><root><mxCell id="cetz-scene-12" style="cetzAction=scene;cetzError=;"/></root></mxGraphModel></diagram></mxfile>';
  const failed = withDiagramStatus(xml, 'bad "value";\ntry again');
  assert.match(failed, /cetzError=bad%20%22value%22%3B%0Atry%20again;/);
  assert.equal(withDiagramStatus(failed, null), xml);
  assert.equal(withDiagramStatus(failed, 'next'), withDiagramStatus(xml, 'next'));
  assert.equal(withDiagramStatus(xml, null), xml);
});
