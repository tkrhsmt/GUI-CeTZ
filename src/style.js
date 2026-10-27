'use strict';

// Typst's built-in palette (verified with the installed Typst compiler).
const COLORS = { black: '#000000', gray: '#aaaaaa', silver: '#dddddd', white: '#ffffff',
  navy: '#001f3f', blue: '#0074d9', aqua: '#7fdbff', teal: '#39cccc', eastern: '#239dad',
  purple: '#b10dc9', fuchsia: '#f012be', maroon: '#85144b', red: '#ff4136', orange: '#ff851b',
  yellow: '#ffdc00', olive: '#3d9970', green: '#2ecc40', lime: '#01ff70', none: 'none' };
const DASHES = { solid: null, dotted: '1 2', 'densely-dotted': '1 1', 'loosely-dotted': '1 4', dashed: '3 3', 'densely-dashed': '3 2', 'loosely-dashed': '3 6', 'dash-dotted': '3 2 1 2', 'densely-dash-dotted': '3 1 1 1', 'loosely-dash-dotted': '3 4 1 4' };
const PX_PER_PT = 80 * 2.54 / 72;

function color(raw) {
  const value = raw?.trim();
  return COLORS[value] || (/^rgb\("#[0-9a-fA-F]{6}"\)$/.test(value || '') ? value.slice(5, 12).toLowerCase() : undefined);
}
function stroke(raw) {
  if (!raw) return null;
  const value = raw.trim();
  if (value === 'none') return { color: 'none', width: 1, dash: 'solid' };
  const result = { color: undefined, width: 1, dash: 'solid' };
  if (value.startsWith('(') && value.endsWith(')')) {
    const keys = [...value.matchAll(/(?:^|,)\s*([a-z-]+)\s*:/g)].map(m => m[1]);
    if (keys.some(key => !['paint', 'thickness', 'dash'].includes(key))) return null;
    const paint = /(?:^|,)\s*paint:\s*([^,]+)/.exec(value.slice(1, -1));
    const thickness = /(?:^|,)\s*thickness:\s*([\d.]+)pt\b/.exec(value.slice(1, -1));
    const dash = /(?:^|,)\s*dash:\s*"([\w-]+)"/.exec(value.slice(1, -1));
    if (paint) result.color = color(paint[1]);
    if (thickness) result.width = Number(thickness[1]);
    if (dash) result.dash = dash[1];
    if (paint && !result.color || dash && !(result.dash in DASHES)) return null;
    return result;
  }
  const reverse = /^(.+?)\s*\+\s*(\d+(?:\.\d+)?)pt$/.exec(value);
  if (reverse && color(reverse[1])) return { ...result, color: color(reverse[1]), width: Number(reverse[2]) };
  const simple = /^(?:(\d+(?:\.\d+)?)pt\s*\+\s*)?(.+)$/.exec(value);
  if (simple) {
    if (simple[1]) result.width = Number(simple[1]);
    result.color = color(simple[2]);
    if (result.color) return result;
  }
  const width = /^(\d+(?:\.\d+)?)pt$/.exec(value);
  return width ? { ...result, width: Number(width[1]) } : null;
}
function typstColor(value) {
  if (!value || value === 'none') return 'none';
  if (Object.hasOwn(COLORS, value)) return value;
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) throw new Error('Only solid RGB colors can be synchronized to CeTZ.');
  return `rgb("${value.toLowerCase()}")`;
}
function typstStroke(colorValue, width, dash) {
  if (!Number.isFinite(width) || width <= 0 || width > 100) throw new Error('Invalid stroke width.');
  if (!(dash in DASHES)) throw new Error('Unsupported dash pattern.');
  if (colorValue === 'none') return 'none';
  const fields = [`paint: ${typstColor(colorValue || '#000000')}`, `thickness: ${Number(width.toFixed(4))}pt`];
  if (dash !== 'solid') fields.push(`dash: "${dash}"`);
  return `(${fields.join(', ')})`;
}
function dashStyle(name) {
  return name && name !== 'solid' ? `dashed=1;dashPattern=${DASHES[name]};` : 'dashed=0;';
}
function fromDrawio(style) {
  if (style.dashed !== '1') return 'solid';
  if (!style.dashPattern) return 'dashed';
  const name = Object.keys(DASHES).find(key => DASHES[key] === style.dashPattern);
  if (!name) throw new Error('This Draw.io dash pattern has no matching Typst preset.');
  return name;
}
module.exports = { COLORS, color, stroke, typstColor, typstStroke, dashStyle, fromDrawio, PX_PER_PT };
