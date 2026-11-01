'use strict';

const { locateCanvases, closing, deletionRange } = require('./scanner');
const { argumentsOf } = require('./properties');
const { createHash } = require('node:crypto');
const fingerprint = text => createHash('sha256').update(text.replace(/\s+/g, '')).digest('hex');
// Only remove the exact generated v1 definitions; preserve hand-edited code.
const LEGACY_ADAPTER = '56cf87a7cc48f623696660197cbe38f6d086d5f461d02586b8754e3ecefa8986';
const LEGACY_BINDINGS = new Set([
  'ae52cc60b1e8a438eee180b38c5dface1ec076582f6740ae484581589d8a1768',
  '93f294c79383d9e8eb7dcc026c9dfcd57a989f979bb35d724bb6d035adb17290',
  '0180cd6afb52fd7b7c2bdf08ac4585fef11eead0810089f1fb9e14cdc1425711',
  'b3502bed6cf9788296d8657c067410798ecea1b9caa68ab33405fe2060d0f46a',
  'cf4fef583b523c5e40781f2a7dfebb6d26de98d153c6820a9e74dd19bd7512e1',
  '5099a9ebdf9bc5104b08f74a71d8598b4fcf19affca5f2f94b5ab89755e779d6',
  '76d4c1fdec4ccd8f0b8f30cc379d05f867445d762629f91ac0109a1186a3a9ca',
  'ecffdbeb9cd0dee93eca6e32991be0da95aee7c8d9c947a9b43388683efb2f97'
]);
const MARKER = '// GUI-CeTZ plane content v1';
const BINDING_MARKER = '// GUI-CeTZ plane bindings';
function skipNonCode(source, i) {
  if (/\s/.test(source[i])) return i + 1;
  if (source.startsWith('//', i)) {
    const end = source.indexOf('\n', i); return end < 0 ? source.length : end + 1;
  }
  if (source.startsWith('/*', i)) {
    let depth = 1; i += 2;
    while (i < source.length && depth) {
      if (source.startsWith('/*', i)) { depth++; i += 2; }
      else if (source.startsWith('*/', i)) { depth--; i += 2; }
      else i++;
    }
    return i;
  }
  return i;
}
const PLANE_NAMES = new Set(['on-xy', 'on-xz', 'on-zy', 'on-yz']);

// Migrate the generated v1 wrappers. Scan code so marker text in a label or
// quoted string is never mistaken for generated source. Keep user geometry.
function adapterRanges(source) {
  const ranges = [];
  for (let i = 0; i < source.length;) {
    const marker = source.startsWith(MARKER, i) ? MARKER :
      source.startsWith(BINDING_MARKER + '\n', i) || source.startsWith(BINDING_MARKER + '\r\n', i) ? BINDING_MARKER : null;
    if (marker) {
      const endMarker = marker === MARKER ? '// GUI-CeTZ plane content end' : '// GUI-CeTZ plane bindings end';
      const end = source.indexOf(endMarker, i + marker.length);
      if (end >= 0) {
        const body = source.slice(i + marker.length, end).trim();
        const generated = marker === MARKER
          ? fingerprint(body) === LEGACY_ADAPTER
          : body.length > 0 && body.split(/\r?\n/).every(line => !line.trim() || LEGACY_BINDINGS.has(fingerprint(line.trim().replace(/^let [\w-]+\s*=\s*/, ''))));
        if (generated) {
          ranges.push({ ...deletionRange(source, i, end + endMarker.length), adapter: marker === MARKER });
          i = end + endMarker.length; continue;
        }
      }
    }
    const next = skipNonCode(source, i);
    if (next !== i) { i = next; continue; }
    if (source[i] === '"') {
      for (i++; i < source.length; i++) {
        if (source[i] === '\\') i++;
        else if (source[i] === '"') { i++; break; }
      }
      continue;
    }
    if (source[i] === '[') {
      const end = closing(source, i, '[', ']');
      if (end >= 0) { i = end + 1; continue; }
    }
    i++;
  }
  return ranges.filter(range => range.adapter || ranges.some(adapter => adapter.adapter && adapter.start < range.start));
}
function withoutAdapters(source) {
  for (const range of adapterRanges(source).reverse())
    source = source.slice(0, range.start) + source.slice(range.start, range.end).replace(/[^\r\n]/g, ' ') + source.slice(range.end);
  return source;
}
const apply = (source, patches) => [...patches].sort((a, b) => b.start - a.start)
  .reduce((text, p) => text.slice(0, p.start) + p.text + text.slice(p.end), source);

