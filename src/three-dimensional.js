'use strict';

const { closing, skipTrivia, splitArgs, deletionRange } = require('./scanner');
const { renderCanvas } = require('./preview');
const { layerInstrumentation, splitSvgLayers } = require('./svg-layers');
const { propertyModel, SCHEMAS, argumentsOf } = require('./properties');
const { probesFor, calibratedViews, calibratedPlanes, axisRanges, project, planePoint, insertion3D } = require('./three-workspace');

const CONTAINERS = new Set(['ortho', 'perspective', 'on-xy', 'on-xz', 'on-zy', 'on-yz', 'group', 'scope']);
const MESSAGE = '3D: use the view controls and drawing plane tools. Edit existing geometry in Properties; free screen transformations are ambiguous in 3D.';

// Preserve token boundaries while removing comments, strings and content. Never
// interpret a function name mentioned in a label as a projection environment.
function codeOnly(text) {
  let result = '';
  for (let i = 0; i < text.length;) {
    if (text.startsWith('//', i) || text.startsWith('/*', i)) {
      const end = skipTrivia(text, i); result += ' '; i = end; continue;
    }
    if (text[i] === '"') {
      i++;
      while (i < text.length) {
        if (text[i] === '\\') i += 2;
        else if (text[i++] === '"') break;
      }
      result += ' '; continue;
    }
    if (text[i] === '[') {
      const end = closing(text, i, '[', ']');
      if (end >= 0) { i = end + 1; result += ' '; continue; }
    }
    result += text[i++];
  }
  return result;
}
function is3DCanvas(source, canvas) {
  const code = codeOnly(source.slice(canvas.bodyStart, canvas.bodyEnd));
  const n = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)';
  if (/\b(?:ortho|perspective|on-xy|on-xz|on-zy|on-yz|set-transform)\s*\(/.test(code) ||
      /\bz\s*:/.test(code) || /\brotate\s*\([^)]*\b(?:x|y|yaw|pitch|roll)\s*:/.test(code)) return true;
  const tuple = new RegExp(`\\(\\s*${n}\\s*,\\s*${n}\\s*,\\s*${n}\\s*,?\\s*\\)`);
  // Only coordinate/vector arguments indicate 3D. Three-element tension,
  // dash and other style arrays must retain the existing 2D editing path.
  const counts = { rect: 2, circle: 1, content: 1, polygon: 1, arc: 1, 'n-star': 1,
    grid: 2, 'rect-around': 2, translate: 1, scale: 1, 'set-origin': 1, 'move-to': 1, 'set-viewport': 2,
    'circle-through': 3, 'arc-through': 3, 'bezier-through': 3, mark: 2 };
  for (const match of code.matchAll(/\b([\w-]+)\s*\(/g)) {
    const name = match[1];
    if (!Object.hasOwn(counts, name) && !['line', 'bezier', 'hobby', 'catmull', 'anchor'].includes(name)) continue;
    const open = match.index + match[0].length - 1, end = closing(code, open, '(', ')');
    if (end < 0) continue;
    const args = splitArgs(code, open + 1, end);
    if (name === 'set-viewport' && args.some(arg => /^\s*bounds\s*:/.test(code.slice(arg.start, arg.end)) && tuple.test(code.slice(arg.start, arg.end)))) return true;
    let positional = args.filter(arg => !/^\s*[\w-]+\s*:/.test(code.slice(arg.start, arg.end)));
    if (name === 'anchor') positional = positional.slice(1, 2);
    else if (Object.hasOwn(counts, name)) positional = positional.slice(0, counts[name]);
    if (positional.some(arg => tuple.test(code.slice(arg.start, arg.end)))) return true;
  }
  return false;
}
function locate3DCalls(source, canvas) {
  const calls = [];
  function scan(start, limit, group = null) {
    for (let i = start; i < limit;) {
      const next = skipTrivia(source, i);
      if (next !== i) { i = next; continue; }
      if (source[i] === '"') {
        i++;
        while (i < limit) {
          if (source[i] === '\\') i += 2;
          else if (source[i++] === '"') break;
        }
        continue;
      }
      if ('([{'.includes(source[i])) {
        const end = closing(source, i, source[i], { '(': ')', '[': ']', '{': '}' }[source[i]]);
        i = end < 0 ? i + 1 : end + 1; continue;
      }
      const match = /^(?:cetz\.draw\.)?([A-Za-z_][\w-]*)/.exec(source.slice(i));
      if (!match || /[\w.]/.test(source[i - 1] || '')) { i++; continue; }
      const name = match[1], open = skipTrivia(source, i + match[0].length);
      if (source[open] !== '(') { i += name.length; continue; }
      const end = closing(source, open, '(', ')');
      if (end < 0 || end >= limit) { i += name.length; continue; }
      const call = { name, start: i, end: end + 1, call: source.slice(i, end + 1), group,
        mode: '3d', points: [], transform: { tx: 0, ty: 0, sx: 1, sy: 1 } };
      if (CONTAINERS.has(name)) {
        call.container = true;
        for (const arg of splitArgs(source, open + 1, end)) {
          let brace = skipTrivia(source, arg.start);
          const bodyKey = /^body\s*:\s*/.exec(source.slice(brace, arg.end));
          if (bodyKey) brace = skipTrivia(source, brace + bodyKey[0].length);
          if (source[brace] !== '{') continue;
          const close = closing(source, brace, '{', '}');
          if (close >= 0 && skipTrivia(source, close + 1) >= arg.end) {
            call.bodyStart = brace + 1; call.bodyEnd = close;
            scan(brace + 1, close, call);
          }
        }
        calls.push(call); // Children precede their parent for bounds aggregation.
      } else if (Object.hasOwn(SCHEMAS, name)) calls.push(call);
      i = end + 1;
    }
  }
  scan(canvas.bodyStart, canvas.bodyEnd);
  return calls;
}

function instrumentation(layerName, tagName, tagPrefix) {
  // Tag leaf drawables before CeTZ projects/sorts them. Add measurement
  // markers only after all projection, culling and sorting have completed.
  const layers = layerInstrumentation(layerName).replace('for d in drawables {', `for d in drawables {
      let owner = d.tags.find(t => type(t) == str and t.starts-with("${tagPrefix}"))
      if owner == none { marked.push(d); continue }
      let index = int(owner.slice(${tagPrefix.length}))`);
  return layers + `
let ${tagName}(body, index, no-bounds: false) = {
  let wrap(f) = ctx => {
    let element = f(ctx)
    let drawables = element.at("drawables", default: ())
    if type(drawables) == dictionary { drawables = (drawables,) }
    element.insert("drawables", drawables.map(d => {
      d.tags += ("${tagPrefix}" + str(index),)
      if no-bounds { d.tags += ("no-bounds",) }
      d
    }))
    element
  }
  if type(body) == array { body.map(wrap) } else { wrap(body) }
}
`;
}
const px = value => Number(value.toFixed(5));
function union(boxes) {
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
  return { x, y, width: Math.max(...boxes.map(b => b.x + b.width)) - x,
    height: Math.max(...boxes.map(b => b.y + b.height)) - y };
}
function projectionTransforms(source,call){
  const transforms=[];
  for(let i=require('./plane-editor').cameraInfo(source,call).end;i<call.bodyEnd;){
    i=skipTrivia(source,i);if(i>=call.bodyEnd)break;
    if(source[i]==='"'){for(i++;i<call.bodyEnd;i++){if(source[i]==='\\')i++;else if(source[i]==='"'){i++;break;}}continue;}
    const name=/^(?:cetz\.draw\.)?([\w-]+)\s*\(/.exec(source.slice(i,call.bodyEnd));
    if(name){
      if(['translate','rotate','scale','transform','set-transform','set-origin','reset-transform'].includes(name[1]))transforms.push(i);
      const end=closing(source,i+name[0].length-1,'(',')');if(end>=0){i=end+1;continue;}
    }
    if('([{'.includes(source[i])){const end=closing(source,i,source[i],{'(':')','[':']','{':'}'}[source[i]]);if(end>=0){i=end+1;continue;}}
    i++;
  }
  return transforms;
}
async function render3D(source, canvas, filePath) {
  const calls = locate3DCalls(source, canvas);
  let stem = '__gui_cetz_3d';
  while (source.includes(stem)) stem += '_';
  const layer = stem + '_layer', tag = stem + '_tag', prefix = stem + '_owner_';
  const edits = [{ offset: canvas.bodyStart, text: instrumentation(layer, tag, prefix) + `\n${layer}({\n` },
    { offset: canvas.bodyEnd, text: '\n}, 0)\n' }];
  calls.forEach((call, index) => {
    if (call.container) return;
    edits.push({ offset: call.start, text: `${tag}(` }, { offset: call.end, text: `, ${index})` });
  });
  const planes = require('./plane-editor').planesFor(source,calls);
  planes.forEach(plane=>{
    const boxes=calls.filter(call=>!call.container&&call.start>=plane.bodyStart&&call.end<=plane.bodyEnd).map(call=>{try{return require('./advanced').boundsFor(call);}catch{return null;}}).filter(Boolean);
    plane.localBounds=union(boxes)||{x:-2.5,y:-2.5,width:5,height:5};
    plane.snapPoints=calls.filter(call=>call.group===calls[plane.index]).flatMap(call=>(propertyModel(call)?.fields||[])
      .filter(field=>field.key.startsWith('$')&&field.point&&field.point.length===2).map(field=>field.point)).slice(0,256);
  });
  const probes = probesFor(calls, tag, planes, source);
  edits.push(...probes.edits);
  const input = edits.sort((a, b) => b.offset - a.offset).reduce((text, edit) =>
    text.slice(0, edit.offset) + edit.text + text.slice(edit.offset), source);
  const added = input.length - source.length;
  let split = splitSvgLayers(await renderCanvas(input, {
    ...canvas, bodyEnd: canvas.bodyEnd + added, end: canvas.end + added
  }, filePath), probes.count, probes.excluded);
  let view = /\bviewBox="([^"]+)"/.exec(split.svg)?.[1].trim().split(/\s+/).map(Number);
  // An empty or fully culled scene has no canvas bounds, so CeTZ omits
  // all bounds-free probes. Retry with bounded probes only for this empty
  // preview; the probes are still stripped from the displayed artwork.
  if (view && view[2] <= 1 && view[3] <= 1 && probes.projections.length && calibratedViews(probes,split.layers).every(view => !view.matrix)) {
    const measured = input.split('\n').map(line => line.includes(tag+'(') && /, no-bounds: true\)$/.test(line) ? line.replace(/, no-bounds: true\)$/,', no-bounds: false)') : line).join('\n');
    const extra = measured.length-source.length;
    split = splitSvgLayers(await renderCanvas(measured,{...canvas,bodyEnd:canvas.bodyEnd+extra,end:canvas.end+extra},filePath),probes.count,probes.excluded);
    view = /\bviewBox="([^"]+)"/.exec(split.svg)?.[1].trim().split(/\s+/).map(Number);
  }
  if (!view || view.length !== 4 || !view.every(Number.isFinite) || view[2] < 0 || view[3] < 0)
    throw new Error('Invalid 3D SVG bounds.');
  if (!view[2] || !view[3]) {
    view[2] = Math.max(1,view[2]); view[3] = Math.max(1,view[3]);
    split.svg = split.svg.replace(/viewBox="[^"]*"/, `viewBox="${view.join(' ')}"`)
      .replace(/width="[^"]*"/, `width="${view[2]}pt"`).replace(/height="[^"]*"/, `height="${view[3]}pt"`);
  }
  calls.forEach((call, index) => {
    const boxes = split.layers.filter(l => l.owner === index && l.bounds).map(l => {
      const [x, y, width, height] = l.bounds;
      return { x, y, width, height };
    });
    if (call.container) boxes.push(...calls.filter(child => child.group === call && child.projectedBounds)
      .map(child => child.projectedBounds));
    call.projectedBounds = union(boxes);
  });
  const scale = 2.5, margin = 80;
  const calibrated = calibratedViews(probes, split.layers);
  const origin = calibrated.find(view => view.matrix)?.matrix;
  const firstView=calibrated.find(view=>view.matrix);
  const firstCamera=firstView&&require('./plane-editor').cameraInfo(source,calls[firstView.index]);
  const zero = origin && project(origin, firstCamera?.position||[0,0,0]);
  const shift = zero ? [500 - zero[0] * scale, 500 - zero[1] * scale] : [margin - view[0] * scale, margin - view[1] * scale];
  const modelMatrix = matrix => matrix && [
    matrix[0].map((value,i)=>value*scale+shift[0]*matrix[2][i]),
    matrix[1].map((value,i)=>value*scale+shift[1]*matrix[2][i]),matrix[2]];
  const workspace = { planes:planes.map(plane=>({...plane, matrix:modelMatrix(calibratedPlanes(probes,split.layers).find(item=>item.index===plane.index)?.matrix)})), views: calibrated.map(view => ({ ...view, key:`view-${calls[view.index].start}`,base:calls[view.index].call,position:require('./plane-editor').cameraInfo(source,calls[view.index]).position,matrix: view.matrix && [
    view.matrix[0].map((value, i) => value * scale + shift[0] * view.matrix[2][i]),
    view.matrix[1].map((value, i) => value * scale + shift[1] * view.matrix[2][i]),
    view.matrix[2]
  ] })) };
  const transforms=new Map(workspace.views.map(view=>[view.index,projectionTransforms(source,calls[view.index])]));
  workspace.objects=calls.flatMap((call,index)=>{
    if(!['line','content'].includes(call.name)||!['ortho','perspective'].includes(call.group?.name))return [];
    const view=workspace.views.find(view=>view.index===calls.indexOf(call.group));
    if(!view)return [];
    const fields=propertyModel(call).fields,count=call.name==='line'?2:1;
    const points=Array.from({length:count},(_,i)=>fields.find(field=>field.key==='$'+i)?.point);
    const guidable=!!view.matrix&&points.every(Boolean)&&!transforms.get(view.index).some(at=>at<call.start);
    return [{index,view:view.index,kind:call.name,base:call.call,guidable,points:points.every(Boolean)?points.map(p=>[p[0],p[1],p[2]||0]):null,
      text:call.name==='content'?fields.find(field=>field.key==='$1')?.text??null:null}];
  });
  function geometry(box) {
    return { x: px(shift[0] + box.x * scale), y: px(shift[1] + box.y * scale),
      width: px(box.width * scale), height: px(box.height * scale) };
  }
  function vertex(id, style, g, extra = '') {
    return `<mxCell id="${id}" value="" style="${style}" vertex="1" parent="1" ${extra}><mxGeometry x="${g.x}" y="${g.y}" width="${g.width}" height="${g.height}" as="geometry"/></mxCell>`;
  }
  const fixed = 'movable=0;resizable=0;rotatable=0;deletable=0;editable=0;connectable=0;';
  const size = geometry({ x: view[0], y: view[1], width: view[2], height: view[3] });
  const image = vertex('cetz-preview-image', `${fixed}shape=image;imageAspect=1;selectable=0;pointerEvents=0;image=data:image/svg+xml,${encodeURIComponent(split.svg)};`, size);
  const background = vertex('cetz-preview-background', `${fixed}opacity=0;selectable=0;pointerEvents=0;cetzMode=3d;cetzWorkspace=${encodeURIComponent(JSON.stringify(workspace))};`, size);
  // Keep one complete image: splitting visual artwork across owners would
  // change the painter's order when a projection sorts their drawables.
  const handles = calls.map((call, index) => {
    const model = propertyModel(call);
    const args = argumentsOf(call.call);
    const planeLabel=planes.find(plane=>plane.wrapperStart===call.start);
    const label = planeLabel?.label || args.args.find(arg => arg.key === 'name')?.value || call.name;
    const box = call.projectedBounds;
    // Hidden hit boxes still participate in Outline and source selection.
    const object=workspace.objects.find(object=>object.index===index),point=object?.guidable&&project(workspace.views.find(view=>view.index===object.view).matrix,object.points[0]);
    const g = box ? geometry(box) : point?{x:point[0]-4,y:point[1]-4,width:8,height:8}:{ x: margin, y: margin, width: 1, height: 1 };
    call.geometry = g;
    return vertex(`cetz-edit-${index}`, `${fixed}fillColor=none;strokeColor=none;pointerEvents=${call.container ? 0 : 1};cetzMode=3d;cetzSourceIndex=${index};cetzKind=${call.name};cetzLabel=${encodeURIComponent(label)};cetzStart=${call.start};cetzGroup=${call.group ? calls.indexOf(call.group) : ''};cetzProperties=${encodeURIComponent(JSON.stringify(model))};`, g,
      box && !call.container ? '' : 'visible="0"');
  }).join('');
  workspace.views.forEach(view=>{
    const owner=calls[view.index];
    const belongs=call=>{for(let parent=call.group;parent;parent=parent.group)if(parent===owner)return true;return false;};
    const boxes=calls.filter(call=>!call.container&&call.projectedBounds&&belongs(call)).map(call=>geometry(call.projectedBounds));
    view.bounds=union(boxes)||size;
    view.axisRanges=view.matrix?axisRanges(view.matrix,view.bounds):null;
    const origin=view.matrix&&project(view.matrix,[0,0,0]);
    const unit=origin?Math.max(...[0,1,2].map(axis=>{const p=[0,0,0];p[axis]=1;const q=project(view.matrix,p);return q?Math.hypot(q[0]-origin[0],q[1]-origin[1]):0;})):0;
    const span=origin?Math.max(Math.abs(view.bounds.x-origin[0]),Math.abs(view.bounds.x+view.bounds.width-origin[0]),Math.abs(view.bounds.y-origin[1]),Math.abs(view.bounds.y+view.bounds.height-origin[1])):0;
    view.gridRange=unit>1e-7?Math.min(10000,Math.max(2,Math.ceil(span/unit)+2)):5;
    view.guides = grid3D(view);
  });
  // Bounds are attached after handle geometry has been computed.
  // Keep transient orbit textures outside workspace metadata: ordinary UI and
  // hit testing must not parse/stringify SVGs. One texture per plane also shares
  // its definitions, instead of duplicating them for every hoverable object.
  const orbit = { geometry:size, views:workspace.views.map(view => {
    if(!['ortho','perspective'].includes(view.kind))return {index:view.index,parts:null};
    const owner=calls[view.index], args=argumentsOf(owner.call).args;
    if(args.some(arg=>arg.key==='cull-face'&&arg.value.trim()!=='none'||arg.key==='flatten'&&arg.value.trim()!=='false'))return {index:view.index,parts:null};
    const belongs=call=>{for(let parent=call.group;parent;parent=parent.group)if(parent===owner)return true;return false;};
    const planeParts=new Map(workspace.planes.filter(plane=>plane.view===view.index).map(plane=>[plane.key,{type:'plane',key:plane.key,order:plane.wrapperStart,owners:new Set(),depthPoints:[]}]));
    const parts=[],visible=calls.map((call,index)=>({call,index})).filter(({call,index})=>!call.container&&belongs(call)&&split.layers.some(layer=>layer.owner===index&&layer.bounds));
    let supported=!calls.some((call,index)=>!call.container&&!belongs(call)&&split.layers.some(layer=>layer.owner===index&&layer.bounds));
    let adaptiveDepth=true;
    const point=value=>{
      const match=/^\(\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?:\s*,\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)))?\s*,?\s*\)$/.exec(value.trim());
      return match?[Number(match[1]),Number(match[2]),Number(match[3]||0)]:null;
    };
    for(const {call,index} of visible){
      const planes=workspace.planes.filter(plane=>plane.view===view.index&&call.start>=plane.bodyStart&&call.end<=plane.bodyEnd).sort((a,b)=>b.bodyStart-a.bodyStart);
      const callArgs=argumentsOf(call.call).args,coordinates=callArgs.filter(arg=>!arg.named).map(arg=>point(arg.value));
      if(callArgs.some(arg=>arg.key==='no-bounds'&&arg.value.trim()!=='false'))adaptiveDepth=false;
      if(planes.length){
        const plane=planes[0],part=planeParts.get(plane.key);part.owners.add(index);
        const prior=codeOnly(source.slice(plane.bodyStart,call.start));
        if(call.group!==calls[plane.index]||/\b(?:translate|rotate|scale|set-transform|set-origin)\s*\(/.test(prior))adaptiveDepth=false;
        if(call.name==='rect'&&coordinates.length===2&&coordinates.every(p=>p&&p[2]===0)&&!callArgs.some(arg=>arg.key==='radius'&&Number(arg.value)!==0)){
          const [a,b]=coordinates;part.depthPoints.push(a,[a[0],b[1],0],b,[b[0],a[1],0]);
        }else if(call.name==='line'&&coordinates.length===2&&coordinates.every(p=>p&&p[2]===0))part.depthPoints.push(...coordinates);
        else if(call.name==='content'&&coordinates[0]&&coordinates[0][2]===0)part.depthPoints.push(coordinates[0]);
        else adaptiveDepth=false;
        continue;
      }
      if(call.group===owner&&call.name==='line'&&coordinates.length===2&&coordinates.every(Boolean))
        parts.push({type:'line',order:call.start,points:coordinates,svg:split.compose(new Set([index]))});
      else if(call.group===owner&&call.name==='content'&&coordinates[0])
        parts.push({type:'point',order:call.start,points:[coordinates[0]],svg:split.compose(new Set([index]))});
      else supported=false;
    }
    if(split.layers.some(layer=>layer.owner==null&&/<(?:path|use|image|text)\b/.test(layer.svg.replace(/<defs\b[\s\S]*?<\/defs>/g,''))))supported=false;
    for(const part of planeParts.values())parts.push({...part,owners:undefined,svg:part.owners.size?split.compose(part.owners):null});
    parts.sort((a,b)=>a.order-b.order);
    // Small, numeric snap metadata stays independent of orbit textures.
    view.snapPoints=parts.filter(part=>['line','point'].includes(part.type)&&!transforms.get(view.index).some(at=>at<part.order)).flatMap(part=>part.points).slice(0,512);
    const angles=['x','y','z'].map(axis=>{
      const value=args.find(arg=>arg.key===axis)?.value||SCHEMAS.ortho[axis];
      return /^\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)deg\s*$/.test(value)?Number(value.trim().slice(0,-3)):null;
    });
    const rawDistance=args.find(arg=>arg.key==='distance')?.value||'auto';
    const distance=rawDistance.trim()==='auto'?'auto':/^\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)\s*$/.test(rawDistance)?Number(rawDistance):null;
    return {index:view.index,kind:view.kind,angles,distance,adaptiveDepth,sorted:!args.some(arg=>arg.key==='sorted'&&arg.value.trim()==='false'),parts:supported&&parts.length?parts:null};
  }) };
  const finalBackground=background.replace(/cetzWorkspace=[^;]*;/,`cetzWorkspace=${encodeURIComponent(JSON.stringify(workspace))};cetzOrbit=${encodeURIComponent(JSON.stringify(orbit))};`);
  return { mode: '3d', calls, canvas, source, calibration: null, workspace,
    xml: `<?xml version="1.0" encoding="UTF-8"?><mxfile host="GUI-CeTZ"><diagram id="cetz-canvas" name="CeTZ 3D"><mxGraphModel grid="0" page="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${finalBackground}${image}${handles}</root></mxGraphModel></diagram></mxfile>` };
}

