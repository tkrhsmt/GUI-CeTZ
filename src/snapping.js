'use strict';

const coordinate = value => {
  const short = Number(value.toFixed(5));
  return Math.abs(value - short) < 1e-7 ? short : Number(value.toFixed(8));
};
function snapStep(scale = 1) {
  return 0.25 / 2 ** Math.min(10, Math.max(0, Math.floor(Math.log2(Math.max(1, scale)))));
}
function readSnapStep(value) {
  if (value === undefined) return 0.25;
  const step = Number(value), levels = Math.log2(0.25 / step);
  if (!Number.isFinite(step) || step <= 0 || levels < 0 || levels > 10 || Math.abs(levels - Math.round(levels)) > 1e-8)
    throw new Error('Invalid CeTZ snapping precision.');
  return step;
}
function snapCoordinate(value, step = 0.25) {
  return coordinate(Math.round(value / step) * step);
}
function normalizeCoordinate(value, step) {
  const snapped = snapCoordinate(value, step);
  return Math.abs(value - snapped) < 0.00001 ? snapped : coordinate(value);
}
module.exports = { coordinate, snapStep, readSnapStep, snapCoordinate, normalizeCoordinate };
