#import "@preview/cetz:0.5.3"
#set page(width: auto, height: auto, margin: 12pt)

// Open GUI CeTZ and select the 3D描画 tab.
// Choose a plane in the left panel, then click この面を2D描画.
// Position and rotation belong to the plane; coordinates below stay local X/Y.
#cetz.canvas({
  import cetz.draw: *
  ortho(x: 30deg, y: 40deg, z: 0deg, {
    cetz.draw.scope({
      // GUI-CeTZ plane: "gui-plane-1"
      cetz.draw.translate(x: 0, y: 0, z: 0)
      cetz.draw.rotate(x: 0deg, y: 0deg, z: 0deg)
      cetz.draw.on-xy({
        import cetz.draw: *
        rect((0, 0), (4, 3), fill: blue.lighten(85%), stroke: blue)
        circle((1, 1), radius: 0.5, fill: blue.lighten(35%))
        content((2, 2), [XY plane])
      })
    })
    cetz.draw.scope({
      // GUI-CeTZ plane: "gui-plane-2"
      cetz.draw.translate(x: 0, y: 2, z: 1)
      cetz.draw.rotate(x: 10deg, y: 0deg, z: 20deg)
      cetz.draw.on-xz({
        import cetz.draw: *
        rect((0, 0), (3, 2), fill: orange.lighten(80%), stroke: orange)
        bezier((0.5, 0.5), (2.5, 1), (1, 2), (2, 0))
        content((1.5, 1.5), [Tilted plane])
      })
    })
  })
})
