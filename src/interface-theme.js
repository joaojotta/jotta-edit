/** User interface colour overrides, independently stored for dark and light modes. */
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
