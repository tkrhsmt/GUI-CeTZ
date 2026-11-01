'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {prepare,MARKER}=require('../src/plane-content');
const {locateCanvases}=require('../src/scanner');
const {renderEditable}=require('../src/advanced');
const {renderCanvas}=require('../src/preview');
const {readAllCells}=require('../src/drawio');
const {propertyPatches}=require('../src/properties');
const {renderPlane2D}=require('../src/plane-editor');
const file=path.resolve('examples/plane-workspace.typ');
const doc=(body,version='0.5.3')=>'#import "@preview/cetz:'+version+'"\n#cetz.canvas({import cetz.draw: *\n'+body+'\n})';
const canvas=source=>locateCanvases(source)[0];
const render=source=>renderEditable(source,canvas(source),file);
const apply=(source,patches)=>[...patches].sort((a,b)=>b.start-a.start).reduce((s,p)=>s.slice(0,p.start)+p.text+s.slice(p.end),source);
const svg=rendered=>decodeURIComponent(/image=data:image\/svg\+xml,([^;]+)/.exec(readAllCells(rendered.xml).get('cetz-preview-image').cell.style)[1]);

// Accumulate the actual exported SVG transforms down to each glyph. Comparing
// those axes with calibrated plane axes catches upright text and wrong skew.
function glyphMatrices(svg){
  const stack=[[1,0,0,1]],result=[];
  const mul=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3]];
  for(const token of svg.match(/<[^>]*>/g)||[]){
    if(/^<\//.test(token)){stack.pop();continue;}
    if(/^<!|^<\?/.test(token))continue;
    let matrix=stack.at(-1);
    const transform=/\btransform="([^"]+)"/.exec(token)?.[1]||'';
    for(const match of transform.matchAll(/(matrix|scale|rotate)\(([^)]+)\)/g)){
      const v=match[2].trim().split(/[\s,]+/).map(Number);
      const local=match[1]==='matrix'?v.slice(0,4):match[1]==='scale'?[v[0],0,0,v[1]??v[0]]:
        [Math.cos(v[0]*Math.PI/180),Math.sin(v[0]*Math.PI/180),-Math.sin(v[0]*Math.PI/180),Math.cos(v[0]*Math.PI/180)];
      matrix=mul(matrix,local);
    }
    if(/^<use\b/.test(token))result.push(matrix);
    if(!/\/>$/.test(token))stack.push(matrix);
  }
  return result;
}
const parallel=(a,b)=>Math.abs(a[0]*b[1]-a[1]*b[0])/(Math.hypot(...a)*Math.hypot(...b))<1e-6;

test('native angles stay short, preserve explicit angles, rich text, qualified calls and XYZ labels',()=>{
  const ordinary=doc('content((0,0),[on-xy({ fake })])');
  assert.equal(prepare(ordinary).text,ordinary);
  const original=doc('cetz.draw.ortho({cetz.draw.on-xy({import cetz.draw: *\ncontent((0,0))[#strong[Plane] $x^2$]\ncontent((1,1),angle:12deg)[Explicit]\n})\ncontent((1,2,3))[XYZ]})');
  const prepared=prepare(original);
  assert.doesNotMatch(prepared.text,/__gui-plane|GUI-CeTZ plane content/);
  assert.ok(prepared.text.includes('content((0,0), angle: (rel: (1, 0)))[#strong[Plane] $x^2$]'));
  assert.ok(prepared.text.includes('content((1,1),angle:12deg)[Explicit]'));
  assert.ok(prepared.text.includes('content((1,2,3))[XYZ]'));
  assert.equal(prepared.text.length-original.length,22);
  assert.equal(prepare(prepared.text).patches.length,0);
});

for(const version of ['0.4.2','0.5.2','0.5.3'])test(`plane content ${version} uses native angles on all three planes while XYZ text remains screen-facing`,async()=>{
  for(const kind of ['xy','xz',version==='0.4.2'?'yz':'zy']){
    const source=prepare(doc('ortho(x:27deg,y:38deg,z:13deg,sorted:false,{scope({rotate(x:11deg,y:7deg,z:19deg)\non-'+kind+'({content((1,1))[P]})})\ncontent((3,2,1))[R]})',version)).text;
    const rendered=await render(source),matrices=glyphMatrices(svg(rendered));
    assert.equal(matrices.length,2);
    const m=rendered.workspace.planes[0].matrix;
    if(version==='0.5.3')assert.ok(matrices.some(g=>parallel(g.slice(0,2),[m[0][0],m[1][0]])),'glyph baseline follows plane X '+JSON.stringify({version,kind,matrices,m}));
    assert.ok(matrices.some(g=>Math.abs(g[1])<1e-8&&Math.abs(g[2])<1e-8),'a direct XYZ label stays upright');
    const exact=await renderCanvas(source,canvas(source),file);
    assert.equal(svg(rendered).replace(/<g>|<\/g>/g,''),exact.replace(/<g>|<\/g>/g,''),'GUI and standalone SVG keep the same drawing');
  }
});

