'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {renderEditable,patchesFromEditable} = require('../src/advanced');
const {readAllCells} = require('../src/drawio');
const {locateCanvases} = require('../src/scanner');
const {ALL_SHAPES} = require('../src/templates');
const fixtures = require('./placement-fixtures');
const {insertion3D,project,fitCamera,planePoint} = require('../src/three-workspace');
const {sourceActionPatches} = require('../src/source-actions');
const sourceFor = (body,version='0.5.2') => `#import "@preview/cetz:${version}"\n#cetz.canvas({import cetz.draw: *\n${body}\n})`;
const file = path.resolve('examples/three-dimensional.typ');
const render = source => renderEditable(source,locateCanvases(source)[0],file);
const apply = (source,patches) => patches.sort((a,b)=>b.start-a.start).reduce((s,p)=>s.slice(0,p.start)+p.text+s.slice(p.end),source);

test('measured world axes and grid match CeTZ physical units and never become editable content', async () => {
  const source = sourceFor('ortho(x:0deg,y:0deg,z:0deg,{line((0,0,0),(2,1,1))})');
  const rendered = await render(source), m = rendered.workspace.views[0].matrix;
  assert.ok(m);
  assert.deepEqual(project(m,[0,0,0]),[500,500]);
  const p = project(m,[1,1,7]);
  assert.ok(Math.abs(p[0]-570.8661417)<0.00001);
  assert.ok(Math.abs(p[1]-429.1338583)<0.00001);
  const cells = readAllCells(rendered.xml);
  const grids = [...cells].filter(([id])=>id.startsWith('cetz-grid3d-'));
  assert.equal(grids.length,240);
  const axes = [...cells].filter(([id])=>/^cetz-axis-3d-.*-[XYZ]$/.test(id));
  assert.equal(axes.length,3);
  for (const [,item] of grids.concat(axes)) assert.match(item.cell.style,/selectable=0/);
  assert.deepEqual(patchesFromEditable(source,rendered,rendered.xml,readAllCells),[]);
});

test('projective camera fitting recovers perspective screen positions and rejects nonprojective samples', () => {
  const matrix=[[80,3,-20,500],[10,-70,15,500],[0.05,0.02,-0.03,1]];
  const samples=[[0,0,0],[1,0,0],[0,1,0],[0,0,1],[1,1,0],[1,0,1],[0,1,1],[1,1,1]].map(p=>{
    const point=[p[0]+0.0000005,p[1],p[2]];return {point,screen:project(matrix,point)};
  });
  const fitted=fitCamera(samples); assert.ok(fitted);
  const point=[2,-1,3], expected=project(matrix,point), actual=project(fitted,point);
  assert.ok(Math.hypot(actual[0]-expected[0],actual[1]-expected[1])<0.0001);
  samples[7].screen=[10000,10000]; assert.equal(fitCamera(samples),null);
});

for (const version of ['0.4.2','0.5.2']) test(`all 15 palette tools insert valid local geometry on every plane in CeTZ ${version}`, async () => {
  const source=sourceFor('ortho({line((0,0,0),(1,1,1))})',version), rendered=await render(source);
  for(const plane of ['xy','xz','zy']) for(const shape of ALL_SHAPES){
    const patch=insertion3D(source,rendered,{view:rendered.workspace.views[0].index,plane,offset:1.5,name:shape.label,points:fixtures[shape.label]});
    const next=apply(source,[patch]), updated=await render(next);
    assert.match(patch.text,new RegExp('cetz.draw.on-'+(plane==='zy'&&version==='0.4.2'?'yz':plane)));
    const leaf=updated.calls.find(c=>c.name===shape.label && c.start<updated.calls.find(c=>c.name==='line' && c.call.includes('(0,0,0)')).start);
    assert.ok(leaf,`${plane}/${shape.label}`);
    assert.ok(leaf.group.name.startsWith('on-'));
    assert.ok(leaf.geometry.width>0 && leaf.geometry.height>0);
    assert.deepEqual(patchesFromEditable(next,updated,updated.xml,readAllCells),[]);
  }
});

