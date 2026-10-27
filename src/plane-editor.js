'use strict';

const { skipTrivia, closing, locateCanvases } = require('./scanner');
const { argumentsOf } = require('./properties');
const { coordinate } = require('./snapping');

const PLANE_NAMES = new Set(['on-xy','on-xz','on-zy','on-yz']);
const VECTOR_LIMIT = 1e6;
function literalName(call) {
  try { return JSON.parse(argumentsOf(call.call).args.find(a => a.key === 'name')?.value || 'null'); }
  catch { return null; }
}
function numericArguments(text, name, angle = false) {
  const match = new RegExp(`(?:^|[;\\s])(?:cetz\\.draw\\.)?${name}\\s*\\(`).exec(text);
  if (!match) return null;
  const start = text.indexOf('(', match.index), end = closing(text,start,'(',')');
  if (end < 0) return null;
  const callStart=match.index+match[0].search(/(?:cetz\.draw\.)?[\w-]+\s*\($/);
  const args=argumentsOf(text.slice(callStart,end+1)).args;
  const values = ['x','y','z'].map(axis => {
    const arg=args.find(arg=>arg.key===axis);
    if(!arg)return 0;
    const number=new RegExp(`^([+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+))${angle?'deg':''}$`).exec(arg.value.trim());
    return number?Number(number[1]):NaN;
  });
  return values.every(Number.isFinite) ? values : null;
}
function managedTransforms(source,parent,plane) {
  if(!parent||parent.bodyStart==null)return null;
  let i=skipTrivia(source,parent.bodyStart),ranges=[];
  for(const name of ['translate','rotate']){
    const match=new RegExp(`^(?:cetz\\.draw\\.)?${name}\\s*\\(`).exec(source.slice(i,plane.start));
    if(!match)return null;
    const open=i+match[0].length-1,end=closing(source,open,'(',')');
    if(end<0||end>=plane.start)return null;
    const parsed=argumentsOf(source.slice(i,end+1));
    if(parsed.args.length!==3||!['x','y','z'].every(axis=>parsed.args.some(arg=>arg.key===axis))||parsed.args.some(arg=>!arg.named))return null;
    ranges.push({name,start:i,end:end+1});i=skipTrivia(source,end+1);
    if(source[i]===';')i=skipTrivia(source,i+1);
  }
  if(i!==plane.start)return null;
  let tail=skipTrivia(source,plane.end);if(source[tail]===';')tail=skipTrivia(source,tail+1);
  return tail===parent.bodyEnd?ranges:null;
}
function planesFor(source, calls) {
  return calls.flatMap((call,index) => {
    if (!PLANE_NAMES.has(call.name) || call.bodyStart == null) return [];
    let view = call.group;
    while (view && !['ortho','perspective'].includes(view.name)) view = view.group;
    if (!view) return [];
    const parent = call.group;
    let name=parent&&literalName(parent);
    if(parent?.name==='scope'){const marker=/^\s*\/\/ GUI-CeTZ plane: ("gui-plane-\d+")/.exec(source.slice(parent.bodyStart,call.start));if(marker)name=JSON.parse(marker[1]);}
    const transforms=managedTransforms(source,parent,call);
    const managed = ['group','scope'].includes(parent?.name) && /^gui-plane-\d+$/.test(name || '') && transforms &&
      !argumentsOf(call.call).args.some(arg=>arg.named&&arg.key!=='body');
    const kind = call.name === 'on-yz' ? 'zy' : call.name.slice(3);
    const raw = argumentsOf(call.call).args.find(a => a.key === {xy:'z',xz:'y',zy:'x'}[kind])?.value || '0';
    const offset = Number(raw);
    const position = managed ? numericArguments(source.slice(transforms[0].start,transforms[0].end),'translate') :
      Number.isFinite(offset) ? (kind === 'xy' ? [0,0,offset] : kind === 'xz' ? [0,offset,0] : [offset,0,0]) : null;
    const angles = managed ? numericArguments(source.slice(transforms[1].start,transforms[1].end),'rotate',true) : [0,0,0];
    return [{ key:managed ? name : `source-plane-${call.start}`, label:managed ? `平面 ${name.slice('gui-plane-'.length)} · ${kind.toUpperCase()}` : `${call.name} · ${index+1}`,
      index,wrapperIndex:managed?calls.indexOf(parent):index,view:calls.indexOf(view), kind, managed, position, angles,
      start:call.start, bodyStart:call.bodyStart, bodyEnd:call.bodyEnd,
      wrapperStart:managed ? parent.start : call.start, wrapperEnd:managed ? parent.end : call.end,
      transformRanges:managed?transforms:null,base:managed ? parent.call : call.call }];
  });
}
function cameraInfo(source,call) {
  const body=source.slice(call.bodyStart,call.bodyEnd);
  const marker=/^\s*\/\/ GUI-CeTZ camera-position: (\[[^\n]+\])\r?\n[ \t]*cetz\.draw\.translate\([^\n]*\)[ \t]*(?:\r?\n)?/.exec(body);
  if(marker) {
    try {
      const position=JSON.parse(marker[1]), translate=numericArguments(marker[0],'translate');
      if(Array.isArray(position)&&position.length===3&&position.every((v,i)=>Number.isFinite(v)&&translate&&Math.abs(v+translate[i])<1e-8))
        return {position,end:call.bodyStart+marker[0].length};
    } catch {}
  }
  return {position:[0,0,0],end:call.bodyStart};
}
function cameraPositionPatches(source,rendered,payload) {
  if(!payload||!Array.isArray(payload.position)||payload.position.length!==3||!payload.position.every(n=>Number.isFinite(n)&&Math.abs(n)<=VECTOR_LIMIT))
    throw new Error('Enter a finite XYZ camera position.');
  const view=rendered.workspace.views.find(view=>view.index===payload.view),call=view&&rendered.calls[view.index];
  if(!call||payload.base!==call.call)throw new Error('The camera changed. Try its position again.');
  const info=cameraInfo(source,call), position=payload.position.map(coordinate);
  return [{start:call.bodyStart,end:info.end,text:'\n// GUI-CeTZ camera-position: '+JSON.stringify(position)+'\n'+
    'cetz.draw.translate('+['x','y','z'].map((axis,i)=>axis+': '+coordinate(-position[i])).join(', ')+')\n'}];
}
function validatePose(payload) {
  if (!payload || !['xy','xz','zy'].includes(payload.kind) ||
      ![payload.position,payload.angles].every(v => Array.isArray(v) && v.length === 3 && v.every(n => Number.isFinite(n) && Math.abs(n) <= VECTOR_LIMIT)))
    throw new Error('Enter a drawing plane, finite XYZ position and three rotation angles.');
}
function nextPlaneName(source) {
  let id = 1;
  while (source.includes(`"gui-plane-${id}"`)) id++;
  return `gui-plane-${id}`;
}
function planeCode(source, name, payload, body = '\n') {
  validatePose(payload);
  body=require('./plane-boolean').installLocalBooleans(body);
  const func = payload.kind === 'zy' ? /@preview\/cetz:0\.4\./.test(source) ? 'on-yz' : 'on-zy' : 'on-'+payload.kind;
  const axes = ['x','y','z'];
  return `cetz.draw.scope({\n  // GUI-CeTZ plane: ${JSON.stringify(name)}\n` +
    `  cetz.draw.translate(${axes.map((a,i) => `${a}: ${coordinate(payload.position[i])}`).join(', ')})\n` +
    `  cetz.draw.rotate(${axes.map((a,i) => `${a}: ${coordinate(payload.angles[i])}deg`).join(', ')})\n` +
    `  cetz.draw.${func}({${body}})\n})`;
}
function createPlanePatches(source, rendered, payload) {
  validatePose(payload);
  const view = rendered.workspace.views.find(view => view.index === payload.view);
  const target = view && rendered.calls[view.index];
  if (!target || target.bodyStart == null) throw new Error('Choose a current 3D view.');
  const key = nextPlaneName(source);
  const at=cameraInfo(source,target).end;
  const patches = [{start:at,end:at,text:'\n'+planeCode(source,key,payload)+'\n'}];
  patches.activePlaneKey = key;
  return patches;
}
function planeSettingsPatches(source, rendered, payload) {
  validatePose(payload);
  const plane = rendered.workspace.planes.find(plane => plane.key === payload.key);
  if (!plane || plane.base !== payload.base) throw new Error('The plane changed. Select it again before applying its settings.');
  const key = plane.managed ? plane.key : nextPlaneName(source);
  if(plane.managed){
    const patches=[];
    for(const range of plane.transformRanges){
      const parsed=argumentsOf(source.slice(range.start,range.end));
      for(const [i,axis] of ['x','y','z'].entries()){
        const arg=parsed.args.find(arg=>arg.key===axis);
        if(!arg)throw new Error('The managed plane transform changed. Edit its source.');
        patches.push({start:range.start+arg.valueStart,end:range.start+arg.valueEnd,text:String(coordinate((range.name==='rotate'?payload.angles:payload.position)[i]))+(range.name==='rotate'?'deg':'')});
      }
    }
    if(plane.kind!==payload.kind){
      const call=rendered.calls[plane.index], at=call.start+(call.call.startsWith('cetz.draw.')?'cetz.draw.'.length:0);
      const func=payload.kind==='zy'?/@preview\/cetz:0\.4\./.test(source)?'on-yz':'on-zy':'on-'+payload.kind;
      patches.push({start:at,end:at+call.name.length,text:func});
    }
    const body=source.slice(plane.bodyStart,plane.bodyEnd),local=require('./plane-boolean').installLocalBooleans(body);
    if(local!==body)patches.push({start:plane.bodyStart,end:plane.bodyEnd,text:local});
    patches.activePlaneKey=key;return patches;
  }
  const patches = [{start:plane.wrapperStart,end:plane.wrapperEnd,
    text:planeCode(source,key,payload,source.slice(plane.bodyStart,plane.bodyEnd))}];
  patches.activePlaneKey = key;
  return patches;
}
function convertTo3D(source, canvas) {
  const key = nextPlaneName(source);
  const body = source.slice(canvas.bodyStart,canvas.bodyEnd);
  const patches = [{start:canvas.bodyStart,end:canvas.bodyEnd,
    text:'\ncetz.draw.ortho({\n'+planeCode(source,key,{kind:'xy',position:[0,0,0],angles:[0,0,0]},body)+'\n})\n'}];
  patches.activePlaneKey = key;
  return patches;
}
function resolvePlane(source, canvas, descriptor) {
  const { locate3DCalls } = require('./three-dimensional');
  const planes = planesFor(source,locate3DCalls(source,canvas));
  const key = typeof descriptor === 'string' ? descriptor : descriptor?.key;
  return planes.find(plane => plane.key === key) || null;
}
function rebasePlaneKey(key, before, after) {
  if (!key?.startsWith('source-plane-') || before === after) return key;
  const offset = Number(key.slice('source-plane-'.length));
  let start=0, endBefore=before.length, endAfter=after.length;
  while(start<endBefore && start<endAfter && before[start]===after[start]) start++;
  while(endBefore>start && endAfter>start && before[endBefore-1]===after[endAfter-1]) {endBefore--;endAfter--;}
  if (endBefore <= offset) return 'source-plane-'+(offset+endAfter-endBefore);
  if (start <= offset) return null;
  return key;
}
// Carry only lexical definitions and style statements into a plane's local
// view. Transformations and other drawing calls belong to the 3D embedding.
function localPrelude(text) {
  let result='', i=0;
  while(i<text.length) {
    i=skipTrivia(text,i);
    const start=i, name=/^(?:cetz\.draw\.)?([A-Za-z_][\w-]*)/.exec(text.slice(i));
    if(!name) {i++;continue;}
    i+=name[0].length;
    let at=skipTrivia(text,i);
    if(['import','let'].includes(name[1])) {
      for(;i<text.length;i++) {
        if(text[i]==='"') {for(i++;i<text.length;i++){if(text[i]==='\\') i++; else if(text[i]==='"') break;}}
        else if('([{'.includes(text[i])) {const end=closing(text,i,text[i],{'(':')','[':']','{':'}'}[text[i]]);if(end>=0)i=end;}
        else if(text[i]==='\n'||text[i]===';') break;
      }
      result+=text.slice(start,i)+'\n'; i++; continue;
    }
    if(text[at]==='(') {
      const end=closing(text,at,'(',')');
      if(end>=0) { if(['set-style','fill','stroke'].includes(name[1])) result+=text.slice(start,end+1)+'\n'; i=end+1; continue; }
    }
    if('([{'.includes(text[at])) {const end=closing(text,at,text[at],{'(':')','[':']','{':'}'}[text[at]]);if(end>=0) {i=end+1;continue;}}
  }
  return result;
}
function planeCanvas(source, canvas, plane) {
  const { locate3DCalls } = require('./three-dimensional');
  const calls=locate3DCalls(source,canvas), selected=calls.find(call=>call.start===plane.start);
  if(!selected) throw new Error('The drawing plane no longer exists.');
  const ancestors=[];
  for(let current=selected;current;current=current.group) ancestors.unshift(current);
  let start=canvas.bodyStart, prelude='import cetz.draw: *\n';
  for(const ancestor of ancestors) {
    prelude+=localPrelude(source.slice(start,ancestor.start));
    start=ancestor.bodyStart;
  }
  const syntheticStart=canvas.bodyStart+prelude.length;
  const text=source.slice(0,canvas.bodyStart)+prelude+source.slice(plane.bodyStart,plane.bodyEnd)+source.slice(canvas.bodyEnd);
  const syntheticCanvas=locateCanvases(text).find(item=>item.start===canvas.start);
  return {text,canvas:syntheticCanvas,delta:plane.bodyStart-syntheticStart};
}
async function renderPlane2D(source, canvas, key, filePath, full) {
  const plane=resolvePlane(source,canvas,key);
  if(!plane) throw new Error('The drawing plane no longer exists. Return to 3D drawing and select a plane.');
  const synthetic=planeCanvas(source,canvas,plane);
  const { renderEditable }=require('./advanced');
  const local=await renderEditable(synthetic.text,synthetic.canvas,filePath);
  if(local.mode==='3d') throw new Error('This plane contains spatial coordinates or nested projections. Edit those in the 3D view.');
  for(const call of local.calls) {
    call.start+=synthetic.delta; call.end+=synthetic.delta;
    if(call.start<plane.bodyStart || call.end>plane.bodyEnd) throw new Error('Cannot safely map this plane to its source.');
  }
  local.xml=local.xml.replace(/cetzStart=(\d+);/g,(_,start)=>`cetzStart=${Number(start)+synthetic.delta};`);
  local.mode='plane-2d';
  local.canvas={...canvas,bodyStart:plane.bodyStart,bodyEnd:plane.bodyEnd};
  local.planeContext={key:plane.key,label:plane.label,bodyStart:plane.bodyStart,bodyEnd:plane.bodyEnd};
  local.source=source;
  const workspace={...full.workspace,activePlaneKey:plane.key};
  local.xml=local.xml.replace(/(<mxCell id="cetz-preview-background"[^>]*style=")/,`$1cetzMode=plane-2d;cetzWorkspace=${encodeURIComponent(JSON.stringify(workspace))};cetzPlaneContext=${encodeURIComponent(JSON.stringify(local.planeContext))};`);
  return local;
}
module.exports={cameraInfo,cameraPositionPatches,PLANE_NAMES,planesFor,planeCode,createPlanePatches,planeSettingsPatches,convertTo3D,resolvePlane,rebasePlaneKey,planeCanvas,renderPlane2D};
