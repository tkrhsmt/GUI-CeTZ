'use strict';

const { skipTrivia, closing, splitArgs, locateCanvases } = require('./scanner');
const { insertionFor } = require('./templates');
const { rewriteLiteralCall, rewriteReferencedCall, locateEditableCalls } = require('./advanced');
const { propertyPatches } = require('./properties');

const ACTIONS = new Set(['properties', 'copy', 'paste', 'duplicate', 'forward', 'backward', 'focus', 'select', 'export',
  'connect-straight', 'connect-elbow', 'reconnect', 'group', 'ungroup',
  'share-point', 'auto-share', 'detach-point', 'rename-anchor',
  'rotate', 'scale', 'move-before', 'move-after', 'front', 'back']);

function literalName(call) {
  return /\bname\s*:\s*"([^"\\]+)"/.exec(call.call)?.[1] || null;
}

function declaredName(call) {
  return literalName(call) || (call.name === 'anchor' ?
    /anchor\(\s*"([^"\\]+)"/.exec(call.call)?.[1] || null : null);
}

function quotedReferences(text, names, replacement) {
  let output = '', i = 0;
  while (i < text.length) {
    if (text.startsWith('//', i)) {
      const end = text.indexOf('\n', i);
      const next = end < 0 ? text.length : end;
      output += text.slice(i, next); i = next; continue;
    }
    if (text.startsWith('/*', i)) {
      const next = skipTrivia(text, i);
      output += text.slice(i, next); i = next; continue;
    }
    if (text[i] !== '"') { output += text[i++]; continue; }
    let end = i + 1;
    while (end < text.length) {
      if (text[end] === '\\') end += 2;
      else if (text[end++] === '"') break;
    }
    const original = text.slice(i, end), value = original.slice(1, -1);
    let changed = null;
    if (!value.includes('\\') &&
        !/\bname\s*:\s*$/.test(text.slice(Math.max(0, i - 30), i))) {
      for (const name of names) if (value === name || value.startsWith(`${name}.`)) {
        changed = `"${replacement(name, value)}"`; break;
      }
    }
    output += changed || original; i = end;
  }
  return output;
}

function topLevelCalls(rendered) {
  return rendered.calls.filter(call => !call.group).sort((a, b) => a.start - b.start);
}

function safeStatementGaps(source, calls, start, end) {
  let cursor = start;
  for (const call of calls) {
    const gap = source.slice(cursor, call.start);
    if (skipTrivia(gap, 0) !== gap.length || /\/\/|\/\*/.test(gap))
      throw new Error('A statement or comment between these shapes prevents this source move.');
    cursor = call.end;
  }
  const gap = source.slice(cursor, end);
  if (skipTrivia(gap, 0) !== gap.length || /\/\/|\/\*/.test(gap))
    throw new Error('A statement or comment between these shapes prevents this source move.');
}

function sourceAction(cells, originalCells, handledIds = new Set()) {
  let selection = null;
  for (const [id, item] of cells) {
    if (originalCells.has(id) || item.cell.parent !== '1') continue;
    const style = item.cell.style || '';
    const action = /(?:^|;)cetzAction=([\w-]+)(?:;|$)/.exec(style)?.[1];
    if (!ACTIONS.has(action)) continue;
    const token = /(?:^|;)cetzActionToken=([\w-]+)(?:;|$)/.exec(style)?.[1];
    const key = token || id;
    if (handledIds.has(key)) continue;
    const targets = /(?:^|;)cetzTargets=([\d,]+)(?:;|$)/.exec(style)?.[1];
    if (!targets && action !== 'export' && action !== 'paste') throw new Error('Select a CeTZ shape first.');
    const indices = targets ? [...new Set(targets.split(',').map(Number))] : [];
    if (indices.some(index => !Number.isSafeInteger(index) || index < 0))
      throw new Error('Invalid CeTZ shape selection.');
    const value = /(?:^|;)cetzValue=([\w.%-]+)(?:;|$)/.exec(style)?.[1];
    const command = { id, action, key, indices, ...(value == null ? {} : { value }) };
    // Selection notifications may share a save with an edit action. Process
    // edits first, and otherwise use the most recent selection in the save.
    if (action === 'select') selection = command;
    else return command;
  }
  return selection;
}

