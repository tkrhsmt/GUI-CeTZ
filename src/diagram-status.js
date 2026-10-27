'use strict';

// Keep transient render errors with the sidecar document so the Draw.io webview
// can display them without a VS Code notification on every source edit.
function withDiagramStatus(xml, message) {
  const encoded = message ? encodeURIComponent(String(message)) : '';
  // Live Draw.io merges update graph cells while the file's cached outer XML
  // can still contain an earlier error. Carry status with the current scene.
  xml = xml.replace(/<mxCell\b[^>]*>/g, tag => {
    if (!/\bid="cetz-scene-\d+"/.test(tag)) return tag;
    return tag.replace(/\bstyle="([^"]*)"/, (_, style) =>
      `style="${style.replace(/(?:^|;)cetzError=[^;]*(?=;|$)/g, '').replace(/;?$/, ';')}cetzError=${encoded};"`);
  });
  return xml.replace(/<mxfile\b[^>]*>/, tag => {
    const clean = tag.replace(/\s+cetzStatus="[^"]*"/g, '');
    if (!message) return clean;
    return clean.slice(0, -1) + ' cetzStatus="' + encoded + '">';
  });
}

module.exports = { withDiagramStatus };