// Resolve selective draw imports within their lexical block, including aliases.
// This is only used for source normalization, not to expand arbitrary macros.
function importResolver(source, canvas) {
  const imports = [], scopes = [{ end: canvas.bodyEnd }];
  for (let i = canvas.bodyStart; i < canvas.bodyEnd;) {
    const next = skipNonCode(source, i);
    if (next !== i) { i = next; continue; }
    if (source[i] === '"') {
      for (i++; i < canvas.bodyEnd; i++) {
        if (source[i] === '\\') i++;
        else if (source[i] === '"') { i++; break; }
      }
      continue;
    }
    if (source[i] === '[') {
      const end = closing(source, i, '[', ']');
      if (end >= 0) { i = end + 1; continue; }
    }
    while (i >= scopes.at(-1).end && scopes.length > 1) scopes.pop();
    if (source[i] === '{') {
      const end = closing(source, i, '{', '}');
      if (end >= 0) scopes.push({ end });
    }
    const match = /^(?:import)\s+cetz\.draw\s*:\s*(\*|[\w-]+(?:[ \t]+as[ \t]+[\w-]+)?(?:\s*,\s*[\w-]+(?:[ \t]+as[ \t]+[\w-]+)?)*)/.exec(source.slice(i, canvas.bodyEnd));
    if (match && !/[\w.]/.test(source[i - 1] || '')) {
      const names = new Map(match[1].split(',').map(part => {
        const [name, alias] = part.trim().split(/\s+as\s+/); return [alias || name, name];
      }));
      imports.push({ start: i, end: scopes.at(-1).end, names });
      i += match[0].length; continue;
    }
    i++;
  }
  return (name, offset) => imports.findLast(entry => entry.start < offset && offset < entry.end && entry.names.has(name))?.names.get(name) || name;
}
function installation(source, canvas) {
  const calls = require('./three-dimensional').locate3DCalls(source, canvas, importResolver(source, canvas));
  const patches = [];
  for (const call of calls) {
    if (call.name !== 'content') continue;
    let plane = call.group;
    while (plane && !PLANE_NAMES.has(plane.name)) plane = plane.group;
    if (!plane) continue;
    const parsed = argumentsOf(call.call), args = parsed.args.filter(arg => !arg.empty);
    // An explicit angle, including 0deg, remains the author's choice. Spreads
    // may supply an angle or coordinates that cannot safely be inferred.
    if (args.some(arg => arg.key === 'angle' || arg.value.startsWith('..'))) continue;
    const positional = args.filter(arg => !arg.named);
    if (![2, 3].includes(positional.length)) continue;
    // Two-corner content resolves its second corner before angle. A relative
    // direction would then point from the first corner toward that corner.
    // Leave bounded layouts unchanged rather than duplicate a position that
    // would become stale when a point is edited.
    if (positional.length === 3 && positional[1].value !== 'auto') continue;
    const angle = '(rel: (1, 0))';
    const last = args.filter(arg => arg.end <= parsed.end).at(-1);
    // Insert at the final expression rather than after a possible line comment.
    const offset = last ? last.valueEnd : parsed.open + 1;
    patches.push({ start: call.start + offset, end: call.start + offset,
      text: `${last ? ', ' : ''}angle: ${angle}` });
  }
  return patches;
}
function prepare(source, index) {
  const canvases = locateCanvases(source);
  const removed = adapterRanges(source).filter(range => canvases.some((canvas, i) =>
    (index === undefined || index === i) && range.start >= canvas.bodyStart && range.end <= canvas.bodyEnd))
    .map(range => ({ ...range, text: '' }));
  const clean = apply(source, removed);
  const originalOffset = offset => {
    let result = offset, deleted = 0;
    for (const range of removed) {
      if (offset < range.start - deleted) break;
      result += range.end - range.start;
      deleted += range.end - range.start;
    }
    return result;
  };
  const added = locateCanvases(clean).flatMap((canvas, i) => index === undefined || index === i ? installation(clean, canvas) : [])
    .map(p => ({ ...p, start: originalOffset(p.start), end: originalOffset(p.end) }));
  const patches = [...removed, ...added];
  return { text: apply(source, patches), patches };
}

function rebaseKey(key,patches) {
  if(!key?.startsWith('source-plane-'))return key;
  const offset=Number(key.slice('source-plane-'.length));
  return 'source-plane-'+(offset+patches.filter(p=>p.end<=offset).reduce((sum,p)=>sum+p.text.length-(p.end-p.start),0));
}
async function installInDocument(vscode,document,index) {
  const source=document.getText(),version=document.version,{text,patches}=prepare(source,index);
  if(!patches.length)return false;
  const {renderCanvas}=require('./preview');
  const canvases=require('./scanner').locateCanvases(text);
  for(let i=0;i<canvases.length;i++)if(index===undefined||index===i)await renderCanvas(text,canvases[i],document.uri.fsPath);
  if(document.version!==version)throw new Error('Typst changed while plane content was being prepared. Try opening the drawing again.');
  const edit=new vscode.WorkspaceEdit();
  for(const patch of patches)edit.replace(document.uri,new vscode.Range(document.positionAt(patch.start),document.positionAt(patch.end)),patch.text);
  if(!await vscode.workspace.applyEdit(edit))throw new Error('Could not save the plane content angle.');
  return true;
}

module.exports = { MARKER, prepare, withoutAdapters, rebaseKey, installInDocument };