function duplicate(source, rendered, indices) {
  const calls = indices.map(index => rendered.calls[index]);
  if (calls.some(call => !call)) throw new Error('The selected CeTZ shape no longer exists.');
  const names = new Set([...source.matchAll(/\bname\s*:\s*"([^"\\]+)"/g)].map(match => match[1]));
  const copies = calls.sort((a, b) => a.start - b.start).map(call => {
    if (!call.rotation && source.slice(call.start, call.end) !== call.call)
      throw new Error('A transformed CeTZ shape must be duplicated in Typst.');
    const angle = -(call.rotation?.angle || 0) * Math.PI / 180;
    const dx = 0.5 * Math.cos(angle) + 0.5 * Math.sin(angle);
    const dy = 0.5 * Math.sin(angle) - 0.5 * Math.cos(angle);
    let copy;
    try { copy = rewriteLiteralCall(call.call, { tx: dx, ty: dy, sx: 1, sy: 1 }); }
    catch { copy = rewriteReferencedCall(call, dx, dy); }
    const name = /\bname\s*:\s*"([^"\\]+)"/.exec(copy);
    if (name) {
      let suffix = 2;
      while (names.has(`${name[1]}-${suffix}`)) suffix++;
      const next = `${name[1]}-${suffix}`;
      names.add(next);
      copy = copy.slice(0, name.index) + name[0].replace(`"${name[1]}"`, `"${next}"`) + copy.slice(name.index + name[0].length);
    } else if (/\bname\s*:/.test(copy)) {
      throw new Error('Duplicate shapes with computed names in Typst.');
    }
    return call.rotation ?
      `scope({ rotate(${call.rotation.angle}deg, origin: (${call.rotation.cx}, ${call.rotation.cy})); ${copy} })` : copy;
  });
  const insertion = insertionFor(source, rendered.canvas, copies.join('\n'));
  return [{ start: insertion.offset, end: insertion.offset, text: insertion.text }];
}

function reorder(source, rendered, indices, direction) {
  if (indices.length !== 1) throw new Error('Select one CeTZ shape to change its order.');
  const call = rendered.calls[indices[0]];
  if (!call) throw new Error('The selected CeTZ shape no longer exists.');
  const siblings = rendered.calls.filter(item => item.group === call.group)
    .sort((a, b) => a.start - b.start);
  const index = siblings.indexOf(call), neighbor = index + (direction === 'forward' ? 1 : -1);
  if (neighbor < 0 || neighbor >= siblings.length) return [];
  return moveInOutline(source, rendered,
    [indices[0], rendered.calls.indexOf(siblings[neighbor])], direction === 'forward');
}

function moveInOutline(source, rendered, indices, after) {
  if (indices.length !== 2) throw new Error('Drag one outline shape onto another.');
  const [moving, target] = indices.map(index => rendered.calls[index]);
  if (!moving || !target || moving === target) return [];
  if (moving.group !== target.group) throw new Error('Outline reorder stays within one group or canvas.');
  const siblings = rendered.calls.filter(call => call.group === moving.group)
    .sort((a, b) => a.start - b.start);
  const first = Math.min(moving.start, target.start), last = Math.max(moving.end, target.end);
  const affected = siblings.filter(call => call.start >= first && call.end <= last);
  safeStatementGaps(source, affected, first, last);
  const reordered = affected.filter(call => call !== moving);
  const index = reordered.indexOf(target) + (after ? 1 : 0);
  reordered.splice(index, 0, moving);
  if (affected.every((call, i) => call === reordered[i])) return [];
  const names = new Map(affected.map(call => [declaredName(call), call]).filter(([name]) => name));
  for (const call of reordered) {
    const position = reordered.indexOf(call);
    for (const match of call.call.matchAll(/"([^"\\]+)"/g)) {
      if (/\bname\s*:\s*$/.test(call.call.slice(Math.max(0, match.index - 30), match.index))) continue;
      const name = match[1].split('.')[0], declaration = names.get(name);
      if (declaration && declaration !== call && reordered.indexOf(declaration) > position)
        throw new Error(`Moving this call before ${name} would break its anchor reference.`);
    }
  }
  const gaps = affected.slice(1).map((call, i) =>
    source.slice(affected[i].end, call.start));
  let text = '';
  reordered.forEach((call, i) => {
    if (i) text += gaps[i - 1];
    text += source.slice(call.start, call.end);
  });
  return [{ start: first, end: last, text }];
}

