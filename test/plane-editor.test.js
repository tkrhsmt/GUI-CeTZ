'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {locateCanvases}=require('../src/scanner');
const {renderEditable,patchesFromEditable}=require('../src/advanced');
const {readAllCells}=require('../src/drawio');
const {sourceActionPatches}=require('../src/source-actions');
const {createPlanePatches,deletePlanePatches,planeSettingsPatches,cameraPositionPatches,renderPlane2D,convertTo3D,resolvePlane}=require('../src/plane-editor');
const file=path.resolve('examples/three-dimensional.typ');
const doc=(body,v='0.5.2')=>`#import "@preview/cetz:${v}"\n#cetz.canvas({import cetz.draw: *\n${body}\n})`;
const canvas=s=>locateCanvases(s)[0];
const render=s=>renderEditable(s,canvas(s),file);
const apply=(s,patches)=>patches.sort((a,b)=>b.start-a.start).reduce((s,p)=>s.slice(0,p.start)+p.text+s.slice(p.end),s);
const pose={kind:'xy',position:[2,-3,4],angles:[25,-15,80]};

test('new planes append in source/list order and deleting a plane removes its entire managed body',async()=>{
  const {planeCode}=require('../src/plane-editor');
  let source=doc('ortho({on-xy({rect((0,0),(2,1))})\non-xz({circle((3,1),radius:1)})\n'+
    planeCode('','gui-plane-1',pose,'\nlet r=2\ncetz.draw.circle((1,1),radius:r)\ncetz.draw.rect((0,0),(2,1))\n')+'\n})');
  let full=await render(source),before=full.workspace.planes.map(p=>p.base);
  const added=createPlanePatches(source,full,{...pose,view:full.workspace.views[0].index});
  source=apply(source,added);full=await render(source);
  assert.deepEqual(full.workspace.planes.slice(0,-1).map(p=>p.base),before);assert.equal(full.workspace.planes.at(-1).key,added.activePlaneKey);
  const plane=full.workspace.planes.find(p=>p.key==='gui-plane-1');
  assert.throws(()=>deletePlanePatches(source,full,{key:plane.key,base:'stale'}),/changed/);
  const patches=deletePlanePatches(source,full,{key:plane.key,base:plane.base});source=apply(source,patches);full=await render(source);
  assert.ok(!source.includes('let r=2'));assert.ok(!source.includes('radius:r'));assert.ok(!source.includes('// GUI-CeTZ plane: "gui-plane-1"'));
  assert.deepEqual(full.workspace.planes.map(p=>p.base),[...before.slice(0,2),full.workspace.planes.at(-1).base]);
  assert.equal(full.workspace.planes.at(-1).key,patches.activePlaneKey);
});

test('deleting an inline legacy plane consumes its separator and preserves adjacent planes',async()=>{
  let source=doc('ortho({on-xy({rect((0,0),(1,1))});on-xz({circle((2,2),radius:1)})})'),full=await render(source);
  const plane=full.workspace.planes[0],patches=deletePlanePatches(source,full,{key:plane.key,base:plane.base});
  source=apply(source,patches);full=await render(source);
  assert.ok(!source.includes('rect('));assert.equal(full.workspace.planes[0].key,patches.activePlaneKey);
  const last=full.workspace.planes[0],deleted=deletePlanePatches(source,full,{key:last.key,base:last.base});
  source=apply(source,deleted);full=await render(source);assert.equal(full.workspace.planes.length,0);assert.equal(deleted.activePlaneKey,null);
});

