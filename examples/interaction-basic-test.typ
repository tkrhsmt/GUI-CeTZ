#import "@preview/cetz:0.5.2"
#cetz.canvas({
  import cetz.draw: *
  line((0, 0), (2, 0), stroke: (paint: rgb("#000000"), thickness: 1pt, dash: "dashed"))

  circle((1.375, 0), radius: 1.375, stroke: (paint: rgb("#000000"), thickness: 1pt, dash: "dotted"))
})
