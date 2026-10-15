'use strict';

// Small, lossless lexical scanner. It only recognizes the syntax that this
// extension can edit; everything else remains in the original Typst document.
function skipTrivia(text, offset) {
  let i = offset;
  for (;;) {
    while (/\s/.test(text[i] || '') && i < text.length) i++;
    if (text.startsWith('//', i)) {
      i = text.indexOf('\n', i + 2);
      if (i < 0) return text.length;
    } else if (text.startsWith('/*', i)) {
      let depth = 1;
      i += 2;
      while (i < text.length && depth) {
        if (text.startsWith('/*', i)) { depth++; i += 2; }
        else if (text.startsWith('*/', i)) { depth--; i += 2; }
        else i++;
      }
    } else return i;
  }
}

function skipString(text, offset) {
  let i = offset + 1;
  while (i < text.length) {
    if (text[i] === '\\') i += 2;
    else if (text[i++] === '"') return i;
  }
  return i;
}

function closing(text, open, left, right) {
  if (text[open] !== left) return -1;
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '"') { i = skipString(text, i) - 1; continue; }
    if (text.startsWith('//', i)) { i = text.indexOf('\n', i + 2); if (i < 0) return -1; continue; }
    if (text.startsWith('/*', i)) { i = skipTrivia(text, i) - 1; continue; }
    if (text[i] === left) depth++;
    if (text[i] === right && --depth === 0) return i;
  }
  return -1;
}

function splitArgs(text, start, end) {
  const parts = [];
  let part = start;
  for (let i = start; i < end; i++) {
    if (text[i] === '"') { i = skipString(text, i) - 1; continue; }
    if (text.startsWith('//', i)) { i = text.indexOf('\n', i + 2); if (i < 0) break; continue; }
    if (text.startsWith('/*', i)) { i = skipTrivia(text, i) - 1; continue; }
    if ('([{'.includes(text[i])) {
      const other = { '(': ')', '[': ']', '{': '}' }[text[i]];
      i = closing(text, i, text[i], other);
      if (i < 0) break;
      continue;
    }
    if (text[i] === ',') { parts.push({ start: part, end: i }); part = i + 1; }
  }
  parts.push({ start: part, end });
  return parts;
}

function locateCanvases(text) {
  const result = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') { i = skipString(text, i) - 1; continue; }
    if (text.startsWith('//', i) || text.startsWith('/*', i)) { i = skipTrivia(text, i) - 1; continue; }
    if (!text.startsWith('cetz.canvas', i) || /[\w.]/.test(text[i - 1] || '') || /\w/.test(text[i + 11] || '')) continue;
    const paren = skipTrivia(text, i + 11);
    if (text[paren] !== '(') continue;
    const brace = skipTrivia(text, paren + 1);
    if (text[brace] !== '{') continue;
    const end = closing(text, brace, '{', '}');
    if (end < 0 || text[skipTrivia(text, end + 1)] !== ')') continue;
    result.push({ start: i, bodyStart: brace + 1, bodyEnd: end, end: skipTrivia(text, end + 1) + 1 });
    i = end;
  }
  return result;
}

module.exports = { skipTrivia, closing, splitArgs, locateCanvases };
