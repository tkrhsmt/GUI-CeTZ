'use strict';

const { callFromPoints } = require('./placement');
const { coordinate } = require('./snapping');

// Calibrate from CeTZ itself: this also captures surrounding transforms and
// perspective scale, rather than assuming a particular matrix convention.
const SAMPLES = [[0,0,0], [1,0,0], [0,1,0], [0,0,1], [1,1,0], [1,0,1], [0,1,1], [1,1,1]];
const EPS = 0.000001;
function probesFor(calls, tag, planes = [], source = '') {
  let next = calls.length;
  const projections = calls.flatMap((call, index) =>
    ['ortho', 'perspective'].includes(call.name) && call.bodyStart != null ? [{ index, call, samples: [] }] : []);
  const planeTargets = planes.map(plane => ({index:plane.index,call:calls[plane.index],samples:[]}));
  const edits = projections.concat(planeTargets).map(projection => {
    const text = SAMPLES.map(p => {
      const id = next++;
      projection.samples.push({ id, point: [p[0] + EPS / 2, p[1], p[2]] });
      return `${tag}(cetz.draw.line((${p.join(',')}), (${p[0] + EPS},${p[1]},${p[2]}), stroke: 0.001pt + black), ${id}, no-bounds: true)`;
    }).join('\n');
    const offset=projection.call.name==='ortho'||projection.call.name==='perspective'?require('./plane-editor').cameraInfo(source,projection.call).end:projection.call.bodyStart;
    return { offset: Number.isFinite(offset)?offset:projection.call.bodyStart, text: `\ncetz.draw.scope({ ${text}\n})\n` };
  });
  return { projections, planeTargets, edits, count: next, excluded: new Set(Array.from({length: next - calls.length}, (_, i) => calls.length + i)) };
}
function solve(matrix, values) {
  const n = values.length, a = matrix.map((row, i) => [...row, values[i]]);
  for (let column = 0; column < n; column++) {
    let pivot = column;
    for (let row = column + 1; row < n; row++) if (Math.abs(a[row][column]) > Math.abs(a[pivot][column])) pivot = row;
    if (Math.abs(a[pivot][column]) < 1e-10) return null;
    [a[pivot], a[column]] = [a[column], a[pivot]];
    const div = a[column][column];
    for (let j = column; j <= n; j++) a[column][j] /= div;
    for (let row = 0; row < n; row++) {
      if (row === column) continue;
      const factor = a[row][column];
      for (let j = column; j <= n; j++) a[row][j] -= factor * a[column][j];
    }
  }
  return a.map(row => row[n]);
}
function project(matrix, point) {
  const p = [...point, 1], dot = row => row.reduce((sum, v, i) => sum + v * p[i], 0);
  const w = dot(matrix[2]);
  if (w <= 1e-7) return null;
  const result = [dot(matrix[0]) / w, dot(matrix[1]) / w];
  return result.every(Number.isFinite) ? result : null;
}
function fitCamera(samples) {
  if (samples.length !== 8 || samples.some(s => !s.screen)) return null;
  const first = samples[0].screen;
  const affine = [0,1].map(axis => [1,2,3].map(i => samples[i].screen[axis] - first[axis]).concat(first[axis]));
  // Samples start EPS/2 along x, so correct the affine translation.
  affine.forEach(row => { row[3] -= row[0] * EPS / 2; });
  affine.push([0,0,0,1]);
  const valid = matrix => samples.every(sample => {
    const p = project(matrix, sample.point);
    return p && Math.hypot(p[0] - sample.screen[0], p[1] - sample.screen[1]) < 0.00002;
  });
  if (valid(affine)) return affine;
  const rows = [], rhs = [];
  for (const {point: [x,y,z], screen: [u,v]} of samples) {
    rows.push([x,y,z,1,0,0,0,0,-u*x,-u*y,-u*z]); rhs.push(u);
    rows.push([0,0,0,0,x,y,z,1,-v*x,-v*y,-v*z]); rhs.push(v);
  }
  const normal = Array.from({length:11}, (_, i) => Array.from({length:11}, (_, j) =>
    rows.reduce((sum, row) => sum + row[i] * row[j], 0)));
  const solution = solve(normal, Array.from({length:11}, (_, i) => rows.reduce((sum, row, j) => sum + row[i] * rhs[j], 0)));
  if (!solution) return null;
  const matrix = [solution.slice(0,4), solution.slice(4,8), solution.slice(8,11).concat(1)];
  return valid(matrix) ? matrix : null;
}
function calibratedTargets(targets, layers) {
  return targets.map(projection => {
    const samples = projection.samples.map(sample => {
      const layer = layers.find(layer => layer.owner === sample.id && layer.anchors?.length === 2);
      const a = layer?.anchors;
      return {...sample, screen: a && [(a[0].x + a[1].x) / 2, (a[0].y + a[1].y) / 2]};
    });
    return { index: projection.index, kind: projection.call.name, matrix: fitCamera(samples) };
  });
}
function calibratedViews(probes,layers) { return calibratedTargets(probes.projections,layers); }
function calibratedPlanes(probes,layers) { return calibratedTargets(probes.planeTargets || [],layers); }
function axisRanges(matrix, bounds, padding = 160) {
  const origin=project(matrix,[0,0,0]);
  if(!origin) return [[-5,5],[-5,5],[-5,5]];
  const box={left:Math.min(origin[0],bounds.x)-padding,right:Math.max(origin[0],bounds.x+bounds.width)+padding,
    top:Math.min(origin[1],bounds.y)-padding,bottom:Math.max(origin[1],bounds.y+bounds.height)+padding};
  return [0,1,2].map(axis=>{
    const p=[0,0,0];p[axis]=1;const unit=project(matrix,p);
    if(!unit || Math.hypot(unit[0]-origin[0],unit[1]-origin[1])<1e-7)return [-1,1];
    const direction=[unit[0]-origin[0],unit[1]-origin[1]];
    function endpoint(sign) {
      const v=direction.map(value=>value*sign), candidates=[];
      if(Math.abs(v[0])>1e-8)candidates.push(((v[0]>0?box.right:box.left)-origin[0])/v[0]);
      if(Math.abs(v[1])>1e-8)candidates.push(((v[1]>0?box.bottom:box.top)-origin[1])/v[1]);
      const distance=Math.min(...candidates.filter(value=>value>0));
      const coordinate=Math.abs(v[0])>=Math.abs(v[1])?0:1, u=origin[coordinate]+v[coordinate]*distance;
      const denominator=u*matrix[2][axis]-matrix[coordinate][axis];
      let t=(matrix[coordinate][3]-u*matrix[2][3])/denominator;
      if(!Number.isFinite(t)||t*sign<=0||!project(matrix,p.map((_,i)=>i===axis?t:0)))t=sign*5;
      return Math.max(-1e9,Math.min(1e9,t));
    }
    return [endpoint(-1),endpoint(1)];
  });
}
function planePoint(plane, offset, u, v) {
  if (plane === 'xy') return [u,v,offset];
  if (plane === 'xz') return [u,offset,v];
  // CeTZ on-zy (on-yz on 0.4) maps local x to positive z.
  return [offset,v,u];
}
function insertion3D(source, rendered, payload, trustedCall) {
  if (!payload || !Number.isInteger(payload.view) || !['xy','xz','zy'].includes(payload.plane) ||
      !Number.isFinite(payload.offset) || Math.abs(payload.offset) > 1000000)
    throw new Error('Choose a valid 3D view, drawing plane and offset.');
  const view = rendered.workspace?.views.find(view => view.index === payload.view && view.matrix);
  const target = view && rendered.calls[view.index];
  if (!target || target.bodyStart == null) throw new Error('The 3D view changed. Choose it again.');
  const call = trustedCall || callFromPoints(payload.name, payload.points);
  const legacy = /@preview\/cetz:0\.4\./.test(source);
  const func = payload.plane === 'zy' ? (legacy ? 'on-yz' : 'on-zy') : 'on-' + payload.plane;
  const axis = {xy:'z',xz:'y',zy:'x'}[payload.plane];
  const text = `\ncetz.draw.${func}(${axis}: ${coordinate(payload.offset)}, {\n  import cetz.draw: *\n  ${call}\n})\n`;
  const at=require('./plane-editor').cameraInfo(source,target).end;
  return {start:at, end:at, text};
}
module.exports = { probesFor, calibratedViews, calibratedPlanes, axisRanges, project, fitCamera, planePoint, insertion3D, solve };
