'use strict';
const { coordinate } = require('./snapping');

const SPECS = {
  content: { count: 1 },
  line: { count: 2 }, mark: { count: 2 }, rect: { count: 2 },
  circle: { count: 2 }, 'n-star': { count: 2 }, grid: { count: 2 }, 'rect-around': { count: 2 },
  arc: { count: 3 }, bezier: { count: 4 }, 'compound-path': { count: 4 },
  hobby: { min: 2 }, catmull: { min: 2 }, 'merge-path': { min: 2 }
};
const format = coordinate;
const point = value => `(${format(value[0])}, ${format(value[1])})`;
const distance = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

function callFromPoints(name, points) {
  const spec = SPECS[name];
  if (!spec || !Array.isArray(points) || points.length > 4096 ||
    (spec.count ? points.length !== spec.count : points.length < spec.min) ||
    points.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite)))
    throw new Error('Invalid CeTZ placement points.');
  const [a, b, c, d] = points;
  const pair = () => `${point(a)}, ${point(b)}`;
  const radius = () => {
    const value = format(distance(a, b));
    if (value <= 0) throw new Error('Choose a radius greater than zero.');
    return value;
  };
  if (name === 'content') return `content(${point(a)}, [Text])`;
  if ((name === 'line' || name === 'mark') && distance(a, b) < 0.00001)
    throw new Error('Choose distinct start and end points.');
  if (name === 'line') return `line(${pair()})`;
  if (name === 'mark') return `mark(${pair()}, symbol: ">", scale: 3)`;
  if (['rect', 'grid', 'rect-around', 'compound-path'].includes(name) &&
    (Math.abs(a[0] - b[0]) < 0.00001 || Math.abs(a[1] - b[1]) < 0.00001))
    throw new Error('Choose two corners with nonzero width and height.');
  if (name === 'rect') return `rect(${pair()})`;
  if (name === 'grid') return `grid(${pair()}, step: 0.5, stroke: gray)`;
  if (name === 'rect-around') return `rect-around(${pair()}, padding: 0.1)`;
  if (name === 'circle') return `circle(${point(a)}, radius: ${radius()})`;
  if (name === 'n-star') return `n-star(${point(a)}, 5, radius: ${radius()}, fill: yellow)`;
  if (name === 'arc') {
    const r = radius();
    if (distance(a, c) < 0.00001) throw new Error('Choose an arc end away from its center.');
    const angle = p => Math.atan2(p[1] - a[1], p[0] - a[0]) * 180 / Math.PI;
    const start = angle(b);
    let stop = angle(c);
    while (stop <= start) stop += 360;
    return `arc(${point(a)}, start: ${format(start)}deg, stop: ${format(stop)}deg, radius: ${r}, anchor: "origin")`;
  }
  if (name === 'bezier' || name === 'hobby' || name === 'catmull')
    return `${name}(${points.map(point).join(', ')})`;
  if (name === 'merge-path') return 'merge-path({\n' + points.slice(1).map((p, i) =>
    `  line(${point(points[i])}, ${point(p)})`).join('\n') + '\n}, stroke: blue)';
  const holeRadius = format(distance(c, d));
  if (holeRadius <= 0) throw new Error('Choose a hole radius greater than zero.');
  return `compound-path({\n  rect(${pair()})\n  circle(${point(c)}, radius: ${holeRadius})\n}, fill: blue, fill-rule: "even-odd")`;
}

module.exports = { SPECS, callFromPoints };
