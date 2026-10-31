#import "@preview/cetz:0.5.3"
#cetz.canvas({
// GUI-CeTZ plane content v1
let __gui-plane-native = cetz.draw
let __gui-plane-content = (..args) => {
  __gui-plane-native.content(..args).map(f => ctx => {
    if not ctx.at("__gui-plane", default: false) { return f(ctx) }
    let transform = ctx.transform
    let local = ctx
    local.transform = cetz.matrix.ident(4)
    let inverse = cetz.matrix.inverse(transform)
    local.nodes = ctx.nodes.pairs().map(((name, node)) => {
      if "drawables" in node { node.drawables = cetz.drawable.apply-transform(inverse, node.drawables) }
      if "anchors" in node and type(node.anchors) == function {
        let anchors = node.anchors
        node.anchors = a => {
          let value = anchors(a)
          if a == () or value == none { value } else { cetz.util.apply-transform(inverse, value) }
        }
      }
      (name, node)
    }).fold((:), (nodes, pair) => { nodes.insert(..pair); nodes })
    let element = f(local)
    element.ctx = ctx
    element.drawables = element.at("drawables", default: ()).map(d => {
      if d.type == "content" {
        let (x, y, z) = d.pos
        let (w, h) = (d.width / 2, d.height / 2)
        d.insert("__gui-plane-size", (d.width, d.height))
        // Older CeTZ versions transform border vertices only for paths.
        // Carry the text rectangle through the complete projection as a path.
        d.type = "path"
        d.stroke = none
        d.fill = none
        d.segments = (((x - w, y + h, z), true, (
          ("l", (x + w, y + h, z)), ("l", (x + w, y - h, z)),
          ("l", (x - w, y - h, z)), ("l", (x - w, y + h, z)),
        )),)
      }
      d
    })
    element.drawables = cetz.drawable.apply-transform(transform, element.drawables)
    if "anchors" in element {
      let anchors = element.anchors
      element.anchors = a => {
        let value = anchors(a)
        if a == () or value == none { value } else { cetz.util.apply-transform(transform, value) }
      }
    }
    element
  })
}
let __gui-plane-body = body => {
  __gui-plane-native.set-ctx(ctx => { ctx.insert("__gui-plane", true); ctx })
  body
}
let __gui-plane-affine = (body, w, h, a, b, c, d, length) => {
  let sx = calc.sqrt(a*a + b*b)
  let sy = if sx > 0.000000001 { (a*d - b*c) / sx } else { 0 }
  let width = (calc.abs(a)*w + calc.abs(c)*h) * length
  let height = (calc.abs(b)*w + calc.abs(d)*h) * length
  if sx < 0.000000001 or calc.abs(sy) < 0.000000001 { return (none, 0, 0) }
  let shape = std.skew(ax: calc.atan((a*c + b*d)/(sx*sx)), origin: center + horizon, body)
  shape = std.scale(x: sx*100%, y: sy*100%, origin: center + horizon, shape)
  shape = std.rotate(calc.atan2(a, b), origin: center + horizon, shape)
  (std.block(width: width, height: height, std.place(center + horizon, shape)), width/length, height/length)
}
let __gui-plane-project = body => body.map(f => ctx => {
  let level = ctx.at("__gui-plane-projection-level", default: 0)
  ctx.insert("__gui-plane-projection-level", level + 1)
  let element = f(ctx)
  element.ctx.insert("__gui-plane-projection-level", level)
  if level > 0 { return element }
  let screen-y = if ctx.version < std.version(0, 5, 0) { 1 } else { -1 }
  let result = ()
  for d in element.at("drawables", default: ()) {
    if "__gui-plane-size" not in d { result.push(d); continue }
    let (w, h) = d.remove("__gui-plane-size")
    if w <= 0 or h <= 0 { result.push(d); continue }
    let (origin, _, segments) = d.segments.first()
    let corners = (origin,) + segments.slice(0, 3).map(s => s.at(1))
    let p = corners.map(p => (p.at(0), screen-y*p.at(1)))
    let (dx1, dx2, dx3) = (p.at(1).at(0)-p.at(2).at(0), p.at(3).at(0)-p.at(2).at(0), p.at(0).at(0)-p.at(1).at(0)+p.at(2).at(0)-p.at(3).at(0))
    let (dy1, dy2, dy3) = (p.at(1).at(1)-p.at(2).at(1), p.at(3).at(1)-p.at(2).at(1), p.at(0).at(1)-p.at(1).at(1)+p.at(2).at(1)-p.at(3).at(1))
    let det = dx1*dy2 - dx2*dy1
    if calc.abs(det) < 0.000000000001 { continue }
    let g = (dx3*dy2 - dx2*dy3)/det
    let k = (dx1*dy3 - dx3*dy1)/det
    let map-point(u, v) = {
      let denominator = 1 + g*u + k*v
      (((p.at(1).at(0)-p.at(0).at(0)+g*p.at(1).at(0))*u + (p.at(3).at(0)-p.at(0).at(0)+k*p.at(3).at(0))*v + p.at(0).at(0))/denominator,
       ((p.at(1).at(1)-p.at(0).at(1)+g*p.at(1).at(1))*u + (p.at(3).at(1)-p.at(0).at(1)+k*p.at(3).at(1))*v + p.at(0).at(1))/denominator)
    }
    // Orthographic text is one exact vector transform. Perspective text uses
    // small clipped vector tiles, preserving equations, fonts and images.
    let nx = if calc.abs(g) < 0.00000001 { 1 } else { 16 }
    let ny = if calc.abs(k) < 0.00000001 { 1 } else { 8 }
    for row in range(ny) { for col in range(nx) {
      let (u, v) = ((col+0.5)/nx, (row+0.5)/ny)
      let (p-left, p-right) = (map-point(col/nx, v), map-point((col+1)/nx, v))
      let (p-top, p-bottom) = (map-point(u, row/ny), map-point(u, (row+1)/ny))
      let (tw, th) = (w/nx, h/ny)
      let tile = if nx == 1 and ny == 1 { d.body } else {
        std.block(width: tw*ctx.length, height: th*ctx.length, clip: true,
          std.place(top + left, dx: -col*tw*ctx.length, dy: -row*th*ctx.length, d.body))
      }
      let (shape, width, height) = __gui-plane-affine(tile, tw, th,
        (p-right.at(0)-p-left.at(0))/tw, (p-right.at(1)-p-left.at(1))/tw,
        (p-bottom.at(0)-p-top.at(0))/th, (p-bottom.at(1)-p-top.at(1))/th, ctx.length)
      if shape != none {
        let point = map-point(u, v)
        let part = d
        part.type = "content"
        part.pos = (point.at(0), screen-y*point.at(1), d.pos.at(2))
        part.body = shape
        part.width = width
        part.height = height
        result.push(part)
      }
    }}
  }
  element.drawables = result
  element
})
let content = __gui-plane-content
let ortho = (..args) => __gui-plane-project(__gui-plane-native.ortho(..args))
let perspective = (..args) => __gui-plane-project(__gui-plane-native.perspective(..args))
let on-xy = (body, ..args) => __gui-plane-project(__gui-plane-native.on-xy(..args, __gui-plane-body(body)))
let on-xz = (body, ..args) => __gui-plane-project(__gui-plane-native.on-xz(..args, __gui-plane-body(body)))
let __gui-plane-side = dictionary(__gui-plane-native).at("on-zy", default: dictionary(__gui-plane-native).at("on-yz", default: none))
let on-zy = (body, ..args) => __gui-plane-project(__gui-plane-side(..args, __gui-plane-body(body)))
let on-yz = on-zy
// GUI-CeTZ plane content end

import cetz.draw: *
// GUI-CeTZ plane bindings
let content = __gui-plane-content
let ortho = (..args) => __gui-plane-project(__gui-plane-native.ortho(..args))
let perspective = (..args) => __gui-plane-project(__gui-plane-native.perspective(..args))
let on-xy = (body, ..args) => __gui-plane-project(__gui-plane-native.on-xy(..args, __gui-plane-body(body)))
let on-xz = (body, ..args) => __gui-plane-project(__gui-plane-native.on-xz(..args, __gui-plane-body(body)))
let __gui-plane-side = dictionary(__gui-plane-native).at("on-zy", default: dictionary(__gui-plane-native).at("on-yz", default: none))
let on-zy = (body, ..args) => __gui-plane-project(__gui-plane-side(..args, __gui-plane-body(body)))
let on-yz = on-zy
// GUI-CeTZ plane bindings end
ortho(x:23deg,y:40deg,sorted:false,{on-xy({content((1,1))[P]})
on-xz({rect((0,0),(2,1))})
content((1,2,3))[XYZ]})
})
