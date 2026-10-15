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
