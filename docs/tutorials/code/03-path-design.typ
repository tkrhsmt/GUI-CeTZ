#import "@preview/cetz:0.5.3"
#set page(width: auto, height: auto, margin: 12pt)

#cetz.canvas({
  import cetz.draw: *
  rect((0, 0), (3, 2), fill: blue.lighten(70%), stroke: blue)
  circle((2.5, 1), radius: 0.8, fill: orange)
  circle((6, 1), radius: 1.2, fill: green.lighten(65%), stroke: green)
  circle((6, 1), radius: 0.6, fill: white)
})
