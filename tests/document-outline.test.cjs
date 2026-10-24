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
test('HTML outline follows elements, identifiers, classes and void tags without parsing comments or scripts as markup',async()=>{
 const {documentOutline}=await outline();
 const source='<!doctype html>\n<html>\n<head><title>Example</title></head>\n<body>\n<!-- <section id="fake"></section> -->\n<main ID="content" CLASS=" page   wide ">\n<img src="cover.png"><h1>Title</h1>\n<script>const template = "<div id=hidden></div>";</script>\n</main>\n<footer>End</footer>\n</body>\n</html>';
 const result=await documentOutline(model(source,'html'),{});
 assert.equal(result.supported,true);
 assert.deepEqual(result.entries.map(e=>[e.name,e.line,e.depth]),[
  ['html',2,0],['head',3,1],['title',3,2],['body',4,1],['main#content.page.wide',6,2],
  ['img',7,3],['h1',7,3],['script',8,3],['footer',10,2]
 ]);
 const main=result.entries.find(e=>e.name.startsWith('main'));
 assert.deepEqual([main.column,main.endLine,main.endColumn],[1,9,8]);
});
test('HTML outline nests CSS in head style blocks and preserves original ranges, including inline styles and CRLF',async()=>{
 const {documentOutline}=await outline();
 const source='<html>\r\n<head>\r\n  <style>\r\n/* .fake {} */\r\n@media (width > 600px) {\r\n  .card, a:hover { color: red; }\r\n}\r\n  </style>\r\n  <STYLE TYPE="text/css">.inline { color: blue; }</STYLE>\r\n</head>\r\n<body><main id="app"></main></body>\r\n</html>';
 const entries=(await documentOutline(model(source,'html'),{})).entries;
 assert.deepEqual(entries.map(e=>[e.name,e.line,e.depth]),[
  ['html',1,0],['head',2,1],['style',3,2],['@media (width > 600px)',5,3],['.card',6,4],['a:hover',6,4],
  ['STYLE',9,2],['.inline',9,3],['body',11,1],['main#app',11,2]
 ]);
 const card=entries.find(e=>e.name==='.card'),inline=entries.find(e=>e.name==='.inline');
 assert.deepEqual([card.column,card.endLine,card.endColumn],[3,6,33]);
 const inlineSource=source.split('\r\n')[8];
 assert.deepEqual([inline.column,inline.endLine,inline.endColumn],[inlineSource.indexOf('.inline')+1,9,inlineSource.indexOf('</STYLE>')+1]);
});
test('HTML outline ignores fake style blocks and non-CSS types and tolerates incomplete markup and CSS',async()=>{
 const {documentOutline}=await outline();
 const source='<head><!-- <style>.comment {}</style> --><script>"<style>.script {}</style>"</script><style type="text/plain">.plain {}</style><style>.first {}</style><style>\n.second { color:';
 const entries=(await documentOutline(model(source,'html'),{})).entries;
 assert.deepEqual(entries.filter(e=>e.kind==='Selector').map(e=>[e.name,e.line,e.depth]),[['.first',1,2],['.second',2,2]]);
 assert.equal(entries.at(-1).endLine,2);
 assert.deepEqual((await documentOutline(model('<!-- empty -->','html'),{})).entries,[]);
 assert.deepEqual((await documentOutline(model('<div><span','html'),{})).entries.map(e=>[e.name,e.depth]),[['div',0],['span',1]]);
});
test('HTML outline applies entry and size limits to elements and embedded CSS and handles deep nesting',async()=>{
 const {documentOutline}=await outline();
 for(const source of ['<div></div>'.repeat(1005),'<head><style>'+'.rule {}\n'.repeat(1005)+'</style></head>','<div>'.repeat(1500)]){
  const result=await documentOutline(model(source,'html'),{});
  assert.equal(result.entries.length,1000);assert.equal(result.limited,true);
 }
 assert.equal((await documentOutline(model(' '.repeat(2*1024*1024+1),'html'),{})).tooLarge,true);
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
test('HTML outline panel filters embedded selectors and navigates and highlights their original source positions',async()=>{
 const ids=['document-outline','outline-list','outline-filter','outline-status','outline-document','btn-outline','outline-refresh'];
 const {elements,documentRef}=panelDom(ids),source='<html>\n<head><style>\n  .card { color: red; }\n</style></head>\n<body></body>\n</html>',doc=model(source,'html');
 let position={lineNumber:3,column:12},revealed=null;
 const editor={getPosition:()=>position,setPosition:value=>{position=value;},revealPositionInCenter:value=>{revealed=value;},focus(){},onDidChangeCursorPosition:()=>({dispose(){}})};
 const {installDocumentOutline}=await import('../src/document-outline-panel.js');
 const panel=installDocumentOutline({documentRef,sidebar:{onShow(){},show(){}},monaco:{editor:{}}});
 try{
  panel.activate({model:doc,name:'page.html'},editor);await panel.refresh();
  const active=elements['outline-list'].children.map(li=>li.children[0]).filter(button=>button.classList.contains('current'));
  assert.equal(active.length,1);assert.equal(active[0].children[0].textContent,'.card');
  elements['outline-filter'].value='.card';elements['outline-filter'].dispatch('input');
  assert.equal(elements['outline-list'].children.length,1);
  elements['outline-list'].children[0].children[0].onclick();
  assert.deepEqual(position,{lineNumber:3,column:3});assert.deepEqual(revealed,position);assert.equal(doc.getValue(),source);
 }finally{panel.dispose();}
});
test('sidebar views are mutually exclusive across Explorer, Search, Outline and Connections',async()=>{
 const {installSidebarViews}=await import('../src/sidebar-views.js');
 const {elements,documentRef}=panelDom(['explorer-view','project-search','document-outline','remote-connections','btn-explorer','btn-project-search','btn-outline','btn-connections']);
 const views=installSidebarViews({documentRef});
 for(const name of ['outline','search','connections','explorer']){views.show(name);assert.equal(['explorer-view','project-search','document-outline','remote-connections'].filter(id=>!elements[id].hidden).length,1);assert.equal(views.current,name);}
});
