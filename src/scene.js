'use strict';

const { readAllCells } = require('./drawio');

function sceneRevision(xml) {
  const markers = [...readAllCells(xml).keys()].filter(id => /^cetz-scene-\d+$/.test(id));
  return markers.length === 1 ? Number(markers[0].slice('cetz-scene-'.length)) : null;
}

function bindScene(session, source, xml, editable) {
  const layers = [...readAllCells(xml).values()].filter(item => /^cetz-render-\d+$/.test(item.cell.id));
  const signature = JSON.stringify({
    mode:editable?.mode||'2d',plane:editable?.planeContext?.key||null,
    calls: editable?.calls.map(call => [call.name, call.points?.length || 0, !!call.geometry]) ?? null,
    parents: layers.map(item => item.cell.parent)
  });
  const layerIndices = layers.map(item => Number(item.cell.id.slice('cetz-render-'.length)));
  const span = Math.max(editable?.calls.length || 0, ...layerIndices.map(index => index + 1));
  if (session.sceneSignature !== undefined && session.sceneSignature !== signature) {
    session.sceneBase = (session.sceneBase || 0) + (session.sceneSpan || 0) + 1;
    session.sceneSpan = 0;
  }
  const base = session.sceneBase || 0;
  session.sceneSignature = signature;
  session.sceneSpan = Math.max(session.sceneSpan || 0, span);
  session.sceneRevision = (session.sceneRevision || 0) + 1;
  session.sceneSource = source;
  if (editable) {
    xml = xml.replace(/\b(id|parent|source|target)="cetz-(edit|render|point|guide)-(\d+)(-\d+)?"/g,
      (_, attribute, kind, index, suffix = '') => `${attribute}="cetz-${kind}-${base + +index}${suffix}"`)
      .replace(/\bcetzGroup=(\d+);/g, (_, index) => `cetzGroup=${base + +index};`);
    editable.cellIds = editable.calls.map((_, index) => base + index);
  }
  // Hidden, source-neutral revision markers survive Draw.io serialization.
  // They let the bridge reject a delayed save from before a deletion/reindex.
  const marker = `<mxCell id="cetz-scene-${session.sceneRevision}" value="" visible="0" style="opacity=0;selectable=0;movable=0;deletable=0;cetzAction=scene;cetzError=;" vertex="1" parent="1"><mxGeometry width="1" height="1" as="geometry"/></mxCell>`;
  xml = xml.replace('</root>', marker + '</root>');
  if (editable) editable.xml = xml;
  return xml;
}

function sourceIndices(rendered, ids) {
  if (!rendered?.cellIds) return ids;
  return ids.map(id => {
    const index = rendered.cellIds.indexOf(id);
    if (index < 0) throw new Error('The selected CeTZ shape no longer exists.');
    return index;
  });
}

module.exports = { bindScene, sceneRevision, sourceIndices };