function grid3D(view) {
  const result = { minor: [], major: [], axes: [] };
  if (!view.matrix) return result;
  const limit=Math.max(100000,...Object.values(view.bounds||{}).map(value=>Math.abs(value)*20));
  function edge(a, b) {
    const p = project(view.matrix, a), q = project(view.matrix, b);
    if (!p || !q || [...p,...q].some(v => Math.abs(v) > limit)) return null;
    return [...p,...q].map(px);
  }
  const extent=view.gridRange||5;
  let step=0.25;while(extent/step>40)step*=2;
  const count=Math.floor(extent/step);
  for (const plane of ['xy','xz','zy']) for (let i = -count; i <= count; i++) {
    if (i === 0) continue;
    const t = i * step, major = Math.abs(t-Math.round(t))<1e-8;
    for (const line of [edge(planePoint(plane,0,t,-extent), planePoint(plane,0,t,extent)),
      edge(planePoint(plane,0,-extent,t), planePoint(plane,0,extent,t))]) {
      if (line) result[major ? 'major' : 'minor'].push(line);
    }
  }
  [['X','#d64b4b',0],['Y','#309b56',1],['Z','#397bd5',2]].forEach(([name,color,axis]) => {
    const ranges=view.axisRanges?.[axis]||[-5,5];
    const start=[0,0,0],end=[0,0,0];start[axis]=ranges[0];end[axis]=ranges[1];
    const line = edge(start, end);
    if (line) result.axes.push({name, color, line});
  });
  return result;
}