test('projection switching preserves body, common options and comments, and only changes the chosen view',async()=>{
  let source=doc('let a=20deg\ncetz.draw.ortho(\n x:a,y:30deg,\n // keep option comment\n flatten:false, /* keep trailing comment */\n {on-xy({rect((0,0),(2,1))})})\northo({circle((5,5),radius:1)})','0.5.3');
  let full=await render(source),view=full.workspace.views[0];
  const body=source.slice(full.calls[view.index].bodyStart,full.calls[view.index].bodyEnd);
  const switchTo=(kind,setting)=>sourceActionPatches(source,full,{action:'projection-kind',value:encodeURIComponent(JSON.stringify({view:view.index,base:view.base,kind,setting})),indices:[]});
  source=apply(source,switchTo('perspective','12'));full=await render(source);view=full.workspace.views[0];
  assert.equal(view.kind,'perspective');assert.match(source,/cetz.draw.perspective\(/);assert.match(source,/distance: 12/);
  assert.ok(!source.includes('flatten:'));assert.ok(source.includes('// keep option comment'));assert.ok(source.includes('/* keep trailing comment */'));
  assert.ok(source.includes('x:a,y:30deg'));assert.ok(source.includes('ortho({circle((5,5),radius:1)})'));
  assert.equal(source.slice(full.calls[view.index].bodyStart,full.calls[view.index].bodyEnd),body);
  source=apply(source,switchTo('ortho','false'));full=await render(source);view=full.workspace.views[0];
  assert.equal(view.kind,'ortho');assert.ok(!source.includes('distance:'));assert.ok(source.includes('flatten: false'));
  assert.deepEqual(switchTo('ortho'),[]);
  const {projectionPatches}=require('../src/plane-editor');
  assert.throws(()=>projectionPatches(source,full,{view:view.index,base:'stale',kind:'perspective'}),/changed/);
  assert.throws(()=>projectionPatches(source,full,{view:view.index,base:view.base,kind:'oblique'}),/Choose/);
  assert.throws(()=>projectionPatches(source,full,{view:view.index,base:view.base,kind:'perspective',setting:'1, x:0deg'}),/one property/);
});

for(const version of ['0.4.2','0.5.2'])test(`arbitrary plane transforms and local 2D edits round-trip in CeTZ ${version}`,async()=>{
  let source=doc('ortho({on-xz({circle((8,8),radius:1)})})',version), full=await render(source);
  const created=createPlanePatches(source,full,{...pose,view:full.workspace.views[0].index});
  source=apply(source,created); full=await render(source);
  const plane=full.workspace.planes.find(p=>p.key===created.activePlaneKey);
  assert.ok(plane.matrix);assert.deepEqual(plane.position,pose.position);assert.deepEqual(plane.angles,pose.angles);
  let local=await renderPlane2D(source,canvas(source),plane.key,file,full);
  const marker='<mxCell id="new" style="cetzTemplate=rect;cetzPoints=%5B%5B0%2C0%5D%2C%5B2%2C1%5D%5D;" vertex="1" parent="1"><mxGeometry width="1" height="1"/></mxCell>';
  const patches=patchesFromEditable(source,local,local.xml.replace('</root>',marker+'</root>'),readAllCells);
  assert.ok(patches.every(p=>p.start>=plane.bodyStart&&p.end<=plane.bodyEnd));
  source=apply(source,patches); full=await render(source);local=await renderPlane2D(source,canvas(source),plane.key,file,full);
  assert.equal(local.calls[0].name,'rect');assert.equal(source.slice(local.calls[0].start,local.calls[0].end),local.calls[0].call);
  const base=local.calls[0].call;
  const prop=sourceActionPatches(source,local,{action:'properties',indices:[0],value:encodeURIComponent(JSON.stringify({base,values:{'$1':'(4, 3)',fill:'red'}}))});
  source=apply(source,prop);full=await render(source);
  assert.ok(source.includes('circle((8,8),radius:1)'));assert.ok(source.includes('rect((0, 0), (4, 3), fill: red)'));
  const updated=full.workspace.planes.find(p=>p.key===plane.key);
  assert.deepEqual(updated.position,pose.position);assert.deepEqual(updated.angles,pose.angles);
});

test('plane settings preserve body/comments, reject stale bases and migrate legacy planes safely',async()=>{
  let source=doc('ortho({on-xy(z:2,{// keep\nrect((0,0),(2,1))\n})})'), full=await render(source), plane=full.workspace.planes[0];
  const body=source.slice(plane.bodyStart,plane.bodyEnd);
  const patches=planeSettingsPatches(source,full,{...pose,kind:'zy',key:plane.key,base:plane.base});
  source=apply(source,patches);full=await render(source);plane=full.workspace.planes.find(p=>p.key===patches.activePlaneKey);
  assert.ok(plane.managed);assert.equal(source.slice(plane.bodyStart,plane.bodyEnd),body);assert.equal(plane.kind,'zy');assert.ok(plane.matrix);
  assert.throws(()=>planeSettingsPatches(source,full,{...pose,key:plane.key,base:'stale'}),/changed/);
  assert.throws(()=>planeSettingsPatches(source,full,{...pose,key:plane.key,base:plane.base,position:[NaN,0,0]}),/finite/);
});

test('plane local preview carries lexical definitions and inherited styles without world transforms',async()=>{
  const source=doc('let r = 2\nset-style(stroke: red)\northo({scope({translate(z:3);on-xy({circle((0,0),radius:r)})})})');
  const full=await render(source),plane=full.workspace.planes[0],local=await renderPlane2D(source,canvas(source),plane.key,file,full);
  assert.equal(local.calls.length,1);assert.equal(local.calls[0].call,'circle((0,0),radius:r)');assert.equal(local.mode,'plane-2d');
  assert.match(local.xml,/cetzOriginX=/);
});

test('3D axes expand and contract with drawing bounds and camera position moves the world origin',async()=>{
  const near=doc('ortho(x:0deg,y:0deg,z:0deg,{on-xy({rect((0,0),(2,1))})})'),far=near.replace('(2,1)','(80,40)');
  const a=await render(near),b=await render(far);
  const va=a.workspace.views[0],vb=b.workspace.views[0];
  assert.ok(vb.axisRanges[0][1]>va.axisRanges[0][1]+60);assert.ok(vb.axisRanges[1][1]>va.axisRanges[1][1]+25);
  const restored=await render(near);assert.deepEqual(restored.workspace.views[0].axisRanges,va.axisRanges);
  const changed=apply(near,cameraPositionPatches(near,a,{view:va.index,base:va.base,position:[3,4,5]}));
  const moved=await render(changed),view=moved.workspace.views[0];
  assert.deepEqual(view.position,[3,4,5]);assert.ok(view.matrix[0][3]<400);assert.ok(view.matrix[1][3]>600);
});

test('a normal 2D canvas becomes a named plane and its local body stays exactly editable',async()=>{
  const source=doc('let r=2\n// preserve\ncircle((1,2),radius:r)'),conversion=convertTo3D(source,canvas(source));
  const changed=apply(source,conversion),full=await render(changed),plane=resolvePlane(changed,canvas(changed),conversion.activePlaneKey);
  assert.equal(changed.slice(plane.bodyStart,plane.bodyEnd),source.slice(canvas(source).bodyStart,canvas(source).bodyEnd));
  const local=await renderPlane2D(changed,canvas(changed),plane.key,file,full);assert.equal(local.calls[0].name,'circle');
});

test('normal 2D Boolean operations remain planar under arbitrary 3D rotations and keep named anchors',async()=>{
  const {planeCode}=require('../src/plane-editor');
  let source=doc('ortho({'+planeCode('','gui-plane-1',pose,'\nimport cetz.draw: *\nrect((0,0),(2,2),name:"a",fill:red)\ncircle((1,1),radius:1)\nline("a.start",(4,0))\n')+'})');
  let full=await render(source),local=await renderPlane2D(source,canvas(source),'gui-plane-1',file,full);
  const patches=sourceActionPatches(source,local,{action:'boolean-union',indices:[0,1]});
  source=apply(source,patches);full=await render(source);local=await renderPlane2D(source,canvas(source),'gui-plane-1',file,full);
  assert.ok(source.includes('// GUI-CeTZ local Boolean'));assert.equal(local.calls[0].name,'boolean');
  assert.ok(full.calls.find(call=>call.name==='boolean').geometry);assert.ok(source.includes('line("a.start",(4,0))'));
  assert.deepEqual(full.workspace.planes[0].angles,pose.angles);
});

test('plane pose edits preserve header comments and do not consume additional user statements',async()=>{
  let source=doc('ortho({'+require('../src/plane-editor').planeCode('','gui-plane-1',pose,'\ncetz.draw.rect((0,0),(2,1))\n')+'})');
  source=source.replace('cetz.draw.translate(', '// translate(x: 99, y: 99, z: 99) is a note\n  cetz.draw.translate(').replace('x: 2, y: -3','x: /* keep x */ 2, y: -3');
  let full=await render(source),plane=full.workspace.planes[0];assert.deepEqual(plane.position,pose.position);
  source=apply(source,planeSettingsPatches(source,full,{key:plane.key,base:plane.base,...pose,position:[5,6,7]}));
  assert.ok(source.includes('translate(x: 99, y: 99, z: 99) is a note'));assert.ok(source.includes('x: /* keep x */ 5'));
  source=source.replace('cetz.draw.translate(', 'let user-value=1\n  cetz.draw.translate(');
  full=await render(source);plane=full.workspace.planes[0];assert.equal(!!plane.managed,false);
  const next=apply(source,planeSettingsPatches(source,full,{key:plane.key,base:plane.base,...pose}));
  assert.ok(next.includes('let user-value=1'));await render(next);
});

test('converting an existing 2D Boolean drawing preserves its anchors and permits 3D view rotation',async()=>{
  const source=doc('boolean({rect((0,0),(2,2))},{circle((1,1),radius:1)},op:"union",name:"a")\nline("a.start",(4,0))');
  const changed=apply(source,convertTo3D(source,canvas(source))),full=await render(changed);
  assert.ok(full.workspace.planes[0].matrix);assert.ok(changed.includes('// GUI-CeTZ local Boolean'));
  const local=await renderPlane2D(changed,canvas(changed),full.workspace.planes[0].key,file,full);
  assert.equal(local.calls[0].name,'boolean');
});

test('plane-local grouping avoids names in other planes and refuses external anchor retargeting',async()=>{
  const {planeCode}=require('../src/plane-editor');
  const original=doc('ortho({'+planeCode('','gui-plane-1',pose,'\nimport cetz.draw: *\nrect((0,0),(1,1),name:"a")\ncircle((2,0),radius:1,name:"b")\n')+'\non-xy({group(name:"group-1",{rect((5,5),(6,6))})})\n})');
  const full=await render(original),local=await renderPlane2D(original,canvas(original),'gui-plane-1',file,full);
  const grouped=apply(original,sourceActionPatches(original,local,{action:'group',indices:[0,1]}));
  assert.ok(grouped.includes('group(name: "group-2"'));assert.ok(grouped.includes('group(name:"group-1"'));await render(grouped);
  const external=original.replace('group(name:"group-1",{rect((5,5),(6,6))})','line("a.start",(5,5))');
  const scene=await render(external),plane=await renderPlane2D(external,canvas(external),'gui-plane-1',file,scene);
  assert.throws(()=>sourceActionPatches(external,plane,{action:'group',indices:[0,1]}),/outside this drawing plane/);
});

test('plane-local placement and duplication inherit outer draw imports without writing another import',async()=>{
  let source=doc('ortho({on-xy({rect((0,0),(2,1))})\non-xz({circle((4,4),radius:1)})})','0.5.3');
  let full=await render(source),local=await renderPlane2D(source,canvas(source),full.workspace.planes[0].key,file,full);
  const marker='<mxCell id="new" style="cetzTemplate=circle;cetzPoints=%5B%5B1%2C1%5D%2C%5B2%2C1%5D%5D;" vertex="1" parent="1"><mxGeometry width="1" height="1"/></mxCell>';
  const patches=patchesFromEditable(source,local,local.xml.replace('</root>',marker+'</root>'),readAllCells);
  source=apply(source,patches);full=await render(source);local=await renderPlane2D(source,canvas(source),full.workspace.planes[0].key,file,full);
  assert.equal((source.match(/import cetz\.draw: \*/g)||[]).length,1);assert.equal(local.calls.length,2);
  source=apply(source,sourceActionPatches(source,local,{action:'duplicate',indices:[0]}));full=await render(source);
  assert.equal((source.match(/import cetz\.draw: \*/g)||[]).length,1);assert.equal(full.workspace.planes.length,2);
});

for(const version of ['0.4.2','0.5.3'])test(`plane manipulators calibrate parent coordinates under nested transforms in CeTZ ${version}`,async()=>{
  const {planeCode}=require('../src/plane-editor'),project=require('../src/three-workspace').project;
  for(const kind of ['xy','xz','zy']){
    const source=doc('ortho(x:20deg,y:30deg,{scope({translate(x:7,y:-3,z:2)\n'+planeCode(doc('',version), 'gui-plane-1',{kind,position:[2,3,4],angles:[0,0,90]},'cetz.draw.rect((0,0),(2,1))')+'})})',version);
    const full=await render(source),plane=full.workspace.planes[0];assert.ok(plane.parentMatrix);
    for(const [u,v] of [[0,0],[1,0],[0,1],[2,-1]]){
      const world=kind==='xy'?[2-v,3+u,4]:kind==='xz'?[2,3+u,4+v]:[2-v,3,4+u];
      const expected=project(plane.parentMatrix,world),actual=project(plane.matrix,[u,v,0]);actual.forEach((n,i)=>assert.ok(Math.abs(n-expected[i])<.002));
    }
  }
});
