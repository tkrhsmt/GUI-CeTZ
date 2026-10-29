#import "@preview/cetz:0.5.3"
#set page(width: auto, height: auto, margin: 12pt)

#cetz.canvas({
  import cetz.draw: *
  rect((0, 0), (3, 2), fill: blue.lighten(85%))
  circle((1.5, 1), radius: 0.5, fill: orange)
  content((1.5, 2.5), [Hello CeTZ])
})