// Draw.io may omit default/zero geometry fields during serialization. Compare
// semantics, but permit only ephemeral command/selection/revision markers.
function patchesFrom3D(rendered, xml, readCells) {
  const before = readCells(rendered.xml), after = readCells(xml);
  function canonical(item) {
    if (!item) return null;
    const value = { ...item, cell: { ...item.cell }, geometry: { ...item.geometry } };
    delete value.cell.visible; // Selection can reveal an Outline-only hit box.
    for (const key of ['x', 'y', 'width', 'height']) value.geometry[key] = Number(value.geometry[key] ?? 0);
    function ordered(v) {
      return v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, ordered(v[k])])) : v;
    }
    return JSON.stringify(ordered(value));
  }
  const deleted = new Set();
  rendered.calls.forEach((call,index) => {
    const id = `cetz-edit-${rendered.cellIds?.[index] ?? index}`;
    if (before.has(id) && !after.has(id)) deleted.add(call);
  });
  const removed = call => {
    for (let current = call; current; current=current.group) if (deleted.has(current)) return true;
    return false;
  };
  for (const [id, item] of before) {
    if (/^cetz-edit-/.test(id) && !after.has(id)) continue;
    if (/^cetz-scene-\d+$/.test(id)) continue;
    if (canonical(item) !== canonical(after.get(id))) throw new Error(MESSAGE);
  }
  for (const [id, item] of after) {
    if (before.has(id) || /^cetz-(?:select-[\w-]+|scene-\d+)$/.test(id)) continue;
    if (/(?:^|;)cetzAction=[\w-]+(?:;|$)/.test(item.cell.style || '')) continue;
    if (/(?:^|;)cetzTemplate=[\w-]+(?:;|$)/.test(item.cell.style || '')) continue;
    throw new Error(MESSAGE);
  }
  const patches = [...deleted].filter(call => !call.group || !removed(call.group)).map(call => ({
    ...deletionRange(rendered.source,call.start,call.end), text:''
  }));
  for (const [id, item] of after) {
    if (before.has(id)) continue;
    const style = item.cell.style || '';
    const name = /(?:^|;)cetzTemplate=([\w-]+);/.exec(style)?.[1];
    if (!name) continue;
    const encoded = /(?:^|;)cetzPlacement3D=([^;]+);/.exec(style)?.[1];
    if (!encoded) throw new Error('Choose a 3D drawing plane before placing a shape.');
    const payload = JSON.parse(decodeURIComponent(encoded));
    if (removed(rendered.calls[payload.view])) throw new Error('Choose a surviving 3D view before placing a shape.');
    const patch = insertion3D(rendered.source, rendered, { ...payload, name });
    patches.push(patch);
  }
  // Coalesce simultaneous palette insertions at the same source offset.
  const insertions = patches.filter(p => p.start === p.end);
  return patches.filter(p => p.start !== p.end).concat([...new Set(insertions.map(p => p.start))].map(start => ({ start, end:start,
    text:insertions.filter(p => p.start === start).map(p => p.text).join('') })));
}
module.exports = { is3DCanvas, locate3DCalls, render3D, patchesFrom3D, MESSAGE, CONTAINERS };
