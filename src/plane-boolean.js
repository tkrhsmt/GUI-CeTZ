'use strict';

// CeTZ Boolean requires constant-z input. Evaluate it in the plane's local
// frame, then return its paths and anchor callback in the original frame.
// This source adapter is emitted only when creating a Boolean in a 2D plane.
const ADAPTER = `// GUI-CeTZ local Boolean
let boolean = (..args) => {
  let body = cetz.draw.boolean(..args)
  body.map(f => ctx => {
    let transform = ctx.transform
    let local = ctx
    local.transform = cetz.matrix.ident(4)
    let inverse = cetz.matrix.inverse(transform)
    let local-nodes = (:)
    for (name, node) in ctx.nodes {
      if "drawables" in node { node.drawables = cetz.drawable.apply-transform(inverse, node.drawables) }
      if "anchors" in node and type(node.anchors) == function {
        let anchors = node.anchors
        node.anchors = a => {
          let value = anchors(a)
          if a == () or value == none { value } else { cetz.util.apply-transform(inverse, value) }
        }
      }
      local-nodes.insert(name, node)
    }
    local.nodes = local-nodes
    let element = f(local)
    element.ctx = ctx
    element.drawables = cetz.drawable.apply-transform(transform, element.at("drawables", default: ()))
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
`;
function localBooleanPatches(source,rendered,action,operation) {
  const patches=operation(source,rendered,action);
  if(!rendered.planeContext||!action.action.startsWith('boolean-'))return patches;
  const patch=patches.find(p=>p.text.includes('boolean('));
  if(!patch)throw new Error('Cannot create this Boolean operation.');
  patch.text=ADAPTER+patch.text;
  if(patches.selectStart!==undefined)patches.selectStart+=ADAPTER.length;
  return patches;
}
function installLocalBooleans(body){
  if(body.includes('// GUI-CeTZ local Boolean'))return body;
  const prefix='#cetz.canvas({',source=prefix+body+'})';
  const calls=require('./three-dimensional').locate3DCalls(source,{bodyStart:prefix.length,bodyEnd:prefix.length+body.length});
  for(const call of calls.filter(call=>call.name==='boolean').sort((a,b)=>b.start-a.start)){
    const at=call.start-prefix.length,end=call.end-prefix.length;
    body=body.slice(0,at)+ADAPTER+body.slice(at,end).replace(/^cetz\.draw\./,'')+body.slice(end);
  }
  return body;
}
module.exports={ADAPTER,localBooleanPatches,installLocalBooleans};
