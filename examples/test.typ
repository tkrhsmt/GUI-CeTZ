#import "@preview/cetz:0.5.2"
#import "@preview/lilaq:0.6.0" as lq

#set page(height: auto, width: auto, margin: 3pt)
#set text(size: 20pt, font: "Times New Roman")

#cetz.canvas({
  import cetz.draw: *

  line((0, 0), (14, 0), mark: (end: "stealth", fill: black), stroke: 1.5pt)
  line((0, 0),(0, 9), mark: (end: "stealth", fill: black), stroke: 1.5pt)
  content((14, -0.6))[$k$]
  content((-1, 9))[$E(k)$]

  bezier((0.15, 7), (2, 8), (1, 8.17))
  line((2, 8), (5, 7.4))
  line((5, 7.4), (9, 5))
  bezier((9, 5), (11, 0.3), (10.5, 4.2))

  line((5, 0), (5, 9), stroke: (paint: luma(150), dash: "dashed"))
  content((5, -0.6))[$k_f$]
  line((9, 0), (9, 9), stroke: (paint: luma(150), dash: "dashed"))
  content((9, -0.6))[$k_nu$]
  line((10.25, 0), (10.25, 6), stroke: (paint: luma(150), dash: "dashed"))
  content((10.25, -0.6))[$k_c$]

  line((5, 5), (5, 7.4), mark: (end: "stealth", fill: gray), stroke: gray + 3pt)
  content((6, 5.6), text(fill: gray)[force])

  line((2.5, 8.5), (4.75, 8), mark: (start: "stealth", fill: teal), stroke: teal + 3pt)
  content((3, 9), text(fill: teal)[energy])

  line((8.5, 5.9), (6, 7.4), mark: (start: "stealth", fill: red), stroke: red + 3pt)
  content((9, 7), box(fill: white, outset: 2.5pt, text(fill: red)[enstrophy]))

  line((0.5, 6), (0.5, 7.6), stroke: (paint: gray, thickness: 3pt, dash: "dashed"))
  line((0.5, 5.8), (0.5, 6), mark: (start: "stealth", fill: gray), stroke: (paint: gray, thickness: 3pt))
  content((1.5, 6.25), text(fill: gray)[drag])

  content((3, 7), [$prop k^(-5\/3)$])
  content((7.8, 4.7), [$prop k^(-3)$])

  bezier((10.25, 3.4), (11, 0.3), (10.625, 2.75), stroke: white + 2pt)
  bezier((10.25, 3.4), (11, 0.3), (10.625, 2.75), stroke: (dash: "dotted", thickness: 1pt))

  line((10.125, 3.7), (13, 4.5), stroke: 1.5pt + lq.color.map.okabe-ito.at(0))
  line((10.25, 3.4), (13.25, 4.2), stroke: 1.5pt + lq.color.map.okabe-ito.at(1))

  content((12, 4.85), text(fill: lq.color.map.okabe-ito.at(0), size: 0.7em)[$display(1/(2 pi) (k_"B"T)/rho k)$])
  content((12.5, 3), text(fill: lq.color.map.okabe-ito.at(1), size: 0.7em)[$display(1/(4 pi) (k_"B"T)/rho k)$])














})
