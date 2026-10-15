#import "@preview/cetz:0.5.2"

// Advanced CeTZ calls are rendered by Typst and shown in Draw.io as one image.
#cetz.canvas({
  import cetz.draw: *

  grid((0, 0), (6, 4), step: 1, stroke: gray)
  set-style(stroke: (paint: black, thickness: 1.5pt, dash: "dashed"))

  group({
    circle((1, 1), radius: 0.7, fill: blue)
    rect((2.4, 0.4), (4, 1.6), fill: orange)
  })

  arc((5, 1), start: 20deg, stop: 160deg, radius: 0.8)
  bezier((0.5, 2.5), (2, 2.5), (0.8, 3.7), (1.7, 1.4), stroke: red)
  n-star((3.3, 3), 5, radius: 0.7, fill: yellow)

  boolean(
    { rect((4.3, 2.3), (5.8, 3.7)) },
    { circle((5.6, 3), radius: 0.6) },
    op: "difference",
    fill: purple,
  )
})
