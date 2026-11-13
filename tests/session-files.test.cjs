const {test} = require('node:test');
const assert = require('node:assert/strict');

test('session reads overlap with a four-file bound, preserve order and settle missing files', async () => {
  const {readSessionFiles} = await import('../src/session-files.js');
  const tabs = Array.from({length: 9}, (_, i) => ({path: String(i)}));
  tabs.splice(2, 0, null, {text: 'unsaved draft'});
  let active = 0, peak = 0;
  const results = [];
  for await (const result of readSessionFiles(tabs, async file => {
    peak = Math.max(peak, ++active);
    await new Promise(resolve => setTimeout(resolve, file === '0' ? 15 : 1));
    active--;
    if (file === '1') throw new Error('missing');
    return {content: file};
  })) results.push(result);
  assert.equal(peak, 4);
  assert.equal(active, 0);
  assert.deepEqual(results.map(result => result.item), tabs);
  assert.equal(results[0].disk.content, '0');
  assert.equal(results[1].error.message, 'missing');
  assert.equal(results[3].item.text, 'unsaved draft');
  assert.equal(results.at(-1).disk.content, '8');
});
