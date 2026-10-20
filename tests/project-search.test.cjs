'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const search = () => import('../src/project-search.js');

test('literal search escapes metacharacters and preserves source offsets and CRLF', async () => {
  const {findProjectMatches, replaceProjectMatches} = await search();
  const text = 'A.b a.b\r\na.b';
  const matches = findProjectMatches(text, 'a.b');
  assert.deepEqual(matches.map(({line,column}) => ({line,column})), [{line:1,column:1},{line:1,column:5},{line:2,column:1}]);
  assert.equal(replaceProjectMatches(text, matches, '$&\\name'), '$&\\name $&\\name\r\n$&\\name');
  assert.equal(findProjectMatches(text, 'a.b', {matchCase:true}).length, 2);
  assert.equal(findProjectMatches('abc', '').length, 0);
});
test('whole-word search handles Unicode letters, digits and underscores', async () => {
  const {findProjectMatches} = await search();
  assert.equal(findProjectMatches('cat scatter cat_ cat2 écat caté (cat)', 'cat', {wholeWord:true}).length, 2);
  assert.equal(findProjectMatches('Olá olá OLÁ', 'olá', {wholeWord:true}).length, 3);
});
test('search uses unsaved buffers, skips binary/unreadable files and respects project boundaries', async () => {
  const {searchProjectFiles} = await search();
  const read = [];
  const result = await searchProjectFiles({root:'/project', paths:['/project/a.css','/project/b.svg','/project/a.css','/project/image.png','/project/binary.dat','/project/missing','/project/../outside'],
    buffers:new Map([['/project/a.css','unsaved target']]), query:'target',
    readFile:async path => { read.push(path); if (path.endsWith('missing')) throw new Error('missing'); return {content:path.endsWith('.dat')?'\0target':'<svg>target</svg>'}; }});
  assert.deepEqual(result.results.map(file => file.path), ['/project/a.css','/project/b.svg']);
  assert.equal(result.results[0].text, 'unsaved target');
  assert.equal(result.skipped, 2);
  assert.ok(!read.includes('/project/a.css') && !read.includes('/project/image.png'));
});
test('replacement plans only include selected files and support deletion without changing line endings', async () => {
  const {findProjectMatches,replacementPlans} = await search();
  const results = ['a','b'].map(name => ({path:'/project/'+name,text:'x target\r\ntarget',matches:findProjectMatches('x target\r\ntarget','target')}));
  assert.deepEqual(replacementPlans(results,new Set(['/project/b']),''), [{path:'/project/b',before:'x target\r\ntarget',after:'x \r\n'}]);
  assert.deepEqual(replacementPlans(results,new Set(['/project/a']),'target'), []);
  assert.throws(() => replacementPlans(results,new Set(['/project/a']),'x'.repeat(3 * 1024 * 1024)), /5 MB/);
});
test('cancelled searches discard their results and excessive matches are never partially replaced', async () => {
  const {searchProjectFiles} = await search();
  const cancelled = await searchProjectFiles({root:'/p',paths:['/p/file'],query:'x',readFile:async()=>({content:'x'}),cancelled:()=>true});
  assert.equal(cancelled,null);
  const capped = await searchProjectFiles({root:'/p',paths:['/p/file'],query:'x',readFile:async()=>({content:'x'.repeat(5001)})});
  assert.deepEqual(capped.results,[]); assert.equal(capped.limited,true); assert.equal(capped.skipped,1);
});
