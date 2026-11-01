/** Persistent user-designed Monaco themes. No built-in palette is mutable. */
import { syntaxPalettes } from './syntax-themes.js';

export const CUSTOM_THEME_LIMIT = 24;
export const CUSTOM_THEME_FIELDS = Object.freeze([
  ['background', 'Editor background'], ['foreground', 'Editor text'],
  ['widget', 'Popup background'], ['border', 'Popup border'], ['accent', 'Selection and cursor'],
  ['keyword', 'Keywords'], ['string', 'Strings'], ['number', 'Numbers'],
  ['comment', 'Comments'], ['function', 'Functions'], ['type', 'Types'],
  ['variable', 'Variables'], ['tag', 'HTML tags'], ['attribute', 'Attributes'],
  ['operator', 'Operators']
]);
const keys = CUSTOM_THEME_FIELDS.map(([key]) => key);
const hex = /^#[0-9a-f]{6}$/i;
const customId = /^custom-[a-z0-9-]{1,50}$/;

function normalisePalette(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.mode !== 'dark' && value.mode !== 'light') return null;
  const palette = {mode:value.mode};
  for (const key of keys) {
    if (typeof value[key] !== 'string' || !hex.test(value[key])) return null;
    palette[key] = value[key].toLowerCase();
  }
  // Built-in Jotta themes inherit Monaco rules. Custom themes are editable,
  // therefore always compile explicit token rules instead.
  return palette;
}
export function validateCustomTheme(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 64) return null;
  const base = typeof value.base === 'string' && Object.hasOwn(syntaxPalettes, value.base)
    ? value.base : 'jotta-dark';
  const palette = normalisePalette(value.palette);
  return palette ? {name:value.name.trim(), base, palette} : null;
}
export function readCustomThemes(raw) {
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    const result = {};
    for (const [id, value] of Object.entries(data)) {
      if (Object.keys(result).length >= CUSTOM_THEME_LIMIT) break;
      if (!customId.test(id) || Object.hasOwn(syntaxPalettes, id)) continue;
      const checked = validateCustomTheme(value);
      if (checked) result[id] = checked;
    }
    return result;
  } catch { return {}; }
}
export function createCustomTheme(themes, source, name = 'My theme') {
  if (Object.keys(themes).length >= CUSTOM_THEME_LIMIT) return null;
  const existing = themes[source];
  const base = existing?.base || (syntaxPalettes[source] ? source : 'jotta-dark');
  const original = existing?.palette || syntaxPalettes[base];
  let number = 1;
  while (Object.hasOwn(themes, `custom-${number}`)) number++;
  const id = `custom-${number}`;
  return {id, theme: {name:name.slice(0,64), base, palette:normalisePalette({...original, inheritSyntax:false})}};
}
export function exportCustomTheme(theme) {
  const validated = validateCustomTheme(theme);
  if (!validated) throw new Error('Invalid theme');
  return JSON.stringify({format:'jotta-edit-syntax-theme', version:1, ...validated}, null, 2) + '\n';
}
export function importCustomTheme(raw) {
  if (typeof raw !== 'string' || raw.length > 25000) throw new Error('Theme file too large');
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error('Invalid JSON'); }
  if (!value || value.format !== 'jotta-edit-syntax-theme' || value.version !== 1) throw new Error('Not a Jotta Edit theme');
  const valid = validateCustomTheme(value);
  if (!valid) throw new Error('Invalid theme colours or name');
  return valid;
}