test('native perspective content preserves explicit angles and stays editable in the local plane',async()=>{
  const source=prepare(doc('perspective(x:25deg,y:40deg,distance:8,sorted:false,{on-xy({import cetz.draw: *\nrect((0,0),(4,3),name:"a")\ncontent("a.center",angle:12deg,frame:"rect",padding:.1)[#strong[Plane] $x^2$]\n})\ncontent((3,2,1))[XYZ]})')).text;
  const full=await render(source),image=svg(full);
  assert.doesNotMatch(image,/clip-path=/,'native content needs no projection tiles');
  assert.doesNotMatch(image,/<image\b/,'fonts and equations are not rasterized');
  const local=await renderPlane2D(source,canvas(source),full.workspace.planes[0].key,file,full);
  assert.equal(local.mode,'plane-2d');
  const index=local.calls.findIndex(call=>call.name==='content'),call=local.calls[index];
  assert.equal(source.slice(call.start,call.end),call.call);
  const edited=apply(source,propertyPatches(local,{indices:[index],value:encodeURIComponent(JSON.stringify({base:call.call,values:{angle:'23deg'}}))}));
  const next=await render(edited);
  assert.ok(next.calls.some(c=>c.name==='content'&&c.call.includes('angle:23deg')));
  assert.equal(prepare(edited).patches.length,0);
});

test('selective imports, nested projections and bare qualified canvases compile with standard CeTZ angles',async()=>{
  for(const body of [
    'import cetz.draw: ortho, on-xy, content as label\northo({on-xy({label((0,0))[P]})})',
    'ortho(x:20deg,y:30deg,{ortho(x:10deg,y:15deg,{on-xy({content((0,0))[P]})})})',
    'cetz.draw.ortho({cetz.draw.on-xy({cetz.draw.content((0,0))[P]})})'
  ]){
    const original=doc(body),source=prepare(original).text;
    assert.doesNotMatch(source,/__gui-plane/);
    assert.ok(source.includes('angle: (rel: (1, 0))'));
    assert.equal(prepare(source).patches.length,0);
    assert.match(await renderCanvas(source,canvas(source),file),/<use\b/);
  }
});

test('legacy helpers migrate losslessly to short native angles and preserve plane keys',async()=>{
  const fs=require('node:fs');
  const {rebaseKey,withoutAdapters}=require('../src/plane-content');
  const source=fs.readFileSync(path.join(__dirname,'fixtures/plane-content-v1.typ'),'utf8');
  const oldPlanes=require('../src/plane-editor').planesFor(source,require('../src/three-dimensional').locate3DCalls(require('../src/plane-content').withoutAdapters(source),canvas(source)));
  const prepared=prepare(source),next=prepared.text;
  assert.ok(next.length<400);
  assert.doesNotMatch(next,/__gui-plane|GUI-CeTZ plane (?:bindings|content)/);
  assert.match(next,/ortho\(x:23deg,y:40deg,sorted:false/);
  assert.match(next,/content\(\(1,2,3\)\)\[XYZ\]/);
  assert.equal(prepare(next).patches.length,0);
  const indented=source.split('\n').map(line=>'  '+line).join('\r\n');
  assert.doesNotMatch(prepare(indented).text,/__gui-plane/);
  assert.equal(withoutAdapters(source).length,source.length);
  const nextPlanes=require('../src/plane-editor').planesFor(next,require('../src/three-dimensional').locate3DCalls(next,canvas(next)));
  assert.deepEqual(oldPlanes.map(p=>rebaseKey(p.key,prepared.patches)),nextPlanes.map(p=>p.key));
  await renderCanvas(next,canvas(next),file);
  const modified=source.replace('let __gui-plane-native = cetz.draw','let __gui-plane-native = cetz.draw\nlet custom = 42');
  assert.ok(prepare(modified).text.includes('let custom = 42'),'hand-edited helper definitions are preserved');
});

test('marker lookalikes, comments, trailing commas, bounding boxes and spreads remain valid',async()=>{
  const fake='// GUI-CeTZ plane content v1\nlet __gui-plane-native = cetz.draw\nlet on-yz = on-zy\n// GUI-CeTZ plane content end';
  const source=doc('ortho(x:27deg,y:38deg,sorted:false,{on-xy({\n'+
    'content((1,1), /* keep comma */)[P]\n'+
    'content((2,2), // keep line comment\n)[Q]\n'+
    'content((0,0),(2,1),[Box])\n'+
    'content((rel:(1,0)),(2,1),[Relative])\n'+
    'content((3,1),angle:0deg)[Explicit]\n'+
    'content((3,2), [marker], ..(:))\n'+
    'content((4,2))[Label '+fake+'\n]\n})})');
  const next=prepare(source).text;
  assert.ok(next.includes('/* keep comma */'));assert.ok(next.includes('// keep line comment'));
  assert.ok(next.includes(fake));
  assert.ok(next.includes('content((rel:(1,0)),(2,1),[Relative])'));
  assert.ok(next.includes('content((3,1),angle:0deg)[Explicit]'));
  assert.ok(next.includes('content((3,2), [marker], ..(:))'));
  assert.ok(next.includes('content((0,0),(2,1),[Box])'));
  assert.equal(prepare(next).patches.length,0);
  await renderCanvas(next,canvas(next),file);
});