test('3D placement markers create only validated in-view plane calls and reject stale or malformed payloads', async () => {
  const source=sourceFor('ortho({line((0,0,0),(1,1,1))})'), rendered=await render(source);
  const payload={view:rendered.workspace.views[0].index,plane:'xz',offset:2,points:[[1,2],[3,4]]};
  const insert = payload => rendered.xml.replace('</root>',`<mxCell id="place" style="cetzTemplate=rect;cetzPlacement3D=${encodeURIComponent(JSON.stringify(payload))};" vertex="1" parent="1"><mxGeometry width="1" height="1"/></mxCell></root>`);
  const patches=patchesFromEditable(source,rendered,insert(payload),readAllCells);
  assert.match(apply(source,patches),/on-xz\(y: 2/);
  assert.throws(()=>patchesFromEditable(source,rendered,insert({...payload,view:999}),readAllCells),/changed/);
  assert.throws(()=>patchesFromEditable(source,rendered,insert({...payload,plane:'unknown'}),readAllCells),/valid/);
  assert.throws(()=>patchesFromEditable(source,rendered,insert({...payload,points:[[1,2,3],[3,4,5]]}),readAllCells),/points/);
});

test('a canvas containing raw XYZ geometry gains a source-backed 3D view without altering its body', async () => {
  const body='// preserve\nline((0,0,0),(1,2,3))', source=sourceFor(body), rendered=await render(source);
  assert.equal(rendered.workspace.views.length,0);
  const next=apply(source,sourceActionPatches(source,rendered,{action:'create-view',indices:[]}));
  const updated=await render(next);
  assert.ok(next.includes(body)); assert.ok(updated.workspace.views[0].matrix);
  assert.equal(updated.calls.at(-1).name,'ortho');
  assert.throws(()=>sourceActionPatches(next,updated,{action:'create-view',indices:[]}),/already/);
  assert.deepEqual(planePoint('zy',2,3,4),[2,4,3]);
});

test('empty projected scenes retain grid calibration and support their first shape insertion', async () => {
  for(const version of ['0.4.2','0.5.2']){
    const source=sourceFor('cetz.draw.ortho({})',version), rendered=await render(source);
    assert.ok(rendered.workspace.views[0].matrix);
    const patch=insertion3D(source,rendered,{view:0,plane:'xy',offset:0,name:'circle',points:[[0,0],[1,0]]});
    const next=await render(apply(source,[patch]));
    assert.ok(next.calls.some(call=>call.name==='circle'));
  }
});

test('plane click mapping agrees with actual CeTZ projected line origins, including the ZY direction',async()=>{
  for(const version of ['0.4.2','0.5.2']) for(const plane of ['xy','xz','zy']){
    const func=plane==='zy'&&version==='0.4.2'?'on-yz':'on-'+plane, axis={xy:'z',xz:'y',zy:'x'}[plane];
    const source=sourceFor(`ortho(x:25deg,y:40deg,z:10deg,{${func}(${axis}:2,{line((3,4),(3.000001,4))})})`,version);
    const rendered=await render(source), cells=readAllCells(rendered.xml), image=cells.get('cetz-preview-image');
    const svg=decodeURIComponent(/image=data:image\/svg\+xml,([^;]+)/.exec(image.cell.style)[1]);
    const path=/<path\b[^>]*stroke="#000000"[^>]*>/.exec(svg)?.[0];assert.ok(path);
    const translate=/transform="translate\(([^)]+)\)"/.exec(path)?.[1].split(/\s+/).map(Number)||[0,0];
    const move=/d="M ([\d.eE+-]+) ([\d.eE+-]+)(?:m ([\d.eE+-]+) ([\d.eE+-]+))?/.exec(path);
    const position=[translate[0]+Number(move[1])+Number(move[3]||0),translate[1]+Number(move[2])+Number(move[4]||0)];
    const viewBox=/viewBox="([^"]+)"/.exec(svg)[1].split(/\s+/).map(Number);
    const actual=[Number(image.geometry.x)+(position[0]-viewBox[0])*2.5,Number(image.geometry.y)+(position[1]-viewBox[1])*2.5];
    const expected=project(rendered.workspace.views[0].matrix,planePoint(plane,2,3,4));
    assert.ok(Math.hypot(actual[0]-expected[0],actual[1]-expected[1])<0.00002,version+'/'+plane);
  }
});
