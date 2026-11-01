'use strict';

// Temporary, bounds-free drawables delimit each original CeTZ drawable. Keeping
// its surrounding SVG groups and definitions preserves Typst text, gradients,
// clipping and transforms without approximating them with Draw.io primitives.
const MARKER_BASE = 0xc00000;
function layerInstrumentation(name) {
  return `
let ${name}(body, index) = {
  let wrap(f) = ctx => {
    let element = f(ctx)
    let drawables = element.at("drawables", default: ())
    if type(drawables) == dictionary { drawables = (drawables,) }
    let marked = ()
    for d in drawables {
      let points = if d.type == "path" { cetz.path-util.bounds(d.segments) } else {
        let (x, y, _) = d.pos
        ((x - d.width / 2, y - d.height / 2, 0.0),
         (x + d.width / 2, y + d.height / 2, 0.0))
      }
      let xs = points.map(p => p.at(0))
      let ys = points.map(p => p.at(1))
      let marker(x, y, side) = (
        type: "path",
        segments: (((float(x), float(y), 0.0), true, (("l", (x + 0.001, float(y), 0.0)),
          ("l", (x + 0.001, y + 0.001, 0.0)), ("l", (float(x), y + 0.001, 0.0)))),),
        fill: rgb("#" + str(${MARKER_BASE} + index * 2 + side, base: 16)),
        stroke: rgb("#010204") + 0.001pt,
        tags: d.tags + ("no-bounds",),
        z-index: d.at("z-index", default: 0),
      )
      marked += (marker(calc.min(..xs), calc.min(..ys), 0), d,
        marker(calc.max(..xs), calc.max(..ys), 1))
    }
    element.insert("drawables", marked)
    element
  }
  if type(body) == array { body.map(wrap) } else { wrap(body) }
}
`;
}

