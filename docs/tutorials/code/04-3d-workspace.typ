#import "@preview/cetz:0.5.3"
#set page(width: auto, height: auto, margin: 12pt)

#cetz.canvas({
  import cetz.draw: *
  rect((0, 0), (3, 2), fill: blue.lighten(85%), stroke: blue)
  circle((1, 1), radius: 0.4, fill: orange)
  content((2, 1), [Plane A])
})
