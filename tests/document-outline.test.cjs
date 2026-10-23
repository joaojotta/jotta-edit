'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {panelDom}=require('./fixtures/panel-dom.cjs');
const outline=()=>import('../src/document-outline.js');
function model(text,language){let version=1;return {getValue:()=>text,getValueLength:()=>text.length,getLanguageId:()=>language,getVersionId:()=>version,change:()=>version++,isDisposed:()=>false,onDidChangeContent:()=>({dispose(){}}),uri:{toString:()=>`file:///test.${language}`}};}
test('Markdown outline uses real headings, preserves line numbers and ignores code fences and front matter',async()=>{
 const {markdownOutline}=await outline();
 const source='---\ntitle: Hidden\n---\n# Main **title**\n\n```md\n# fake\n```\n\nSubheading\n----------\n\n## [Link](https://example.com)\n';
 const entries=markdownOutline(source);
 assert.deepEqual(entries.map(e=>[e.name,e.line,e.depth]),[['Main title',4,0],['Subheading',10,1],['Link',13,1]]);
 assert.equal(entries[1].endLine,12);
 assert.deepEqual(markdownOutline('    # indented code\n\n~~~\n# fenced code\n~~~'),[]);
 assert.deepEqual(markdownOutline('# One\r\n\r\n## Two').map(e=>e.line),[1,3]);
});
test('CSS outline parses grouped selectors, nested media rules and SCSS with the bundled language service',async()=>{
 const {documentOutline}=await outline();
 const source='/* .fake {} */\n@media (width > 600px) {\n  .card, a:hover { color: red; }\n}\n.button { content: "# fake"; }';
 const entries=(await documentOutline(model(source,'css'),{})).entries;
 assert.deepEqual(entries.map(e=>[e.name,e.line,e.depth]),[['@media (width > 600px)',2,0],['.card',3,1],['a:hover',3,1],['.button',5,0]]);
 const scss=(await documentOutline(model('.card { &:hover { color:red; } }','scss'),{})).entries;
 assert.ok(scss.some(e=>e.name.includes(':hover')));
});
test('function outlines ignore comments and strings in Python and PHP',async()=>{
 const {declarationOutline}=await outline();
 const python='"""\ndef fake():\n    pass\n"""\nclass App:\n    async def run(self):\n        pass\n\ndef final():\n    pass';
 assert.deepEqual(declarationOutline(python,'python').map(e=>[e.name,e.line,e.depth]),[['App',5,0],['run',6,1],['final',9,0]]);
 const php='<?php\n/* function fake() {} */\n$x = "function nope() {}";\nclass App {\n public static function &run() {}\n}\nfunction finalOne() {}\n$x = <<<\'HTML\'\nfunction hiddenInHeredoc() {}\nHTML;';
 assert.deepEqual(declarationOutline(php,'php').map(e=>[e.name,e.line]),[['App',4],['run',5],['finalOne',7]]);
});
test('JavaScript outline retains worker ranges and nested functions, and bounds large documents',async()=>{
 const {documentOutline}=await outline();const doc=model('class App {}','javascript');doc.getPositionAt=n=>({lineNumber:1,column:n+1});
 const tree={childItems:[{text:'App',kind:'class',spans:[{start:0,length:12}],childItems:[{text:'run',kind:'method',spans:[{start:6,length:3}]}]}]};
 const monaco={languages:{typescript:{getJavaScriptWorker:async()=>async()=>({getNavigationTree:async()=>tree})}}};
 assert.deepEqual((await documentOutline(doc,monaco)).entries.map(e=>[e.name,e.depth,e.column]),[['App',0,1],['run',1,7]]);
 assert.equal((await documentOutline(model('x'.repeat(2*1024*1024+1),'javascript'),{})).tooLarge,true);
 const headings=(await documentOutline(model('# Heading\n'.repeat(1005),'markdown'),{}));assert.equal(headings.entries.length,1000);assert.equal(headings.limited,true);
 assert.equal((await documentOutline(model('hello','plaintext'),{})).supported,false);
});
test('outline panel ignores late results after switching editors and navigates without changing text',async()=>{
 const ids=['document-outline','outline-list','outline-filter','outline-status','outline-document','btn-outline','outline-refresh'];
 const {elements,documentRef}=panelDom(ids);let resolveFirst,selected=null;
 const first=model('# First','markdown'),second=model('# Second','markdown');
 const target={getPosition:()=>({lineNumber:1,column:1}),setPosition:value=>{selected=value;},revealPositionInCenter(){},focus(){},onDidChangeCursorPosition:()=>({dispose(){}})};
 const sidebar={onShow(){},show(){}};
 const {installDocumentOutline}=await import('../src/document-outline-panel.js');
 const panel=installDocumentOutline({documentRef,sidebar,monaco:{editor:{}},load:doc=>doc===first?new Promise(resolve=>{resolveFirst=resolve;}):Promise.resolve({supported:true,entries:[{name:'Second',kind:'Heading',depth:0,line:1,column:1,endLine:2,endColumn:1}]})});
 panel.activate({model:first,name:'first.md'},target);const late=panel.refresh();
 panel.activate({model:second,name:'second.md'},target);await panel.refresh();resolveFirst({supported:true,entries:[{name:'Wrong',line:1}]});await late;
 assert.equal(elements['outline-list'].children[0].children[0].children[0].textContent,'Second');
 elements['outline-list'].children[0].children[0].onclick();assert.deepEqual(selected,{lineNumber:1,column:1});assert.equal(second.getValue(),'# Second');
 second.change();selected=null;elements['outline-list'].children[0].children[0].onclick();assert.equal(selected,null);
 elements['outline-filter'].value='absent';elements['outline-filter'].dispatch('input');assert.equal(elements['outline-list'].children.length,0);
 panel.dispose();
});
test('sidebar views are mutually exclusive across Explorer, Search, Outline and Connections',async()=>{
 const {installSidebarViews}=await import('../src/sidebar-views.js');
 const {elements,documentRef}=panelDom(['explorer-view','project-search','document-outline','remote-connections','btn-explorer','btn-project-search','btn-outline','btn-connections']);
 const views=installSidebarViews({documentRef});
 for(const name of ['outline','search','connections','explorer']){views.show(name);assert.equal(['explorer-view','project-search','document-outline','remote-connections'].filter(id=>!elements[id].hidden).length,1);assert.equal(views.current,name);}
});