function moveToLayerEnd(source, rendered, indices, front) {
  if (indices.length !== 1) throw new Error('Select one CeTZ shape to change its layer.');
  const call = rendered.calls[indices[0]];
  if (!call) throw new Error('The selected CeTZ shape no longer exists.');
  const siblings = rendered.calls.filter(item => item.group === call.group)
    .sort((a, b) => a.start - b.start);
  const target = front ? siblings.at(-1) : siblings[0];
  if (target === call) return [];
  return moveInOutline(source, rendered,
    [indices[0], rendered.calls.indexOf(target)], front);
}

function innerCallStart(source, call) {
  const offset = source.slice(call.start, call.end).indexOf(call.call);
  if (offset < 0) throw new Error('The selected CeTZ shape no longer matches its source.');
  return call.start + offset;
}

function connectorPatches(source, rendered, indices, route, sides) {
  if (indices.length !== 2) throw new Error('Select two CeTZ shapes to connect.');
  const calls = indices.map(index => rendered.calls[index]);
  if (calls.some(call => !call || !call.geometry ||
      !['rect', 'circle'].includes(call.name) ||
      source.slice(call.start, call.end) !== call.call))
    throw new Error('Connect two top-level rectangles or circles.');
  const names = new Set([...source.matchAll(/\bname\s*:\s*"([^"\\]+)"/g)].map(match => match[1]));
  const patches = [];
  const identifiers = calls.map((call, index) => {
    const literal = /\bname\s*:\s*"([^"\\]+)"/.exec(call.call);
    if (literal) return literal[1];
    if (/\bname\s*:/.test(call.call)) throw new Error('A computed CeTZ name cannot be used for a connector.');
    let candidate = `shape-${indices[index] + 1}`, suffix = 2;
    while (names.has(candidate)) candidate = `shape-${indices[index] + 1}-${suffix++}`;
    names.add(candidate);
    const comma = call.call.slice(0, -1).trimEnd().endsWith(',') ? '' : ',';
    patches.push({ start: call.end - 1, end: call.end - 1, text: `${comma} name: "${candidate}"` });
    return candidate;
  });
  const a = calls[0].geometry, b = calls[1].geometry;
  const dx = b.x + b.width / 2 - a.x - a.width / 2;
  const dy = b.y + b.height / 2 - a.y - a.height / 2;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  let fromSide = horizontal ? dx >= 0 ? 'east' : 'west' : dy >= 0 ? 'south' : 'north';
  let toSide = horizontal ? dx >= 0 ? 'west' : 'east' : dy >= 0 ? 'north' : 'south';
  if (sides) {
    const requested = /^(auto|north|east|south|west)-(auto|north|east|south|west)$/.exec(sides);
    if (!requested) throw new Error('Invalid CeTZ connector anchors.');
    if (requested[1] !== 'auto') fromSide = requested[1];
    if (requested[2] !== 'auto') toSide = requested[2];
  }
  const from = `"${identifiers[0]}.${fromSide}"`, to = `"${identifiers[1]}.${toSide}"`;
  let vertices = [from, to];
  if (route === 'elbow') {
    const mid = `(${from}, 50%, ${to})`;
    const turn = fromSide === 'east' || fromSide === 'west' ? '"-|"' : '"|-"';
    vertices = [from, `(${from}, ${turn}, ${mid})`,
      `(${to}, ${turn}, ${mid})`, to];
  }
  const insertion = insertionFor(source, rendered.canvas,
    `line(${vertices.join(', ')}, mark: (end: ">"))`);
  patches.push({ start: insertion.offset, end: insertion.offset, text: insertion.text });
  return patches;
}

