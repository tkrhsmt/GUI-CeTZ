#import "@preview/cetz:0.5.3"
#set page(width: auto, height: auto, margin: 12pt)

#cetz.canvas({
  import cetz.draw: *
  rect((0, 0), (2, 1.5), name: "input", fill: blue.lighten(80%))
  rect((4, 0), (6, 1.5), name: "process", fill: orange.lighten(70%))
  circle((9, 0.75), radius: 0.75, name: "output", fill: green.lighten(80%))
})
