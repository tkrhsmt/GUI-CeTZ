'use strict';

// Keep transient render errors with the sidecar document so the Draw.io webview
// can display them without a VS Code notification on every source edit.
function withDiagramStatus(xml, message) {
  return xml.replace(/<mxfile\b[^>]*>/, tag => {
    const clean = tag.replace(/\s+cetzStatus="[^"]*"/g, '');
    if (!message) return clean;
    return clean.slice(0, -1) + ' cetzStatus="' + encodeURIComponent(String(message)) + '">';
  });
}

module.exports = { withDiagramStatus };