function reconnectPatches(source, rendered, indices, requestedEnd) {
  if (indices.length !== 2) throw new Error('Select one connector and one target shape.');
  const selected = indices.map(index => rendered.calls[index]);
  const line = selected.find(call => call?.name === 'line');
  const target = selected.find(call => call && ['rect', 'circle'].includes(call.name));
  if (!line || !target || !line.geometry || !target.geometry || line.group || target.group ||
      source.slice(line.start, line.end) !== line.call || source.slice(target.start, target.end) !== target.call)
    throw new Error('Reconnect a top-level connector to a top-level rectangle or circle.');
  const open = skipTrivia(line.call, 4), end = closing(line.call, open, '(', ')');
  const args = splitArgs(line.call, open + 1, end);
  const positional = args.filter(arg => !/^\s*[\w-]+\s*:/.test(line.call.slice(arg.start, arg.end)));
  if (positional.length !== 2 && positional.length !== 4)
    throw new Error('This connector route needs editing in Typst.');
  const endpoints = [positional[0], positional.at(-1)].map(arg =>
    /^\s*"([^"\\]+)\.(north|south|east|west)"\s*$/.exec(line.call.slice(arg.start, arg.end)));
  if (endpoints.some(value => !value)) throw new Error('Only named CeTZ connectors can be reconnected.');
  const option = /^(start|end)(?:-(auto|north|east|south|west))?$/.exec(requestedEnd || '');
  if (!option) throw new Error('Choose the connector end to reconnect.');
  const endName = option[1];
  const otherName = endpoints[endName === 'start' ? 1 : 0][1];
  const other = rendered.calls.find(call =>
    /\bname\s*:\s*"([^"\\]+)"/.exec(call.call)?.[1] === otherName && call.geometry);
  if (!other) throw new Error('The connector’s other shape could not be found.');
  const center = geometry => ({ x: geometry.x + geometry.width / 2, y: geometry.y + geometry.height / 2 });
  const a = center(other.geometry), b = center(target.geometry);
  const dx = a.x - b.x, dy = a.y - b.y;
  let side = Math.abs(dx) >= Math.abs(dy) ? dx >= 0 ? 'east' : 'west'
    : dy >= 0 ? 'south' : 'north';
  if (option[2] && option[2] !== 'auto') side = option[2];
  const existing = /\bname\s*:\s*"([^"\\]+)"/.exec(target.call);
  if (!existing && /\bname\s*:/.test(target.call)) throw new Error('Computed shape names need editing in Typst.');
  const patches = [];
  let name = existing?.[1];
  if (!name) {
    const names = new Set([...source.matchAll(/\bname\s*:\s*"([^"\\]+)"/g)].map(m => m[1]));
    let n = 1;
    do { name = `shape-${n++}`; } while (names.has(name));
    patches.push({ start: target.end - 1, end: target.end - 1, text: `, name: "${name}"` });
  }
  const refs = [`"${endpoints[0][1]}.${endpoints[0][2]}"`,
    `"${endpoints[1][1]}.${endpoints[1][2]}"`];
  refs[endName === 'start' ? 0 : 1] = `"${name}.${side}"`;
  if (positional.length === 4) {
    const bend = /\b(\d+(?:\.\d+)?)%/.exec(line.call)?.[1] || '50';
    const horizontal = /\.(?:east|west)"$/.test(refs[0]);
    const turn = horizontal ? '"-|"' : '"|-"';
    const middle = `(${refs[0]}, ${bend}%, ${refs[1]})`;
    const route = [refs[0], `(${refs[0]}, ${turn}, ${middle})`,
      `(${refs[1]}, ${turn}, ${middle})`, refs[1]].join(', ');
    const original = line.call.slice(positional[0].start, positional.at(-1).end);
    patches.push({ start: line.start + positional[0].start,
      end: line.start + positional.at(-1).end,
      text: original.match(/^\s*/)[0] + route + original.match(/\s*$/)[0] });
  } else {
    const endpoint = positional[endName === 'start' ? 0 : positional.length - 1];
    const original = line.call.slice(endpoint.start, endpoint.end);
    patches.push({ start: line.start + endpoint.start, end: line.start + endpoint.end,
      text: original.match(/^\s*/)[0] + `"${name}.${side}"` + original.match(/\s*$/)[0] });
  }
  return patches;
}

