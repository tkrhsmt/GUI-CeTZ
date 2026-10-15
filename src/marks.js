'use strict';

const { closing, splitArgs } = require('./scanner');

// Built-in symbols in CeTZ 0.5.2, src/mark-shapes.typ.
const MARK_NAMES = ['triangle', 'stealth', 'curved-stealth', 'bar', 'ellipse', 'circle',
  'bracket', 'diamond', 'rect', 'hook', 'straight', 'barbed', 'plus', 'x', 'star',
  'parenthesis'];
const MARK_SHORTHANDS = { '>': 'triangle', '<': 'triangle', '<>': 'diamond',
  '[]': 'rect', ']': 'bracket', '[': 'bracket', '|': 'bar', o: 'circle',
  '+': 'plus', x: 'x', '*': 'star', ')>': 'curved-stealth', '>>': 'stealth',
  ')': 'parenthesis' };
const MARK_SET = new Set(MARK_NAMES);

function markName(raw) {
  if (raw === 'none') return 'none';
  const literal = /^"([^"\\]*)"$/.exec(raw);
  if (!literal) return 'custom';
  return MARK_SET.has(literal[1]) ? literal[1] : MARK_SHORTHANDS[literal[1]] || 'custom';
}

function markParts(raw) {
  const open = raw.indexOf('(');
  if (open < 0 || raw.slice(0, open).trim() || closing(raw, open, '(', ')') !== raw.length - 1)
    return null;
  return { open, parts: splitArgs(raw, open + 1, raw.length - 1) };
}

function sideValues(raw) {
  if (raw == null || raw.trim() === 'none') return { start: 'none', end: 'none' };
  const parsed = markParts(raw.trim());
  if (!parsed) return { start: 'custom', end: 'custom' };
  const values = {};
  for (const part of parsed.parts) {
    const text = raw.trim().slice(part.start, part.end).trim();
    const match = /^(symbol|start|end)\s*:\s*([\s\S]*)$/.exec(text);
    if (match) values[match[1]] = markName(match[2].trim());
  }
  return { start: values.start || values.symbol || 'none',
    end: values.end || values.symbol || 'none' };
}

function sideEdits(raw, changes) {
  const parsed = markParts(raw);
  if (!parsed) throw new Error('Edit this CeTZ mark expression in Typst.');
  const edits = [];
  const absent = [];
  for (const [side, value] of Object.entries(changes)) {
    if (value !== 'none' && !MARK_SET.has(value)) throw new Error('Unknown CeTZ mark.');
    const part = parsed.parts.find(item => new RegExp(`^\\s*${side}\\s*:`).test(raw.slice(item.start, item.end)));
    const replacement = value === 'none' ? 'none' : `"${value}"`;
    if (part) {
      const prefix = /^\s*(?:start|end)\s*:\s*/.exec(raw.slice(part.start, part.end))[0];
      edits.push({ start: part.start + prefix.length, end: part.end, text: replacement });
    } else absent.push(`${side}: ${replacement}`);
  }
  if (absent.length) {
    const inner = raw.slice(parsed.open + 1, -1).trim();
    const separator = !inner ? '' : inner.endsWith(',') ? ' ' : ', ';
    edits.push({ start: raw.length - 1, end: raw.length - 1,
      text: separator + absent.join(', ') });
  }
  return edits.sort((a, b) => b.start - a.start).reduce((text, edit) =>
    text.slice(0, edit.start) + edit.text + text.slice(edit.end), raw);
}

module.exports = { MARK_NAMES, markName, sideValues, sideEdits };
