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
    if (left === '[' && text[i] === '\\') { i++; continue; }
    if (left !== '[' && text[i] === '"') { i = skipString(text, i) - 1; continue; }
    if (text.startsWith('//', i)) { i = text.indexOf('\n', i + 2); if (i < 0) return -1; continue; }
    if (text.startsWith('/*', i)) { i = skipTrivia(text, i) - 1; continue; }
    // Parentheses and braces in markup are text, including unmatched ones.
    // Embedded Typst code still owns its strings and nested content blocks.
    if (left === '[' && text[i] === '#') {
      const name = /^#[A-Za-z_][\w.-]*/.exec(text.slice(i));
      let code = name ? i + name[0].length : i + 1;
      while ('([{'.includes(text[code] || '\0')) {
        const end = closing(text, code, text[code], { '(': ')', '[': ']', '{': '}' }[text[code]]);
        if (end < 0) return -1;
        code = end + 1;
      }
      if (code > i + 1) { i = code - 1; continue; }
    }
    if (left !== '[' && text[i] === '[') {
      i = closing(text, i, '[', ']');
      if (i < 0) return -1;
      continue;
    }
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

// Typst appends adjacent content blocks to a call's positional arguments.
// Whitespace (including comments) ends the call: f() [text] is separate content.
function callArguments(text, open, limit = text.length) {
  const parenEnd = closing(text, open, '(', ')');
  if (parenEnd < 0 || parenEnd >= limit) return null;
  const args = splitArgs(text, open + 1, parenEnd);
  let end = parenEnd + 1;
  while (text[end] === '[') {
    const close = closing(text, end, '[', ']');
    if (close < 0 || close >= limit) return null;
    if (end === parenEnd + 1) {
      // An empty argument list or a final comma adds no positional argument.
      while (args.length && skipTrivia(text, args.at(-1).start) >= args.at(-1).end) args.pop();
    }
    args.push({ start: end, end: close + 1, trailing: true });
    end = close + 1;
  }
  return { parenEnd, end, args };
}

function locateCanvases(text) {
  const result = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') { i = skipString(text, i) - 1; continue; }
    if (text.startsWith('//', i) || text.startsWith('/*', i)) { i = skipTrivia(text, i) - 1; continue; }
    if (!text.startsWith('cetz.canvas', i) || /[\w.]/.test(text[i - 1] || '') || /\w/.test(text[i + 11] || '')) continue;
    const paren = skipTrivia(text, i + 11);
    if (text[paren] !== '(') continue;
    const callEnd = closing(text, paren, '(', ')');
    if (callEnd < 0) continue;
    const args = splitArgs(text, paren + 1, callEnd);
    let body = null;
    for (const arg of args) {
      let brace = skipTrivia(text, arg.start);
      if (/^body\s*:/.test(text.slice(brace, arg.end)))
        brace = skipTrivia(text, brace + /^body\s*:/.exec(text.slice(brace, arg.end))[0].length);
      if (text[brace] !== '{') continue;
      const end = closing(text, brace, '{', '}');
      if (end >= 0 && !text.slice(end + 1, arg.end).trim()) body = { brace, end };
    }
    if (!body) continue;
    result.push({ start: i, bodyStart: body.brace + 1, bodyEnd: body.end,
      end: callEnd + 1, advancedOptions: args.length !== 1 || skipTrivia(text, args[0].start) !== body.brace });
    i = callEnd;
  }
  return result;
}

function deletionRange(source, start, end) {
  const lineStart = source.lastIndexOf('\n', start - 1) + 1;
  const suffix = /^[ \t]*;?[ \t]*(?:\r?\n|$)/.exec(source.slice(end));
  // Remove a whole standalone statement line, preserving comments and any
  // neighbouring statements that share its first or last line.
  return /^[ \t]*$/.test(source.slice(lineStart, start)) && suffix
    ? { start: lineStart, end: end + suffix[0].length }
    : { start, end };
}

module.exports = { skipTrivia, closing, splitArgs, callArguments, locateCanvases, deletionRange };
