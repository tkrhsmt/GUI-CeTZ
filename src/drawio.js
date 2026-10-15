'use strict';
const zlib = require('zlib');
const { color, stroke: parseStroke, typstColor, typstStroke, dashStyle, fromDrawio, PX_PER_PT } = require('./style');

const SCALE = 80, ORIGIN_X = 160, ORIGIN_Y = 400;
const px = x => ORIGIN_X + x * SCALE;
const py = y => ORIGIN_Y - y * SCALE;
const cx = x => (x - ORIGIN_X) / SCALE;
const cy = y => (ORIGIN_Y - y) / SCALE;
const round = n => Number(n.toFixed(4));
const world = (t, p) => [t.sx * p[0] + t.tx, t.sy * p[1] + t.ty];
const local = (t, p) => [(p[0] - t.tx) / t.sx, (p[1] - t.ty) / t.sy];
const escape = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unescape = s => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
function attrs(tag) {
  const out = {};
  for (const match of tag.matchAll(/([\w-]+)="([^"]*)"/g)) out[match[1]] = unescape(match[2]);
  return out;
}
function literalColor(source, range) {
  if (!range) return undefined;
  return color(source.slice(range.start, range.end));
}
function styleMap(style) {
  const out = {};
  for (const part of (style || '').split(';')) {
    const n = part.indexOf('=');
    if (n > 0) out[part.slice(0, n)] = part.slice(n + 1);
  }
  return out;
}
function pointXml(x, y, as) { return `<mxPoint x="${round(px(x))}" y="${round(py(y))}"${as ? ` as="${as}"` : ''}/>`; }
function edgeGeometry(points) {
  const first = points[0], last = points.at(-1);
  const middle = points.length > 2 ? `<Array as="points">${points.slice(1, -1).map(p => pointXml(...p)).join('')}</Array>` : '';
  return `<mxGeometry relative="1" as="geometry">${pointXml(...first, 'sourcePoint')}${pointXml(...last, 'targetPoint')}${middle}</mxGeometry>`;
}
function xmlForDiagram(source, diagram) {
  const cells = diagram.elements.map(element => {
    const p = element.points[0], q = element.points[1];
    const fill = literalColor(source, element.fill);
    const stroke = element.stroke && parseStroke(source.slice(element.stroke.start, element.stroke.end));
    const edge = element.kind === 'line' || element.kind === 'polygon';
    let style = edge ? 'rounded=0;html=1;' :
      element.kind === 'circle' ? 'ellipse;whiteSpace=wrap;html=1;' :
      element.kind === 'content' ? 'text;html=0;whiteSpace=wrap;align=center;verticalAlign=middle;' :
      'rounded=0;whiteSpace=wrap;html=1;';
    if (element.kind === 'rect' && element.corner.value > 0) {
      const a = world(element.transform, p.abs), b = world(element.transform, q.abs);
      const minSize = Math.min(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
      const arc = element.corner.unit === 'percent' ? element.corner.value :
        minSize ? element.corner.value * Math.min(element.transform.sx, element.transform.sy) / minSize * 100 : 0;
      style = style.replace('rounded=0;', `rounded=1;arcSize=${round(Math.min(50, arc))};`);
    }
    style += `fillColor=${fill || 'none'};`;
    if (edge)
      style += `startArrow=${element.mark?.start || 'none'};endArrow=${element.mark?.end || 'none'};`;
    if (stroke?.color) style += `strokeColor=${stroke.color};`;
    if (stroke) style += `strokeWidth=${round(stroke.width * PX_PER_PT)};${dashStyle(stroke.dash)}`;
    if (element.kind === 'content') style += 'strokeColor=none;';
    let geometry;
    if (edge) {
      let points;
      if (element.kind === 'line') points = element.points.map(p => world(element.transform, p.abs));
      else {
        const n = element.sides.value, r = element.radii.x.value, [x, y] = p.abs;
        const angle = element.angle.value * Math.PI / 180;
        points = Array.from({ length: n + 1 }, (_, i) => world(element.transform,
          [x + r * Math.cos(angle + i * 2 * Math.PI / n), y + r * Math.sin(angle + i * 2 * Math.PI / n)]));
      }
      if (element.close) points.push(points[0]);
      geometry = edgeGeometry(points);
    } else if (element.kind === 'content') {
      const center = world(element.transform, p.abs);
      const x = px(center[0]) - 60, y = py(center[1]) - 18;
      geometry = `<mxGeometry x="${round(x)}" y="${round(y)}" width="120" height="36" as="geometry"/>`;
    } else {
      const a = world(element.transform, p.abs), b = q && world(element.transform, q.abs);
      const x1 = px(a[0]), y1 = py(a[1]);
      const rx = element.radii?.x.value * element.transform.sx, ry = element.radii?.y.value * element.transform.sy;
      const x2 = element.kind === 'circle' ? x1 + rx * SCALE : px(b[0]);
      const y2 = element.kind === 'circle' ? y1 + ry * SCALE : py(b[1]);
      const x = element.kind === 'circle' ? x1 - rx * SCALE : Math.min(x1, x2);
      const y = element.kind === 'circle' ? y1 - ry * SCALE : Math.min(y1, y2);
      const width = element.kind === 'circle' ? 2 * rx * SCALE : Math.abs(x2 - x1);
      const height = element.kind === 'circle' ? 2 * ry * SCALE : Math.abs(y2 - y1);
      geometry = `<mxGeometry x="${round(x)}" y="${round(y)}" width="${round(width)}" height="${round(height)}" as="geometry"/>`;
    }
    const value = element.kind === 'content' ? (element.label.plain ? element.label.value : '[Typst content]') : '';
    return `<mxCell id="${escape(element.id)}" value="${escape(value)}" style="${escape(style)}" ${edge ? 'edge' : 'vertex'}="1" parent="1">${geometry}</mxCell>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="GUI-CeTZ"><diagram name="CeTZ"><mxGraphModel grid="1" gridSize="10" page="1" pageScale="1" pageWidth="850" pageHeight="1100"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel></diagram></mxfile>\n`;
}

function readAllCells(xml) {
  if (xml.length > 5_000_000) throw new Error('Draw.io XML is too large');
  if (!xml.includes('<mxGraphModel')) {
    const compressed = /<diagram\b[^>]*>([^<]+)<\/diagram>/.exec(xml);
    if (!compressed) throw new Error('Unsupported Draw.io document format');
    try {
      xml = decodeURIComponent(zlib.inflateRawSync(Buffer.from(compressed[1].trim(), 'base64'),
        { maxOutputLength: 5_000_000 }).toString('utf8'));
    } catch { throw new Error('Could not decode the Draw.io diagram'); }
  }
  const cells = new Map();
  // Draw.io writes mxCell elements without a namespace in its uncompressed XML.
  for (const match of xml.matchAll(/<mxCell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/mxCell>)/g)) {
    if (match[2] === undefined) continue;
    const cell = attrs(match[1]);
    if (!cell.id) continue;
    const geometryTag = /<mxGeometry\b([^>]*?)(?:\/>|>)/.exec(match[2]);
    if (!geometryTag) continue;
    const geometry = attrs(geometryTag[1]);
    const source = /<mxPoint\b([^>]*\bas="sourcePoint"[^>]*)\/>/.exec(match[2]);
    const target = /<mxPoint\b([^>]*\bas="targetPoint"[^>]*)\/>/.exec(match[2]);
    const waypoints = /<Array\b[^>]*\bas="points"[^>]*>([\s\S]*?)<\/Array>/.exec(match[2]);
    const middle = waypoints ? [...waypoints[1].matchAll(/<mxPoint\b([^>]*?)\/>/g)].map(p => attrs(p[1])) : [];
    cells.set(cell.id, { cell, geometry, source: source && attrs(source[1]), target: target && attrs(target[1]), middle });
  }
  return cells;
}
function readCells(xml) { return new Map([...readAllCells(xml)].filter(([id]) => id.startsWith('cetz-'))); }

function plainLabel(label) {
  if (/[\[\]\\#*$<>]/.test(label)) throw new Error('Draw.io text must be plain Typst content.');
  return label;
}
function newCall(item, transform) {
  const style = styleMap(item.cell.style), g = item.geometry;
  const colorArgs = [];
  if (style.fillColor && style.fillColor !== 'none') colorArgs.push(`fill: ${typstColor(style.fillColor)}`);
  if (style.strokeColor && style.strokeColor !== '#000000' || style.strokeWidth || style.dashed === '1')
    colorArgs.push(`stroke: ${typstStroke(style.strokeColor || '#000000', Number(style.strokeWidth || PX_PER_PT) / PX_PER_PT, fromDrawio(style))}`);
  const fmt = n => String(round(n));
  const point = p => `(${fmt(p[0])}, ${fmt(p[1])})`;
  if (item.cell.edge === '1') {
    if (item.cell.value) throw new Error('Labels on new lines are not supported.');
    const points = [item.source, ...item.middle, item.target];
    if (item.cell.source || item.cell.target || points.some(p => !p))
      throw new Error('New connected edges need anchors and cannot yet be converted to CeTZ.');
    const coordinates = points.map(p => local(transform, [cx(Number(p.x)), cy(Number(p.y))]));
    if (coordinates.some(p => p.some(v => !Number.isFinite(v)))) throw new Error('Invalid new line geometry.');
    const arrow = { classic: '">"', diamond: '"<>"' };
    if (![undefined, 'none', 'classic', 'diamond'].includes(style.startArrow) ||
        ![undefined, 'none', 'classic', 'diamond'].includes(style.endArrow))
      throw new Error('This Draw.io arrowhead has no matching CeTZ mark.');
    const marks = [];
    if (arrow[style.startArrow]) marks.push(`start: ${arrow[style.startArrow]}`);
    if (arrow[style.endArrow]) marks.push(`end: ${arrow[style.endArrow]}`);
    if (marks.length) colorArgs.push(`mark: (${marks.join(', ')})`);
    return `line(${coordinates.map(point).join(', ')}${colorArgs.length ? ', ' + colorArgs.join(', ') : ''})`;
  }
  if (item.cell.vertex !== '1') throw new Error('Unsupported Draw.io element.');
  const [x, y, w, h] = [g.x, g.y, g.width, g.height].map(Number);
  if (![x, y, w, h].every(Number.isFinite) || w < 0 || h < 0) throw new Error('Invalid new shape geometry.');
  const token = (item.cell.style || '').split(';')[0];
  const bare = token.includes('=') ? '' : token;
  const center = point(local(transform, [cx(x + w / 2), cy(y + h / 2)]));
  const label = item.cell.value || '';
  if (bare === 'text') {
    return `content(${center}, [${plainLabel(label)}])`;
  }
  if (bare === 'ellipse') {
    const rx = w / (2 * SCALE * transform.sx), ry = h / (2 * SCALE * transform.sy);
    const call = `circle(${center}, radius: ${Math.abs(rx - ry) < 0.00005 ? fmt(rx) : point([rx, ry])}${colorArgs.length ? ', ' + colorArgs.join(', ') : ''})`;
    return label ? `${call}\n  content(${center}, [${plainLabel(label)}])` : call;
  }
  if (bare || style.shape && style.shape !== 'rectangle') throw new Error('This Draw.io shape has no matching CeTZ primitive.');
  const from = point(local(transform, [cx(x), cy(y + h)])), to = point(local(transform, [cx(x + w), cy(y)]));
  if (style.rounded === '1') {
    const arc = style.arcSize === undefined ? 10 : Number(style.arcSize);
    if (!Number.isFinite(arc) || arc < 0 || arc > 50) throw new Error('Invalid rectangle corner radius.');
    colorArgs.push(`radius: ${round(arc)}%`);
  }
  const call = `rect(${from}, ${to}${colorArgs.length ? ', ' + colorArgs.join(', ') : ''})`;
  return label ? `${call}\n  content(${center}, [${plainLabel(label)}])` : call;
}

function patchesFromXml(source, diagram, xml) {
  const cells = readCells(xml), patches = [], insertions = new Map();
  const originalCells = readCells(xmlForDiagram(source, diagram));
  function set(number, value) {
    if (!Number.isFinite(value)) throw new Error('Invalid shape geometry');
    const normalized = round(value);
    if (Math.abs(number.value - normalized) > 0.00005)
      patches.push({ start: number.start, end: number.end, text: String(normalized) });
  }
  function insert(at, text) { insertions.set(at, (insertions.get(at) || '') + text); }
  function setPoint(point, x, y, previous, transform) {
    const p = local(transform, [x, y]);
    const prior = local(transform, previous || [0, 0]);
    set(point.x, point.relative ? p[0] - prior[0] : p[0]);
    set(point.y, point.relative ? p[1] - prior[1] : p[1]);
  }
  function allEdgePoints(item) {
    if (!item.source || !item.target || item.cell.source || item.cell.target)
      throw new Error('Connected Draw.io edges cannot be mapped to numeric CeTZ coordinates.');
    return [item.source, ...item.middle, item.target].map(p => [cx(Number(p.x)), cy(Number(p.y))]);
  }
  for (const element of diagram.elements) {
    const item = cells.get(element.id);
    if (!item) throw new Error('A linked CeTZ shape was deleted. Restore it or edit the Typst source.');
    const originalItem = originalCells.get(element.id);
    if (item.cell.edge !== originalItem.cell.edge || item.cell.vertex !== originalItem.cell.vertex)
      throw new Error('Changing the kind of a linked CeTZ shape is not supported.');
    const shapeToken = style => {
      const first = (style || '').split(';')[0];
      return first.includes('=') ? '' : first;
    };
    if (shapeToken(item.cell.style) !== shapeToken(originalItem.cell.style))
      throw new Error('Changing the kind of a linked CeTZ shape is not supported.');
    const g = item.geometry;
    if (element.kind === 'line') {
      const actual = allEdgePoints(item);
      if (element.close) {
        const last = actual.pop();
        if (Math.hypot(last[0] - actual[0][0], last[1] - actual[0][1]) > 0.01)
          throw new Error('A closed CeTZ line must remain closed.');
      }
      if (actual.length !== element.points.length) throw new Error('Adding or removing points on an existing line is not supported.');
      actual.forEach((p, i) => setPoint(element.points[i], ...p, i ? actual[i - 1] : [0, 0], element.transform));
    } else if (element.kind === 'polygon') {
      const actual = allEdgePoints(item);
      const original = Array.from({ length: element.sides.value + 1 }, (_, i) => world(element.transform, [
        element.points[0].abs[0] + element.radii.x.value * Math.cos(element.angle.value * Math.PI / 180 + i * 2 * Math.PI / element.sides.value),
        element.points[0].abs[1] + element.radii.x.value * Math.sin(element.angle.value * Math.PI / 180 + i * 2 * Math.PI / element.sides.value)]));
      if (actual.length !== original.length) throw new Error('Changing polygon sides is not supported.');
      const dx = actual[0][0] - original[0][0], dy = actual[0][1] - original[0][1];
      if (actual.some((p, i) => Math.hypot(p[0] - original[i][0] - dx, p[1] - original[i][1] - dy) > 0.01))
        throw new Error('Regular polygons can be moved, but not reshaped in Draw.io.');
      const center = world(element.transform, element.points[0].abs);
      setPoint(element.points[0], center[0] + dx, center[1] + dy, [0, 0], element.transform);
    } else {
      const [x, y, width, height] = [g.x, g.y, g.width, g.height].map(Number);
      if (![x, y, width, height].every(Number.isFinite) || width < 0 || height < 0) throw new Error('Invalid shape geometry');
      if (element.kind === 'circle') {
        setPoint(element.points[0], cx(x + width / 2), cy(y + height / 2), [0, 0], element.transform);
        const rx = width / (2 * SCALE * element.transform.sx), ry = height / (2 * SCALE * element.transform.sy);
        if (element.radii.implicit) {
          if (Math.abs(rx - 1) > 0.00005 || Math.abs(ry - 1) > 0.00005)
            insert(element.end - 1, `, radius: ${Math.abs(rx - ry) < 0.00005 ? round(rx) : `(${round(rx)}, ${round(ry)})`}`);
        } else if (element.radii.circular) {
          if (Math.abs(rx - ry) < 0.00005) set(element.radii.x, rx);
          else patches.push({ start: element.radii.x.start, end: element.radii.x.end, text: `(${round(rx)}, ${round(ry)})` });
        } else { set(element.radii.x, rx); set(element.radii.y, ry); }
      } else if (element.kind === 'content') {
        if (Math.abs(width - 120) > 0.01 || Math.abs(height - 36) > 0.01)
          throw new Error('Content box resizing is not supported; move its center instead.');
        setPoint(element.points[0], cx(x + width / 2), cy(y + height / 2), [0, 0], element.transform);
        if (item.cell.value !== originalCells.get(element.id).cell.value) {
          if (!element.label.plain || /[\[\]\\#*$<>]/.test(item.cell.value))
            throw new Error('Only plain Typst content text can be edited in Draw.io.');
          patches.push({ start: element.label.start, end: element.label.end, text: item.cell.value });
        }
      } else {
        const p = element.points[0], q = element.points[1];
        const left = cx(x), right = cx(x + width), top = cy(y), bottom = cy(y + height);
        const pWorld = world(element.transform, p.abs), qWorld = world(element.transform, q.abs);
        const pAbs = [pWorld[0] <= qWorld[0] ? left : right, pWorld[1] <= qWorld[1] ? bottom : top];
        const qAbs = [pWorld[0] <= qWorld[0] ? right : left, pWorld[1] <= qWorld[1] ? top : bottom];
        setPoint(p, ...pAbs, [0, 0], element.transform);
        setPoint(q, ...qAbs, pAbs, element.transform);
      }
    }
    const currentStyle = styleMap(item.cell.style);
    const originalStyle = styleMap(originalCells.get(element.id).cell.style);
    const handled = new Set(['fillColor', 'strokeColor', 'strokeWidth', 'dashed', 'dashPattern', 'startArrow', 'endArrow', 'rounded', 'arcSize']);
    for (const property of new Set([...Object.keys(currentStyle), ...Object.keys(originalStyle)])) {
      if (handled.has(property)) continue;
      if ((currentStyle[property] || '') !== (originalStyle[property] || ''))
        throw new Error(`${property} cannot be synchronized for this CeTZ element.`);
    }
    if (element.kind !== 'content' && item.cell.value) {
      if (element.kind !== 'rect' && element.kind !== 'circle')
        throw new Error('Labels on this CeTZ shape are not supported.');
      const center = [cx(Number(g.x) + Number(g.width) / 2), cy(Number(g.y) + Number(g.height) / 2)];
      const position = local(element.transform, center);
      insert(diagram.canvas.bodyEnd, `\n  content((${round(position[0])}, ${round(position[1])}), [${plainLabel(item.cell.value)}])`);
      patches.needsRefresh = true;
    }
    if (element.kind === 'line' && (currentStyle.startArrow !== originalStyle.startArrow || currentStyle.endArrow !== originalStyle.endArrow)) {
      const arrow = { classic: '">"', diamond: '"<>"' };
      const marks = [];
      for (const side of ['start', 'end']) {
        const value = currentStyle[`${side}Arrow`] || 'none';
        if (!['none', 'classic', 'diamond'].includes(value))
          throw new Error('This Draw.io arrowhead has no matching CeTZ mark.');
        if (arrow[value]) marks.push(`${side}: ${arrow[value]}`);
      }
      const replacement = marks.length ? `(${marks.join(', ')})` : 'none';
      if (element.markRange) patches.push({ start: element.markRange.start, end: element.markRange.end, text: replacement });
      else insert(element.end - 1, `, mark: ${replacement}`);
    }
    if (element.kind !== 'line' && (currentStyle.startArrow !== originalStyle.startArrow || currentStyle.endArrow !== originalStyle.endArrow))
      throw new Error('Arrowheads on this CeTZ shape are not supported.');
    if (element.kind === 'rect' && (currentStyle.rounded !== originalStyle.rounded || currentStyle.arcSize !== originalStyle.arcSize)) {
      const arc = currentStyle.rounded === '1'
        ? currentStyle.arcSize === undefined ? 10 : Number(currentStyle.arcSize) : 0;
      if (!Number.isFinite(arc) || arc < 0 || arc > 50) throw new Error('Invalid rectangle corner radius.');
      if (element.corner.implicit) insert(element.end - 1, `, radius: ${round(arc)}%`);
      else patches.push({ start: element.corner.start, end: element.corner.end, text: `${round(arc)}%` });
    }
    for (const property of ['fillColor']) {
      if ((currentStyle[property] || '') === (originalStyle[property] || '')) continue;
      if (property === 'fillColor' && element.kind === 'line')
        throw new Error('Open lines cannot be filled in CeTZ.');
      if (property === 'strokeColor' && element.kind === 'content')
        throw new Error('Content needs a frame before its stroke can be edited.');
      const range = property === 'fillColor' ? element.fill : element.stroke;
      if (range && !literalColor(source, range))
        throw new Error('This color is controlled by a Typst expression; edit it in the source.');
      const replacement = typstColor(currentStyle[property]);
      if (range) patches.push({ start: range.start, end: range.end, text: replacement });
      else insert(element.end - 1, `, ${property === 'fillColor' ? 'fill' : 'stroke'}: ${replacement}`);
    }
    if (['strokeColor', 'strokeWidth', 'dashed', 'dashPattern'].some(p => (currentStyle[p] || '') !== (originalStyle[p] || ''))) {
      if (element.kind === 'content') throw new Error('Content needs a frame before its stroke can be edited.');
      const range = element.stroke;
      if (range && !parseStroke(source.slice(range.start, range.end)))
        throw new Error('This stroke is controlled by a Typst expression; edit it in the source.');
      const replacement = typstStroke(currentStyle.strokeColor || '#000000', Number(currentStyle.strokeWidth || PX_PER_PT) / PX_PER_PT, fromDrawio(currentStyle));
      if (range) patches.push({ start: range.start, end: range.end, text: replacement });
      else insert(element.end - 1, `, stroke: ${replacement}`);
    }
    if (element.kind !== 'rect' && (currentStyle.rounded !== originalStyle.rounded || currentStyle.arcSize !== originalStyle.arcSize))
      throw new Error('Corner rounding cannot be synchronized for this CeTZ element.');
  }
  const added = [...readAllCells(xml)].filter(([id, item]) => !id.startsWith('cetz-') && id !== '0' && id !== '1' && item.cell.parent === '1');
  if (added.length) {
    if (!diagram.endTransform) throw new Error('New shapes cannot be inserted after an unsupported transform.');
    const calls = added.map(([, item]) => newCall(item, diagram.endTransform));
    insert(diagram.canvas.bodyEnd, '\n  ' + calls.join('\n  ') + '\n');
    patches.needsRefresh = true;
  }
  for (const [start, text] of insertions) patches.push({ start, end: start, text });
  return patches;
}

module.exports = { xmlForDiagram, patchesFromXml, readCells };
