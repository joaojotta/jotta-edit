import { parseCssColor, formatCssColor } from './color-utils.js';

export const COLOUR_FAVOURITES_KEY = 'jotta.colourFavourites';
export const RECENT_COLOURS_KEY = 'jotta.recentColours';
export const MAX_COLOUR_FAVOURITES = 30;
export const MAX_RECENT_COLOURS = 12;
export const COLOUR_NAME_LIMIT = 64;

// Keep alpha as a number rather than reducing it to an eight-bit HEX channel.
export function colourRecord(value, name = '') {
  const parsed = typeof value === 'string' ? parseCssColor(value) : value;
  if (!parsed || !['r','g','b'].every(key => Number.isInteger(parsed[key]) && parsed[key] >= 0 && parsed[key] <= 255) ||
      !Number.isFinite(parsed.a) || parsed.a < 0 || parsed.a > 1 || typeof name !== 'string' || name.trim().length > COLOUR_NAME_LIMIT) return null;
  return {name:name.trim(), colour:formatCssColor({...parsed, a:1}, 'hex'), alpha:parsed.a};
}
export function favouriteColour(entry) {
  return {...parseCssColor(entry.colour), a:entry.alpha};
}
export function colourKey(entry) { return `${entry.colour}/${entry.alpha}`; }
export function normalizeColourList(value, limit = MAX_COLOUR_FAVOURITES) {
  if (!Array.isArray(value)) return [];
  const result = [], seen = new Set();
  for (const item of value) {
    let record;
    if (typeof item === 'string') record = colourRecord(item);
    else if (item && typeof item === 'object' && !Array.isArray(item)) {
      const parsed = parseCssColor(item.colour);
      if (parsed) record = colourRecord({...parsed, a:Object.hasOwn(item, 'alpha') ? item.alpha : parsed.a}, item.name ?? '');
    }
    if (!record || seen.has(colourKey(record))) continue;
    seen.add(colourKey(record)); result.push(record);
    if (result.length >= limit) break;
  }
  return result;
}
export function createColourLibrary(storage, changed = () => {}) {
  const read = (key, limit) => {
    try { return normalizeColourList(JSON.parse(storage.getItem(key) || '[]'), limit); }
    catch { return []; }
  };
  const write = (key, values) => { storage.setItem(key, JSON.stringify(values)); changed(); };
  return {
    favourites:() => read(COLOUR_FAVOURITES_KEY, MAX_COLOUR_FAVOURITES),
    recents:() => read(RECENT_COLOURS_KEY, MAX_RECENT_COLOURS),
    save(value, name = '') {
      const entry = colourRecord(value, name);
      if (!entry) throw new Error('Invalid favourite colour.');
      const previous = this.favourites(), key = colourKey(entry);
      const existing = previous.find(item => colourKey(item) === key);
      if (!existing && previous.length >= MAX_COLOUR_FAVOURITES) throw new Error('Colour favourites limit reached. Remove a colour first.');
      if (!entry.name && existing) entry.name = existing.name;
      write(COLOUR_FAVOURITES_KEY, [entry, ...previous.filter(item => colourKey(item) !== key)]);
    },
    rename(key, name) {
      if (typeof name !== 'string' || name.trim().length > COLOUR_NAME_LIMIT) throw new Error('Invalid colour name.');
      write(COLOUR_FAVOURITES_KEY, this.favourites().map(item => colourKey(item) === key ? {...item, name:name.trim()} : item));
    },
    remove(key) { write(COLOUR_FAVOURITES_KEY, this.favourites().filter(item => colourKey(item) !== key)); },
    remember(value) {
      const entry = colourRecord(value);
      if (!entry) return;
      write(RECENT_COLOURS_KEY, [entry, ...this.recents().filter(item => colourKey(item) !== colourKey(entry))].slice(0, MAX_RECENT_COLOURS));
    },
    clearRecents() { write(RECENT_COLOURS_KEY, []); }
  };
}
