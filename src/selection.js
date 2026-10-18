'use strict';

function withSelectionMarker(xml, index, token) {
  if (!Number.isSafeInteger(index) || index < 0 || !/^[\w-]+$/.test(token))
    throw new Error('Invalid CeTZ selection marker');
  const withoutOld = xml.replace(/<mxCell id="cetz-select-[\w-]+"[^>]*><mxGeometry[^>]*\/><\/mxCell>/g, '');
  const marker = `<mxCell id="cetz-select-${token}" value="" style="opacity=0;strokeColor=none;fillColor=none;cetzSelect=${index};" vertex="1" parent="1"><mxGeometry x="-1000" y="-1000" width="1" height="1" as="geometry"/></mxCell>`;
  return withoutOld.replace('</root>', marker + '</root>');
}

module.exports = { withSelectionMarker };
