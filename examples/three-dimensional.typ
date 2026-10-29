#import "@preview/cetz:0.5.3"
#set page(width: auto, height: auto, margin: 12pt)

// Open GUI CeTZ. Alt + drag or enable Orbit to rotate the view.
// Choose a Drawing plane and Plane offset, then use any drawing icon.
// The colored XYZ axes and background grids are editor guides only.
// Coordinates inside each plane are local X/Y; the line uses explicit XYZ.
#cetz.canvas({
  import cetz.draw: *
  ortho(x: 20.165985deg, y: -318.994079deg, z: 0deg, sorted: true, {

    on-xy(z: 0, {
      rect((0, 0), (3, 2), fill: blue.lighten(70%), stroke: blue)
    })
    on-xz(y: 0, {
      rect((0, 0), (3, 2), fill: green.lighten(70%), stroke: green)
    })
    on-zy(x: 0, {
      rect((0, 0), (2, 2), fill: orange.lighten(70%), stroke: orange)
})
    line((0, 0, 0), (3, 2, 2), stroke: 1.5pt + red)
    content((3, 2, 2), [XYZ], anchor: "south")
  })
})