function groupPatches(source, rendered, indices) {
  if (indices.length < 2) throw new Error('Select at least two CeTZ shapes to group.');
  const calls = indices.map(index => rendered.calls[index]);
  if (calls.some(call => !call)) throw new Error('A selected CeTZ shape no longer exists.');
  calls.sort((a, b) => a.start - b.start);
  if (calls.some(call => call.group || call.name === 'group' || call.name === 'anchor' ||
      !call.rotation && source.slice(call.start, call.end) !== call.call))
    throw new Error('Group only top-level shapes in the same canvas.');
  const siblings = topLevelCalls(rendered).filter(call =>
    call.start >= calls[0].start && call.end <= calls.at(-1).end);
  safeStatementGaps(source, siblings, calls[0].start, calls.at(-1).end);
  const selected = new Set(calls);
  const between = siblings.filter(call => !selected.has(call));
  for (const call of between) {
    const dependency = literalName(call) ||
      (call.name === 'anchor' ? /anchor\(\s*"([^"\\]+)"/.exec(call.call)?.[1] : null);
    if (dependency && calls.some(item => item.start > call.start &&
        new RegExp(`"${dependency.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\.|"|\\b)`).test(item.call)))
      throw new Error('A selected shape depends on a definition between the selected shapes.');
  }
  const names = new Set(topLevelCalls(rendered).map(declaredName).filter(Boolean));
  let suffix = 1, name;
  do { name = `group-${suffix++}`; } while (names.has(name));
  const childNames = calls.map(literalName).filter(Boolean);
  if (childNames.some(child => topLevelCalls(rendered).some(call =>
    !selected.has(call) && declaredName(call) === child)))
    throw new Error('A selected name also exists outside the group.');
  const body = calls.map(call => source.slice(call.start, call.end)).join('\n');
  const start = rendered.canvas.bodyStart, end = rendered.canvas.bodyEnd;
  let output = '', cursor = start;
  for (const call of calls) {
    output += quotedReferences(source.slice(cursor, call.start), childNames,
      (_child, value) => `${name}.${value}`);
    if (call === calls[0]) output += `group(name: "${name}", {\n${body}\n})`;
    cursor = call.end;
  }
  output += quotedReferences(source.slice(cursor, end), childNames,
    (_child, value) => `${name}.${value}`);
  return [{ start, end, text: output }];
}

function ungroupPatches(source, rendered, indices) {
  if (indices.length !== 1) throw new Error('Select one group to ungroup.');
  const call = rendered.calls[indices[0]];
  if (!call || call.name !== 'group' || call.group) throw new Error('Select a top-level CeTZ group.');
  const open = skipTrivia(source, call.start + 5);
  const args = splitArgs(source, open + 1, call.end - 1);
  const body = args.find(arg => source[skipTrivia(source, arg.start)] === '{');
  const brace = body && skipTrivia(source, body.start);
  const bodyEnd = brace != null && closing(source, brace, '{', '}');
  if (!body || bodyEnd < 0 || source.slice(bodyEnd + 1, body.end).trim())
    throw new Error('This CeTZ group needs editing in Typst.');
  const name = /\bname\s*:\s*"([^"\\]+)"/.exec(call.call)?.[1];
  const children = rendered.calls.filter(child => child.group === call);
  const names = children.map(literalName).filter(Boolean);
  const outside = topLevelCalls(rendered).filter(item => item !== call);
  if (names.some(child => outside.some(item => declaredName(item) === child)))
    throw new Error('Ungroup would create duplicate CeTZ names.');
  const prefix = source.slice(rendered.canvas.bodyStart, call.start);
  const suffix = source.slice(call.end, rendered.canvas.bodyEnd);
  if (name && [...(prefix + suffix).matchAll(/"([^"\\]+)"/g)].some(match =>
    match[1] === name || match[1].startsWith(`${name}.`) &&
      !names.some(child => match[1] === `${name}.${child}` ||
        match[1].startsWith(`${name}.${child}.`))))
    throw new Error('The group itself is referenced outside it.');
  const unprefix = text => name ? quotedReferences(text, [name], (_group, value) => {
    const rest = value.slice(name.length + 1);
    return names.some(child => rest === child || rest.startsWith(`${child}.`)) ? rest : value;
  }) : text;
  return [{ start: rendered.canvas.bodyStart, end: rendered.canvas.bodyEnd,
    text: unprefix(prefix) + source.slice(brace + 1, bodyEnd).trim() + unprefix(suffix) }];
}

