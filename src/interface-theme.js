/** User interface colour overrides, independently stored for dark and light modes. */
import { blendHex } from './syntax-themes.js';
import { parseCssColor, colorTextContrast } from './color-utils.js';

export const interfaceColourFields = Object.freeze([
  ['bg','Workspace background'], ['surface','Panels and dialogs'],
  ['surface-alt','Input background'], ['sidebar','Explorer background'],
  ['title','Title bar'], ['ink','Primary text'], ['muted','Secondary text'],
  ['line','Borders'], ['accent','Accent'], ['accent-text','Accent text']
]);
const keys = new Set(interfaceColourFields.map(([key])=>key));
const valid = /^#[0-9a-f]{6}$/i;
export function readInterfaceColours(value) {
  let data;
  try { data = typeof value === 'string' ? JSON.parse(value) : value; }
  catch { return {dark:{}, light:{}}; }
  const result = {dark:{},light:{}};
  if (!data || typeof data !== 'object' || Array.isArray(data)) return result;
  for (const mode of ['dark','light']) {
    const record = data[mode];
    if (!record || typeof record !== 'object' || Array.isArray(record)) continue;
    for (const [key, colour] of Object.entries(record)) {
      if (keys.has(key) && typeof colour === 'string' && valid.test(colour)) result[mode][key] = colour.toLowerCase();
    }
  }
  return result;
}
export function setInterfaceColour(collection, mode, key, colour) {
  if (!['dark','light'].includes(mode) || !keys.has(key) || !valid.test(colour)) return false;
  collection[mode][key] = colour.toLowerCase();
  return true;
}
export function applyInterfaceColours(element, value, mode) {
  for (const [key] of interfaceColourFields) {
    const colour = value[mode]?.[key];
    if (colour) element.style.setProperty(`--${key}`, colour);
    else element.style.removeProperty(`--${key}`);
  }
}

// Syntax palettes only define background/foreground/widget/border/accent;
// the rest of the interface fields are reasonable blends of those, so
// picking a syntax theme makes the whole window feel themed, not just the
// code pane. `inheritSyntax` themes (the default "Jotta" pair) return no
// derived colours at all, preserving today's look for anyone who hasn't
// picked a distinct theme.
export function deriveInterfaceColoursFromPalette(palette) {
  if (!palette || palette.inheritSyntax) return {};
  const light = palette.mode === 'light';
  const accentRgb = parseCssColor(palette.accent);
  return {
    bg: palette.background,
    surface: palette.widget,
    'surface-alt': blendHex(palette.widget, palette.background, 0.5),
    sidebar: blendHex(palette.background, palette.widget, 0.35),
    title: palette.widget,
    ink: palette.foreground,
    muted: blendHex(palette.foreground, palette.background, light ? 0.45 : 0.4),
    line: palette.border,
    accent: palette.accent,
    'accent-text': accentRgb ? colorTextContrast({ ...accentRgb, a: 1 }) : palette.foreground
  };
}
