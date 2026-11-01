import {validateShortcutOverrides} from '../shared/keyboard-shortcuts.mjs';
import { readCustomThemes } from './custom-syntax-themes.js';
import { syntaxThemeChoices } from './syntax-themes.js';
import { readInterfaceColours } from './interface-theme.js';
import { explorerIconNames, explorerIconPaletteChoices } from './explorer-icon-palettes.js';
import { normalizeColourList, MAX_COLOUR_FAVOURITES, MAX_RECENT_COLOURS } from './colour-library.js';

export const SETTINGS_FILE_LIMIT = 256 * 1024;
const invalid = () => { throw new Error('Invalid settings file.'); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const choice = options => value => options.includes(value);
const number = (min, max, integer = false) => value => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value));
const boolean = value => typeof value === 'boolean';
const font = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 65 && !/["\\\x00-\x1f\x7f]/.test(value);
// Explicitly portable preferences: never enumerate storage, session data or servers.
const scalar = {
  theme:['dark',choice(['dark','light'])],
  syntaxTheme:['auto',value => typeof value === 'string' && (syntaxThemeChoices.some(({id}) => id === value) || /^custom-[a-z0-9-]{1,50}$/.test(value))],
  explorerIconPalette:['auto',choice(explorerIconPaletteChoices.map(({id}) => id))],
  languagePreference:['system',choice(['system','en','pt-PT'])],
  minimap:[true,boolean], wrap:[false,boolean], formatOnSave:[true,boolean], showHidden:[false,boolean], autoRefresh:[true,boolean],
  sidebar:[true,boolean], 'sidebar-width':[230,number(140,2000)],
  plainTextHighlights:['selection',choice(['selection','cursor','off'])],
  colorDisplayMode:['swatch',choice(['swatch','background'])],
  formatWidth:['none',choice(['none','80','100','120'])],
  fontsize:[14,number(10,72,true)], uiFontSize:[14,number(11,32,true)], explorerFontSize:[14,number(11,48,true)], markdownFontSize:[14,number(10,72,true)],
  fontFamily:['Monospace',font], uiFontFamily:['Rubik',font],
  lineHeightRatio:[1.55,choice([1.35,1.55,1.75])],
  indentMode:['spaces',choice(['spaces','tabs'])], tabSize:[2,choice([2,4,8])],
  previewBrowser:['default',choice(['default','firefox','chrome'])]
};
const complex = ['customThemes','interfaceColours','iconColours','colourFavourites','recentColours','keyboardShortcuts'];
function complexValue(key, value) {
  if(key==='keyboardShortcuts'){try{return validateShortcutOverrides(value);}catch{return invalid();}}
  if (key === 'colourFavourites' || key === 'recentColours') {
    const max = key === 'colourFavourites' ? MAX_COLOUR_FAVOURITES : MAX_RECENT_COLOURS;
    if (!Array.isArray(value) || value.length > max) return invalid();
    const normalized = normalizeColourList(value, max);
    if (normalized.length !== value.length) return invalid();
    return normalized;
  }
  if (!record(value)) return invalid();
  if (key === 'customThemes') {
    const normalized = readCustomThemes(value);
    if (Object.keys(normalized).length !== Object.keys(value).length) return invalid();
    return normalized;
  }
  if (key === 'interfaceColours') {
    const normalized = readInterfaceColours(value);
    for (const mode of Object.keys(value)) {
      if (!['light','dark'].includes(mode) || !record(value[mode]) ||
          Object.keys(value[mode]).some(field => !Object.hasOwn(normalized[mode], field))) return invalid();
    }
    return normalized;
  }
  const normalized = {};
  for (const [name, colour] of Object.entries(value)) {
    if (!explorerIconNames.includes(name) || typeof colour !== 'string' || !/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(colour)) return invalid();
    normalized[name] = colour.toLowerCase();
  }
  return normalized;
}
export function validateSettingsPreferences(value) {
  if (!record(value)) return invalid();
  const result = {};
  for (const [key, [, valid]] of Object.entries(scalar)) if (Object.hasOwn(value, key)) {
    if (!valid(value[key])) return invalid();
    result[key] = value[key];
  }
  for (const key of complex) if (Object.hasOwn(value, key)) result[key] = complexValue(key, value[key]);
  if (Object.hasOwn(value, 'nativeFrame')) {
    if (!boolean(value.nativeFrame)) return invalid();
    result.nativeFrame = value.nativeFrame;
  }
  if (!Object.keys(result).length) return invalid();
  return result;
}
export function exportSettings(storage, {nativeFrame} = {}) {
  const preferences = {};
  for (const [key, [fallback, valid]] of Object.entries(scalar)) {
    const raw = storage.getItem('jotta.' + key) ?? storage.getItem('slate.' + key);
    let value = raw;
    if (typeof fallback === 'boolean') value = raw === 'true' ? true : raw === 'false' ? false : null;
    else if (typeof fallback === 'number') value = raw === null ? null : Number(raw);
    preferences[key] = valid(value) ? value : fallback;
  }
  for (const key of complex) {
    let value;
    try { value = JSON.parse(storage.getItem('jotta.' + key) ?? storage.getItem('slate.' + key) ?? 'null'); } catch { value = null; }
    if(key==='keyboardShortcuts'){try{preferences[key]=validateShortcutOverrides(value||{});}catch{preferences[key]={};}}
    else if (key === 'customThemes') preferences[key] = readCustomThemes(value);
    else if (key === 'interfaceColours') preferences[key] = readInterfaceColours(value);
    else if (key === 'colourFavourites' || key === 'recentColours') preferences[key] = normalizeColourList(value, key === 'colourFavourites' ? MAX_COLOUR_FAVOURITES : MAX_RECENT_COLOURS);
    else preferences[key] = Object.fromEntries(Object.entries(record(value) ? value : {}).filter(([name, colour]) => explorerIconNames.includes(name) && typeof colour === 'string' && /^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(colour)));
  }
  if (typeof nativeFrame === 'boolean') preferences.nativeFrame = nativeFrame;
  return JSON.stringify({format:'jotta-edit-settings', version:1, preferences}, null, 2) + '\n';
}
export function parseSettingsImport(raw) {
  if (typeof raw !== 'string' || raw.length > SETTINGS_FILE_LIMIT) throw new Error('Settings file too large.');
  let value;
  try { value = JSON.parse(raw); } catch { return invalid(); }
  if (!record(value) || value.format !== 'jotta-edit-settings' || value.version !== 1) return invalid();
  return validateSettingsPreferences(value.preferences);
}
export function storeSettingsImport(storage, incoming) {
  const preferences = validateSettingsPreferences(incoming);
  const previous = new Map();
  const restore = () => {
    for (const [key, value] of [...previous].reverse()) value === null ? storage.removeItem(key) : storage.setItem(key, value);
  };
  try {
    for (const [key, value] of Object.entries(preferences)) {
      if (key === 'nativeFrame') continue; // Desktop window preferences use their existing IPC store.
      const name = 'jotta.' + key;
      previous.set(name, storage.getItem(name));
      storage.setItem(name, complex.includes(key) ? JSON.stringify(value) : String(value));
    }
  } catch (error) {
    restore(); throw error;
  }
  return restore;
}