function sharePointPatches(source, rendered, indices, pointIndex) {
  if (indices.length !== 1) throw new Error('Select one line or curve to share a point.');
  const call = rendered.calls[indices[0]];
  if (!call || call.name === 'anchor' || call.name === 'group' || call.group ||
      !call.rotation && source.slice(call.start, call.end) !== call.call)
    throw new Error('Select a top-level shape with literal points.');
  const open = skipTrivia(call.call, call.name.length), end = closing(call.call, open, '(', ')');
  const candidates = splitArgs(call.call, open + 1, end).filter(part =>
    /^\s*\(\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)\s*,\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)\s*\)\s*$/.test(call.call.slice(part.start, part.end)));
  const index = pointIndex == null ? 0 : Number(pointIndex);
  const arg = Number.isSafeInteger(index) && index >= 0 ? candidates[index] : null;
  if (!arg) throw new Error('No literal point is available to share.');
  const names = new Set([...source.matchAll(/(?:anchor\(\s*|\bname\s*:\s*)"([^"\\]+)"/g)]
    .map(match => match[1]));
  let n = 1, name;
  do { name = `P${n++}`; } while (names.has(name));
  const point = call.call.slice(arg.start, arg.end).trim();
  const original = call.call.slice(arg.start, arg.end);
  const innerStart = innerCallStart(source, call);
  return [{ start: innerStart + arg.start, end: innerStart + arg.end,
    text: original.match(/^\s*/)[0] + `"${name}"` + original.match(/\s*$/)[0] },
    { start: call.start, end: call.start, text: `anchor("${name}", ${point})\n  ` }];
}

function renameAnchorPatches(source, rendered, indices, nextName) {
  if (indices.length !== 1) throw new Error('Select one shared anchor to rename.');
  const call = rendered.calls[indices[0]];
  if (!call || call.name !== 'anchor' || call.group)
    throw new Error('Select a top-level CeTZ anchor.');
  const name = declaredName(call);
  if (!name || !/^[A-Za-z_][\w-]*$/.test(nextName || ''))
    throw new Error('Enter a valid shared point name.');
  if (name === nextName) return [];
  if (rendered.calls.some(item => item !== call && declaredName(item) === nextName))
    throw new Error('That CeTZ name is already used.');
  const start = rendered.canvas.bodyStart, end = rendered.canvas.bodyEnd;
  return [{ start, end, text: quotedReferences(source.slice(start, end), [name],
    (_old, value) => nextName + value.slice(name.length)) }];
}

function detachPointPatches(source, rendered, indices, pointIndex) {
  if (indices.length !== 1) throw new Error('Select one CeTZ shape to detach a shared point.');
  const call = rendered.calls[indices[0]];
  if (!call || call.name === 'anchor' || call.name === 'group' ||
      !call.rotation && source.slice(call.start, call.end) !== call.call)
    throw new Error('Detach points from a directly editable CeTZ shape.');
  const open = skipTrivia(call.call, call.name.length), end = closing(call.call, open, '(', ')');
  const args = splitArgs(call.call, open + 1, end).filter(part =>
    !/^\s*[\w-]+\s*:/.test(call.call.slice(part.start, part.end)));
  const references = args.filter(part => /^\s*"[A-Za-z_][\w-]*"\s*$/.test(call.call.slice(part.start, part.end)));
  const index = pointIndex == null ? 0 : Number(pointIndex);
  const arg = Number.isSafeInteger(index) && index >= 0 ? references[index] : null;
  if (!arg) throw new Error('This shape has no direct shared point to detach.');
  const raw = call.call.slice(arg.start, arg.end);
  const name = /^\s*"([A-Za-z_][\w-]*)"/.exec(raw)[1];
  const anchor = rendered.calls.filter(item => item.name === 'anchor' && declaredName(item) === name &&
    item.start < call.start).at(-1);
  if (!anchor) throw new Error('The shared anchor definition could not be found.');
  const aOpen = skipTrivia(anchor.call, 6), aEnd = closing(anchor.call, aOpen, '(', ')');
  const point = splitArgs(anchor.call, aOpen + 1, aEnd)[1];
  const literal = point && anchor.call.slice(point.start, point.end).trim();
  if (!/^\(\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)\s*,\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)\s*\)$/.test(literal || ''))
    throw new Error('Detach computed anchors in Typst.');
  const innerStart = innerCallStart(source, call);
  return [{ start: innerStart + arg.start, end: innerStart + arg.end,
    text: raw.match(/^\s*/)[0] + literal + raw.match(/\s*$/)[0] }];
}

