'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { outputName, exportTypst } = require('../src/export');

test('exports the current Typst document as PDF and names multipage images', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gui-cetz-export-'));
  const source = path.join(directory, 'diagram.typ');
  const output = path.join(directory, 'diagram.pdf');
  fs.writeFileSync(source, '#set page(width: 5cm, height: 5cm)\nHello');
  const vscode = {
    Uri: { file: fsPath => ({ fsPath }) },
    window: {
      showQuickPick: async () => 'PDF',
      showSaveDialog: async () => ({ fsPath: output }),
      showInformationMessage: () => {},
    },
  };
  try {
    await exportTypst(vscode, { uri: { fsPath: source }, isDirty: false });
    assert.ok(fs.statSync(output).size > 100);
    assert.equal(outputName(source, 'svg'), 'diagram-{0p}.svg');
    assert.equal(outputName(source, 'png'), 'diagram-{0p}.png');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('standalone PDF and SVG exports save compact native plane-content angles in the Typst document',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'gui-cetz-plane-export-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const source=path.join(directory,'plane.typ');
  const document={uri:{fsPath:source},version:1,isDirty:false,
    text:'#import "@preview/cetz:0.5.3"\n#cetz.canvas({import cetz.draw: *\northo(x:25deg,y:40deg,{on-xy({content((0,0))[Plane]})\ncontent((1,2,3))[XYZ]})})',
    getText(){return this.text;},positionAt(offset){return offset;},
    async save(){fs.writeFileSync(source,this.text);this.isDirty=false;return true;}};
  await document.save();
  let format='SVG',edits=0;
  const vscode={Uri:{file:fsPath=>({fsPath})},Range:class{constructor(start,end){Object.assign(this,{start,end});}},
    WorkspaceEdit:class{constructor(){this.edits=[];}replace(uri,range,text){this.edits.push({range,text});}},
    workspace:{async applyEdit(edit){for(const e of edit.edits.sort((a,b)=>b.range.start-a.range.start))document.text=document.text.slice(0,e.range.start)+e.text+document.text.slice(e.range.end);document.version++;document.isDirty=true;edits++;return true;}},
    window:{showQuickPick:async()=>format,showSaveDialog:async()=>({fsPath:path.join(directory,'output.'+format.toLowerCase())}),showInformationMessage(){}}};
  for(format of ['SVG','PDF']){
    await exportTypst(vscode,document);
    assert.ok(fs.statSync(path.join(directory,'output.'+format.toLowerCase())).size>100);
  }
  assert.equal(edits,1,'the native angle is installed only once');
  assert.ok(fs.readFileSync(source,'utf8').includes('angle: (rel: (1, 0))'));
  assert.doesNotMatch(document.text,/__gui-plane|GUI-CeTZ plane content/);
  assert.deepEqual(fs.readdirSync(directory).sort(),['output.pdf','output.svg','plane.typ']);
  const output=fs.readFileSync(path.join(directory,'output.svg'),'utf8');
  assert.match(output,/<use\b/);assert.doesNotMatch(output,/<image\b/);
});
