'use strict';

// Source compatibility examples. These are not drawing tools.
module.exports = [
  { label: 'boolean', call: 'boolean({ rect((0, 0), (2, 2)) }, { rect((1, 1), (3, 3)) }, op: "difference", fill: blue)' },
  { label: 'rect-around', call: 'rect-around((0, 0), (2, 1), padding: 0.1)' },
  { label: 'merge-path', call: 'merge-path({\n  line((0, 0), (1, 0))\n  line((1, 0), (1, 1))\n}, stroke: blue)' },
  { label: 'compound-path', call: 'compound-path({\n  rect((-1, -1), (1, 1))\n  circle((0, 0), radius: 0.5)\n}, fill: blue, fill-rule: "even-odd")' }
];
