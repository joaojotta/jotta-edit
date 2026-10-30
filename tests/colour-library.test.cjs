'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const library = import('../src/colour-library.js');
function storage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {values, getItem:key => values.get(key) ?? null, setItem:(key,value) => values.set(key,value), removeItem:key => values.delete(key)};
}
test('legacy favourites survive migration and become named records when edited', async () => {
  const {createColourLibrary,colourKey} = await library;
  const data=storage({'jotta.colourFavourites':'["#FFC107","#112233","invalid","#ffc107"]'});
  const colours=createColourLibrary(data);
  assert.deepEqual(colours.favourites(),[{name:'',colour:'#ffc107',alpha:1},{name:'',colour:'#112233',alpha:1}]);
  colours.rename(colourKey(colours.favourites()[0]),'Brand yellow');
  assert.equal(createColourLibrary(data).favourites()[0].name,'Brand yellow');
  assert.equal(createColourLibrary(data).favourites()[1].colour,'#112233');
});
test('favourites preserve exact alpha, distinguish transparency and retain names on repeated saves', async () => {
  const {createColourLibrary,favouriteColour,colourKey} = await library;
  const colours=createColourLibrary(storage());
  const value={r:10,g:20,b:30,a:0.12345};
  colours.save(value,'Overlay'); colours.save({...value,a:0},'Transparent'); colours.save({...value,a:1},'Opaque');
  colours.save(value);
  assert.equal(colours.favourites().length,3);
  assert.equal(colours.favourites()[0].name,'Overlay');
  assert.deepEqual(favouriteColour(colours.favourites()[0]),{...value,kind:'hex',shortHex:false});
  assert.equal(favouriteColour(colours.favourites()[2]).a,0);
  colours.rename(colourKey(colours.favourites()[0]),'New overlay');
  colours.remove(colourKey(colours.favourites()[1]));
  assert.deepEqual(colours.favourites().map(entry=>entry.name),['New overlay','Transparent']);
});
test('favourite limits do not silently discard old colours and duplicates remain editable', async () => {
  const {createColourLibrary,MAX_COLOUR_FAVOURITES} = await library;
  const colours=createColourLibrary(storage());
  for(let i=0;i<MAX_COLOUR_FAVOURITES;i++) colours.save({r:i,g:0,b:0,a:1},'Colour '+i);
  assert.throws(()=>colours.save('#abcdef'),/limit reached/);
  colours.save('#000000','Renamed');
  assert.equal(colours.favourites().length,MAX_COLOUR_FAVOURITES);
  assert.equal(colours.favourites()[0].name,'Renamed');
  assert.throws(()=>colours.save('#ffffff','x'.repeat(65)),/Invalid/);
  assert.throws(()=>colours.rename('unused','x'.repeat(65)),/Invalid/);
});
test('recent colours are deduplicated with alpha, capped and independently clearable', async () => {
  const {createColourLibrary,MAX_RECENT_COLOURS} = await library;
  const colours=createColourLibrary(storage());
  colours.save('#ffc107','Keep');
  for(let i=0;i<15;i++) colours.remember({r:i,g:0,b:0,a:0.5});
  assert.equal(colours.recents().length,MAX_RECENT_COLOURS);
  colours.remember({r:14,g:0,b:0,a:0.5});
  assert.equal(colours.recents().length,MAX_RECENT_COLOURS);
  colours.remember({r:14,g:0,b:0,a:0});
  assert.equal(colours.recents()[0].alpha,0);
  assert.equal(colours.recents()[1].alpha,0.5);
  colours.clearRecents();
  assert.deepEqual(colours.recents(),[]);
  assert.equal(colours.favourites()[0].name,'Keep');
});
test('shared libraries notify only after successful writes and see each other’s updates', async () => {
  const {createColourLibrary} = await library;
  const data=storage(); let notifications=0;
  const first=createColourLibrary(data,()=>notifications++), second=createColourLibrary(data);
  first.save('#abcdef','Shared');
  assert.equal(second.favourites()[0].name,'Shared'); assert.equal(notifications,1);
  data.setItem=()=>{throw new Error('Storage unavailable');};
  assert.throws(()=>first.save('#123456'),/Storage/);
  assert.equal(second.favourites().length,1); assert.equal(notifications,1);
});
test('malformed persisted colours are bounded and unsafe names are stored as plain text', async () => {
  const {createColourLibrary,normalizeColourList,colourRecord} = await library;
  assert.deepEqual(createColourLibrary(storage({'jotta.colourFavourites':'{broken'})).favourites(),[]);
  assert.deepEqual(normalizeColourList([{colour:'#ffffff',alpha:-1},{colour:'url(evil)',name:'bad'},null]),[]);
  assert.equal(colourRecord('#0000','<img src=x onerror=alert(1)>').name,'<img src=x onerror=alert(1)>');
  assert.equal(colourRecord({r:Infinity,g:0,b:0,a:1}),null);
});
