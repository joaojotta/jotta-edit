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

function fakeMonaco() {
  return { editor: { TrackedRangeStickiness: { NeverGrowsWhenTypingAtEdges: 1 }, OverviewRulerLane: { Center: 2 } },
    Range: class {} };
}
function fakeBracketEditor({ language, path = '/a.txt', adjacent = null, enclosing = null, selections }) {
  const listeners = {}, on = name => fn => { listeners[name] = fn; };
  const collections = [];
  const model = { getLanguageId: () => language, uri: { path }, getVersionId: () => 1, getValue: () => '',
    getOffsetAt: () => 0, bracketPairs: { matchBracket: () => adjacent, findEnclosingBrackets: () => enclosing } };
  const pos = { lineNumber: 1, column: 1 };
  return { listeners, collections, focused: true, options: {},
    selections: selections || [{ isEmpty: () => true, getStartPosition: () => pos }],
    createDecorationsCollection() {
      const c = { items: [], set(v) { c.items = v; }, clear() { c.items = []; } };
      collections.push(c); return c;
    },
    updateOptions(v) { Object.assign(this.options, v); },
    getModel: () => model, getPosition: () => pos,
    getSelections() { return this.selections; }, hasWidgetFocus() { return this.focused; },
    onDidChangeCursorPosition: on('cursor'), onDidChangeModelContent: on('content'), onDidChangeModel: on('model'),
    onDidChangeModelLanguage: on('language'), onDidFocusEditorWidget: on('focus'), onDidBlurEditorWidget: on('blur') };
}
const settle = () => new Promise(resolve => setTimeout(resolve, 70));

test('adjacent brackets get the inline underline class and overview marker, without the native box', async () => {
  const { installTagUnderlining } = await load();
  const editor = fakeBracketEditor({ language: 'css', adjacent: ['open', 'close'] });
  installTagUnderlining(editor, fakeMonaco());
  await settle();
  assert.equal(editor.options.matchBrackets, 'never');
  const items = editor.collections[1].items;
  assert.deepEqual(items.map(x => x.range), ['open', 'close']);
  assert.ok(items.every(x => x.options.inlineClassName === 'jotta-matching-bracket' && !x.options.className));
  assert.ok(items.every(x => x.options.overviewRuler));
});
test('enclosing brackets are underlined without an overview marker', async () => {
  const { installTagUnderlining } = await load();
  const editor = fakeBracketEditor({ language: 'css', enclosing: ['open', 'close'] });
  installTagUnderlining(editor, fakeMonaco());
  await settle();
  const items = editor.collections[1].items;
  assert.equal(items.length, 2);
  assert.ok(items.every(x => !x.options.overviewRuler));
});
test('bracket underlines stay off in markup, on blur and for non-empty selections', async () => {
  const { installTagUnderlining } = await load();
  const markup = fakeBracketEditor({ language: 'html', adjacent: ['open', 'close'] });
  installTagUnderlining(markup, fakeMonaco());
  await settle();
  assert.deepEqual(markup.collections[1].items, []);

  const blurred = fakeBracketEditor({ language: 'css', adjacent: ['open', 'close'] });
  installTagUnderlining(blurred, fakeMonaco());
  await settle();
  assert.equal(blurred.collections[1].items.length, 2);
  blurred.focused = false;
  blurred.listeners.blur();
  await settle();
  assert.deepEqual(blurred.collections[1].items, []);

  const selected = fakeBracketEditor({ language: 'css', adjacent: ['open', 'close'],
    selections: [{ isEmpty: () => false, getStartPosition: () => ({}) }] });
  installTagUnderlining(selected, fakeMonaco());
  await settle();
  assert.deepEqual(selected.collections[1].items, []);
});
