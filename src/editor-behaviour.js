// Plain Text word highlighting and Prettier column-width preferences.
// A very high printWidth is the closest Prettier supports to "unlimited";
// unlike display word wrap, it is an advisory formatting width.
export const formatterWidths = Object.freeze(['none', '80', '100', '120']);
export const plainTextHighlightModes = Object.freeze(['selection', 'cursor', 'off']);

export function normalizeFormatterWidth(value) {
  return formatterWidths.includes(String(value)) ? String(value) : 'none';
}
export function prettierPrintWidth(value) {
  const width = normalizeFormatterWidth(value);
  return width === 'none' ? 10000 : Number(width);
}
export function normalizePlainTextHighlight(value) {
  return plainTextHighlightModes.includes(value) ? value : 'selection';
}
export function plainTextHighlightOptions(language, setting) {
  if (language !== 'plaintext') return { occurrencesHighlight: 'singleFile', selectionHighlight: true };
  const mode = normalizePlainTextHighlight(setting);
  return {
    occurrencesHighlight: mode === 'cursor' ? 'singleFile' : 'off',
    selectionHighlight: mode !== 'off'
  };
}
