#import "@preview/cetz:0.4.2"

#cetz.canvas({
  import cetz.draw: *
  rect((0, 0), (rel: (3, 2)), radius: 10%, fill: rgb("#ddeeff"))
  circle((1.5, 1), radius: (0.45, 0.25), fill: orange)
  line((3, 1), (4, 1.5), (5, 1), mark: (end: ">"))
  content((1.5, 2.5), [Hello CeTZ])
  polygon((6, 1), 5, radius: 0.8)
})