function splitSvgLayers(svg, count, excludedOwners = new Set()) {
  const root = { open: '', close: '', children: [] }, stack = [root];
  for (const token of svg.match(/<!--[\s\S]*?-->|<[^>]*>|[^<]+/g) || []) {
    if (/^<\//.test(token)) {
      if (stack.length === 1) throw new Error('Invalid Typst SVG nesting.');
      stack.pop().close = token;
    } else if (/^<[\w:]/.test(token)) {
      const node = { open: token, close: '', children: [] };
      stack.at(-1).children.push(node);
      if (!/\/>$/.test(token)) stack.push(node);
    } else stack.at(-1).children.push(token);
  }
  if (stack.length !== 1) throw new Error('Invalid Typst SVG nesting.');
  const document = root.children.find(node => typeof node !== 'string' && /^<svg\b/.test(node.open));
  if (!document) throw new Error('Typst SVG has no root.');
  const serialize = node => typeof node === 'string' ? node :
    node.open + node.children.map(serialize).join('') + node.close;
  const definitions = [];
  const layers = [];
  let current = null, active = null;
  function add(map, key, value) { map.set(key, (map.get(key) || '') + value); }
  function fragment(value) {
    if (current == null) {
      layers.push({ owner: null }); current = layers.length - 1;
    }
    return new Map([[current, value]]);
  }
  function visit(node) {
    if (typeof node === 'string') return current != null || node.trim() ? fragment(node) : new Map();
    if (/^<defs\b/.test(node.open)) {
      definitions.push(node);
      return new Map();
    }
    const fill = /^<path\b/.test(node.open) && /\bstroke="#010204"/i.test(node.open) &&
      /\bstroke-width="0\.001"/.test(node.open) && /\bfill="#([\da-f]{6})"/i.exec(node.open);
    const marker = fill ? parseInt(fill[1], 16) - MARKER_BASE : -1;
    if (marker >= 0 && marker < count * 2) {
      const xy = /\btransform="translate\(([^)]+)\)"/.exec(node.open);
      const [x = 0, y = 0] = xy ? xy[1].trim().split(/[\s,]+/).map(Number) : [];
      const move = /\bd="M\s+([\d.eE+-]+)[ ,]+([\d.eE+-]+)(?:\s*m\s+([\d.eE+-]+)[ ,]+([\d.eE+-]+))?/.exec(node.open);
      const anchor = { x: x + Number(move?.[1] || 0) + Number(move?.[3] || 0),
        y: y + Number(move?.[2] || 0) + Number(move?.[4] || 0) };
      // The marker rectangle extends 0.001 units above its anchor.
      if (marker % 2 === 0) {
        active = { owner: marker / 2, low: { x, y }, high: null, anchors: [anchor] };
        layers.push(active);
        current = layers.length - 1;
      } else {
        if (!active || active.owner !== Math.floor(marker / 2))
          throw new Error('Unmatched CeTZ SVG layer marker.');
        active.high = { x, y }; active.anchors.push(anchor);
        active = null; current = null;
      }
      return new Map();
    }
    if (node.children.length) {
      const fragments = new Map();
      for (const child of node.children) for (const [key, value] of visit(child)) add(fragments, key, value);
      return new Map([...fragments].map(([key, value]) => [key, node.open + value + node.close]));
    }
    return fragment(serialize(node));
  }
  const fragments = new Map();
  for (const child of document.children) for (const [key, value] of visit(child)) add(fragments, key, value);
  if (active) throw new Error('Unclosed CeTZ SVG layer marker.');
  const defs = definitions.map(serialize).join('');
  // A small fragment only needs the symbols, gradients and clipping paths it
  // references. Copying every glyph into every fragment multiplies large text
  // and image drawings into megabytes of unused definitions.
  const entries = definitions.map(node => ({ node, children: node.children.map(child => {
    const xml = serialize(child);
    const ids = [...xml.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)].map(match => match[1]);
    return { xml, ids };
  }) }));
  const byId = new Map(entries.flatMap(def => def.children.flatMap(entry => entry.ids.map(id => [id, entry]))));
  function referencedDefinitions(body) {
    const needed = new Set(), pending = [];
    function references(xml) {
      for (const match of xml.matchAll(/\b(?:xlink:)?href\s*=\s*["']#([^"']+)["']|url\(\s*["']?#([^\s)"']+)["']?\s*\)/g))
        pending.push(match[1] || match[2]);
    }
    references(document.open + body);
    for (const def of entries) for (const entry of def.children) {
      // Keep styles and other definitions without IDs, including their refs.
      if (!entry.ids.length) { needed.add(entry); references(entry.xml); }
    }
    while (pending.length) {
      const entry = byId.get(pending.pop());
      if (!entry || needed.has(entry)) continue;
      needed.add(entry);
      references(entry.xml);
    }
    return entries.map(({ node, children }) => {
      const xml = children.filter(entry => needed.has(entry)).map(entry => entry.xml).join('');
      return xml.trim() ? node.open + xml + node.close : '';
    }).join('');
  }
  const wrap = (body, viewBox, complete = false) => {
    let open = document.open;
    if (viewBox) open = open.replace(/\bviewBox="[^"]*"/, `viewBox="${viewBox.join(' ')}"`)
      .replace(/\bwidth="[^"]*"/, `width="${viewBox[2]}"`)
      .replace(/\bheight="[^"]*"/, `height="${viewBox[3]}"`);
    return open + body + (complete ? defs : referencedDefinitions(body)) + document.close;
  };
  return {
    compose: owners => wrap([...fragments].filter(([key]) => owners.has(layers[key].owner) && !excludedOwners.has(layers[key].owner))
      .map(([, value]) => value).join('')),
    svg: wrap([...fragments].filter(([key]) => !excludedOwners.has(layers[key].owner)).map(([, value]) => value).join(''), null, true),
    layers: layers.flatMap((layer, key) => {
      const body = fragments.get(key);
      if (!body) return [];
      let bounds = null;
      if (layer.low && layer.high) {
        const strokes = [...body.matchAll(/\bstroke-width="([\d.]+)"/g)].map(match => +match[1]);
        const padding = Math.max(1, ...strokes) / 2 + 1;
        // CeTZ 0.4 renders drawables in screen coordinates (y down), while
        // 0.5 flips y in the canvas renderer. Never infer screen ordering
        // from the marker names: that produced negative SVG heights on 0.4.
        bounds = [Math.min(layer.low.x, layer.high.x) - padding,
          Math.min(layer.low.y, layer.high.y) - padding,
          Math.abs(layer.high.x - layer.low.x) + padding * 2,
          Math.abs(layer.low.y - layer.high.y) + padding * 2];
      }
      return [{ owner: layer.owner, bounds, anchors: layer.anchors, svg: wrap(body, bounds) }];
    })
  };
}

module.exports = { layerInstrumentation, splitSvgLayers };
