'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
async function load() {
  const src = readFileSync(resolve(__dirname, '../src/tag-matching.js'), 'utf8');
  return import('data:text/javascript,' + encodeURIComponent(src));
}
test('underline matching nested opening and closing tag NAMES only', async () => {
  const { matchingTagNames } = await load();
  const src = '<section><div><span>A</span></div></section>';
  const ranges = matchingTagNames(src, 11);
  assert.deepEqual(ranges.map(({start,end}) => src.slice(start,end)), ['div','div']);
  assert.deepEqual(ranges[0], {start: 10,end:13});
  assert.deepEqual(matchingTagNames(src, 18).map(x => src.slice(x.start,x.end)), ['span','span']);
});
test('handles void tags, quoted > signs, self-closing tags, comments and script raw text', async () => {
  const { matchingTagNames } = await load();
  const src = '<div title="a > b"><img/><script>const a = "<div>";</script><!-- <div> --><span>x</span></div>';
  assert.deepEqual(matchingTagNames(src,2).map(x => src.slice(x.start,x.end)), ['div','div']);
  assert.deepEqual(matchingTagNames(src,src.indexOf('<img')+2), []);
  assert.deepEqual(matchingTagNames(src,src.indexOf('<span')+2).map(x => src.slice(x.start,x.end)),['span','span']);
});
test('tag decorations do not apply to plain source or unpaired tags', async () => {
  const { matchingTagNames } = await load();
  assert.deepEqual(matchingTagNames('<p>abc',1), []);
  assert.deepEqual(matchingTagNames('<i>hello</i>',5), []);
  assert.deepEqual(matchingTagNames('<Item></Item>',2,{html:false}).map(x => '<Item></Item>'.slice(x.start,x.end)),['Item','Item']);
});