function autoSharePatches(source, rendered, indices) {
  if (indices.length < 2) throw new Error('Select at least two CeTZ shapes to share coincident points.');
  const calls = indices.map(index => rendered.calls[index]);
  if (calls.some(call => !call || call.group || source.slice(call.start, call.end) !== call.call))
    throw new Error('Auto-share requires top-level CeTZ shapes.');
  const ordered = [...calls].sort((a, b) => a.start - b.start);
  safeStatementGaps(source, topLevelCalls(rendered).filter(call =>
    call.start >= ordered[0].start && call.end <= ordered.at(-1).end),
  ordered[0].start, ordered.at(-1).end);
  const counts = { rect: 2, circle: 1, content: 1, polygon: 1, arc: 1,
    'n-star': 1, line: Infinity, bezier: Infinity, hobby: Infinity, catmull: Infinity };
  const groups = new Map();
  for (const call of calls) {
    if (!(call.name in counts)) continue;
    const open = skipTrivia(call.call, call.name.length);
    const end = closing(call.call, open, '(', ')');
    const args = splitArgs(call.call, open + 1, end)
      .filter(part => !/^\s*[\w-]+\s*:/.test(call.call.slice(part.start, part.end)))
      .slice(0, counts[call.name]);
    for (const arg of args) {
      const raw = call.call.slice(arg.start, arg.end);
      const point = /^\s*\(\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*\)\s*$/.exec(raw);
      if (!point) continue;
      const key = `${Number(point[1])},${Number(point[2])}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ call, arg, raw, point: `(${point[1]}, ${point[2]})` });
    }
  }
  const shared = [...groups.values()].filter(items => new Set(items.map(item => item.call)).size >= 2);
  if (!shared.length) throw new Error('The selected shapes have no coincident literal points.');
  const names = new Set([...source.matchAll(/(?:\bname\s*:\s*|anchor\(\s*)"([^"\\]+)"/g)]
    .map(match => match[1]).concat([...source.matchAll(/\blet\s+([A-Za-z_][\w-]*)/g)].map(match => match[1])));
  const patches = [], definitions = [];
  let next = 1;
  for (const items of shared) {
    let name;
    do { name = `P${next++}`; } while (names.has(name));
    names.add(name);
    definitions.push(`anchor("${name}", ${items[0].point})`);
    for (const item of items) patches.push({ start: item.call.start + item.arg.start,
      end: item.call.start + item.arg.end,
      text: item.raw.match(/^\s*/)[0] + `"${name}"` + item.raw.match(/\s*$/)[0] });
  }
  const first = calls.reduce((a, b) => a.start < b.start ? a : b);
  const line = source.slice(source.lastIndexOf('\n', first.start - 1) + 1, first.start);
  const indent = /^\s*$/.test(line) ? line : '';
  patches.push({ start: first.start, end: first.start,
    text: definitions.join(`\n${indent}`) + `\n${indent}` });
  return patches;
}

function transformPatches(source, rendered, action) {
  if (action.indices.length !== 1) throw new Error('Select one CeTZ shape to transform.');
  const call = rendered.calls[action.indices[0]];
  if (!call || !call.geometry || call.group ||
      !call.rotation && source.slice(call.start, call.end) !== call.call)
    throw new Error('Transform a top-level CeTZ shape.');
  const value = Number(action.value);
  if (!Number.isFinite(value)) throw new Error('Enter a finite rotation or scale value.');
  let replacement;
  if (action.action === 'rotate') {
    if (call.rotation) {
      replacement = value === 0 ? call.call :
        `scope({ rotate(${value}deg, origin: (${call.rotation.cx}, ${call.rotation.cy})); ${call.call} })`;
    } else if (['polygon', 'n-star', 'content'].includes(call.name)) {
      const angle = /\bangle\s*:\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))deg/.exec(call.call);
      replacement = angle ? call.call.replace(angle[0], `angle: ${value}deg`)
        : call.call.slice(0, -1) + `, angle: ${value}deg)`;
    } else {
      const cx = (call.geometry.x + call.geometry.width / 2 - rendered.calibration.originX) /
        (rendered.calibration.unitX * 2.5);
      const cy = (rendered.calibration.originY - call.geometry.y - call.geometry.height / 2) /
        (rendered.calibration.unitY * 2.5);
      replacement = value === 0 ? call.call :
        `scope({ rotate(${value}deg, origin: (${Number(cx.toFixed(2))}, ${Number(cy.toFixed(2))})); ${call.call} })`;
    }
  } else {
    if (value <= 0 || value > 100) throw new Error('Scale must be greater than zero and at most 100.');
    const centerX = call.rotation?.cx ?? (call.geometry.x + call.geometry.width / 2 - rendered.calibration.originX) /
      (rendered.calibration.unitX * 2.5);
    const centerY = call.rotation?.cy ?? (rendered.calibration.originY - call.geometry.y - call.geometry.height / 2) /
      (rendered.calibration.unitY * 2.5);
    const scaled = rewriteLiteralCall(call.call, { sx: value, sy: value,
      tx: centerX * (1 - value), ty: centerY * (1 - value), snapTx: false, snapTy: false });
    replacement = call.rotation ?
      `scope({ rotate(${call.rotation.angle}deg, origin: (${call.rotation.cx}, ${call.rotation.cy})); ${scaled} })` : scaled;
  }
  return [{ start: call.start, end: call.end, text: replacement }];
}

function propertiesWithPending(source, rendered, action, pending) {
  const properties = propertyPatches(rendered, action);
  if (!pending.length) return properties;
  const original = rendered.calls[action.indices[0]];
  if (pending.some(patch => patch.start <= original.start && patch.end >= original.end && !patch.text))
    throw new Error('The selected shape was deleted.');
  const shiftedStart = original.start + pending.filter(patch => patch.end <= original.start)
    .reduce((shift, patch) => shift + patch.text.length - (patch.end - patch.start), 0);
  const apply = (text, patches) => [...patches].sort((a, b) => b.start - a.start)
    .reduce((text, patch) => text.slice(0, patch.start) + patch.text + text.slice(patch.end), text);
  const intermediate = apply(source, pending);
  // Rebase the draft over a drag that shared the same debounced Draw.io save.
  const calls = locateEditableCalls(intermediate, locateCanvases(intermediate).find(canvas => canvas.start === rendered.canvas.start));
  const index = calls.findIndex(call => call.start === shiftedStart && call.name === original.name);
  if (index < 0) throw new Error('The selected shape changed. Select it again.');
  const draft = JSON.parse(decodeURIComponent(action.value));
  draft.base = calls[index].call;
  const next = apply(intermediate, propertyPatches({ calls }, { ...action, indices: [index],
    value: encodeURIComponent(JSON.stringify(draft)) }));
  let start = 0, beforeEnd = source.length, afterEnd = next.length;
  while (start < beforeEnd && start < afterEnd && source[start] === next[start]) start++;
  while (beforeEnd > start && afterEnd > start && source[beforeEnd - 1] === next[afterEnd - 1]) { beforeEnd--; afterEnd--; }
  return start === beforeEnd && start === afterEnd ? [] : [{ start, end: beforeEnd, text: next.slice(start, afterEnd) }];
}

function sourceActionPatches(source, rendered, action, pending = []) {
  if (!ACTIONS.has(action.action) || !action.indices.length && action.action !== 'export') throw new Error('Unknown CeTZ action.');
  if (action.action === 'focus' || action.action === 'select' || action.action === 'export') return [];
  if (action.action === 'properties') return propertiesWithPending(source, rendered, action, pending);
  if (action.action === 'front' || action.action === 'back')
    return moveToLayerEnd(source, rendered, action.indices, action.action === 'front');
  if (action.action === 'move-before' || action.action === 'move-after')
    return moveInOutline(source, rendered, action.indices, action.action === 'move-after');
  if (action.action === 'group') return groupPatches(source, rendered, action.indices);
  if (action.action === 'ungroup') return ungroupPatches(source, rendered, action.indices);
  if (action.action === 'reconnect') return reconnectPatches(source, rendered, action.indices, action.value);
  if (action.action === 'share-point') return sharePointPatches(source, rendered, action.indices, action.value);
  if (action.action === 'auto-share') return autoSharePatches(source, rendered, action.indices);
  if (action.action === 'rename-anchor') return renameAnchorPatches(source, rendered, action.indices, action.value);
  if (action.action === 'detach-point') return detachPointPatches(source, rendered, action.indices, action.value);
  if (action.action === 'rotate' || action.action === 'scale') return transformPatches(source, rendered, action);
  if (action.action === 'connect-straight' || action.action === 'connect-elbow')
    return connectorPatches(source, rendered, action.indices,
      action.action === 'connect-elbow' ? 'elbow' : 'straight', action.value);
  return action.action === 'duplicate' ? duplicate(source, rendered, action.indices)
    : reorder(source, rendered, action.indices, action.action);
}

module.exports = { sourceAction, sourceActionPatches };
