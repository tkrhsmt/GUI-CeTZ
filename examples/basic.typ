#import "@preview/cetz:0.4.2"

#let accent = blue.lighten(80%)

#cetz.canvas({
  import cetz.draw: *

  // Drag the rectangle in Draw.io; only these coordinate numbers change.
  rect((0, 0), (3, 2), fill: accent)
  circle((1.5, 1), radius: 0.2, fill: red)
  line((3, 1), (4, 1), stroke: 1pt + black)
  line((1.79877, 2.84878), (1, 1), stroke: 1pt + black)

  content((0.60002, 0.25), [aaaa])

  content((2.40001, 1.74995), [aaaa])
})
