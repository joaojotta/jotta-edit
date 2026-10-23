'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const formatting=()=>import('../src/markdown-formatting.js');
const apply=(source,edit)=>source.slice(0,edit.start)+edit.text+source.slice(edit.end);
test('Markdown inline tools toggle selected or adjacent markers without removing bold for italic',async()=>{
 const {markdownEdit}=await formatting();
 let source='hello world',edit=markdownEdit(source,6,11,'bold');assert.equal(apply(source,edit),'hello **world**');assert.equal(edit.text.slice(edit.selectionStart-edit.start,edit.selectionEnd-edit.start),'world');
 source='hello **world**';assert.equal(apply(source,markdownEdit(source,8,13,'bold')),'hello world');
 assert.equal(apply('**world**',markdownEdit('**world**',0,9,'bold')),'world');
 assert.equal(apply('**world**',markdownEdit('**world**',2,7,'italic')),'***world***');
 assert.equal(apply('***world***',markdownEdit('***world***',3,8,'italic')),'**world**');
 assert.equal(markdownEdit('',0,0,'underline').text,'<u>text</u>');
 assert.equal(markdownEdit('x',0,1,'subscript').text,'<sub>x</sub>');
 assert.equal(markdownEdit('x',0,1,'superscript').text,'<sup>x</sup>');
 assert.equal(markdownEdit('x',0,1,'strike').text,'~~x~~');
});
test('Markdown block tools preserve CRLF and exclude an unselected next line',async()=>{
 const {markdownEdit}=await formatting();
 const source='first\r\nsecond\r\nthird';
 assert.equal(apply(source,markdownEdit(source,0,15,'heading-2')),'## first\r\n## second\r\nthird');
 assert.equal(apply('## first',markdownEdit('## first',4,4,'heading-1')),'# first');
 assert.equal(apply('## first',markdownEdit('## first',4,4,'heading-2')),'first');
 assert.equal(markdownEdit('\nnext',0,0,'quote').text,'> ');
 assert.equal(markdownEdit('  - old\n  - list',0,16,'ordered').text,'  1. old\n  2. list');
 assert.equal(markdownEdit('a\n\nb',0,4,'ordered').text,'1. a\n\n2. b');
 assert.equal(markdownEdit('- [x] a\n- [ ] b',0,15,'checklist').text,'a\nb');
});
test('Markdown snippets escape link labels, keep embedded backticks and support multiple selections',async()=>{
 const {markdownEdit,markdownEdits}=await formatting();
 const link=markdownEdit('[label]',0,7,'link');assert.equal(link.text,'[\\[label\\]](https://example.com)');assert.equal(link.text.slice(link.selectionStart,link.selectionEnd),'https://example.com');
 assert.equal(markdownEdit('alt',0,3,'image').text,'![alt](path/to/image.png)');
 const code=markdownEdit('a ``` b',0,7,'code-block');assert.ok(code.text.startsWith('````\n'));assert.ok(code.text.endsWith('\n````'));
 assert.equal(markdownEdit('a`b',0,3,'code').text,'``a`b``');
 assert.match(markdownEdit('',0,0,'table').text,/\| Column 1 \| Column 2 \|/);
 const edits=markdownEdits('one two',[{start:0,end:3},{start:4,end:7}],'bold');let source='one two';for(const edit of [...edits].reverse())source=apply(source,edit);assert.equal(source,'**one** **two**');
 assert.equal(markdownEdits('one',[{start:0,end:0},{start:2,end:2}],'quote').length,1);
 assert.throws(()=>markdownEdits('one two',[{start:0,end:5},{start:4,end:7}],'bold'),/separate selections/);
});
test('Markdown parser renders headings, tables, task lists and fenced code; formatter preserves prose lines',async()=>{
 const {markdownHTML}=await import('../src/markdown-renderer.js');
 const html=markdownHTML('# Title\n\n| A | B |\n| - | - |\n| a | b |\n\n- [x] done\n\n```js\nconst x = 1;\n```');
 assert.match(html,/<h1>Title<\/h1>/);assert.match(html,/<table>/);assert.match(html,/type="checkbox"/);assert.match(html,/<pre><code/);
 const {formatCode,formatLanguages}=await import('../src/formatting.js');assert.ok(formatLanguages.has('markdown'));
 const text='A paragraph that should remain on a single line. '.repeat(6).trim();
 const formatted=await formatCode('# title\n\n'+text,{language:'markdown',printWidth:'80'});assert.ok(formatted.includes(text));
});
test('Markdown links resolve within their document/workspace on Linux, Windows and UNC paths',async()=>{
 const {markdownTarget,externalMarkdownLink}=await import('../shared/markdown-paths.mjs');
 assert.deepEqual(markdownTarget('../img/logo.png','/work/docs/readme.md','/work'),{kind:'file',path:'/work/img/logo.png',scope:'/work',fragment:''});
 assert.equal(markdownTarget('/img/logo.png','/work/docs/readme.md','/work').path,'/work/img/logo.png');
 assert.equal(markdownTarget('logo.png','C:\\work\\readme.md',null).path,'C:/work/logo.png');
 assert.equal(markdownTarget('logo.png','C:/readme.md',null).scope,'C:/');
 assert.equal(markdownTarget('../img/a.png','//server/share/docs/a.md','//server/share').path,'//server/share/img/a.png');
 assert.equal(markdownTarget('other.md#title','/work/readme.md','/work').fragment,'title');
 assert.deepEqual(markdownTarget('#hello-world',null,null),{kind:'anchor',fragment:'hello-world'});
 assert.equal(externalMarkdownLink('https://example.com/path'),'https://example.com/path');
 for(const ref of ['../../private.png','%2e%2e/%2e%2e/private.png','file:///private.png','javascript:alert(1)','//other/share','slate://app/private','%00.png'])assert.equal(markdownTarget(ref,'/work/docs/a.md','/work'),null,ref);
 assert.equal(externalMarkdownLink('file:///private.txt'),null);
});
test('Markdown local image reads preserve bytes and reject remote addresses, large files and escaping symlinks',async t=>{
 const {readMarkdownAsset}=require('../electron/markdown-assets.cjs');const root=await fs.mkdtemp(path.join(os.tmpdir(),'jotta-markdown-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const work=path.join(root,'work');await fs.mkdir(work);const bytes=Buffer.from([137,80,78,71,0,255]);await fs.writeFile(path.join(work,'image.png'),bytes);
 const request={reference:'image.png',documentPath:path.join(work,'README.md'),root:work};const result=await readMarkdownAsset(request);assert.equal(result.bytes,bytes.length);assert.deepEqual(Buffer.from(result.url.split(',')[1],'base64'),bytes);
 await assert.rejects(readMarkdownAsset({...request,reference:'https://example.com/image.png'}),/Only local/);
 await fs.writeFile(path.join(root,'private.png'),bytes);
 await assert.rejects(readMarkdownAsset({...request,reference:'../private.png'}),/Only local/);
 if(process.platform!=='win32'){await fs.symlink(path.join(root,'private.png'),path.join(work,'linked.png'));await assert.rejects(readMarkdownAsset({...request,reference:'linked.png'}),/outside/);}
 const handle=await fs.open(path.join(work,'large.png'),'w');await handle.truncate(6*1024*1024);await handle.close();await assert.rejects(readMarkdownAsset({...request,reference:'large.png'}),/5 MiB/);
});
