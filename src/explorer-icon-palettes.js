/**
 * Explorer icon colours. Jotta Edit retains its own supplied SVG artwork;
 * these original colour assignments are inspired by well-known icon themes.
 * No third-party icon artwork or runtime dependency is included.
 *
 * Selection priority: user override > chosen Explorer palette > syntax-theme palette.
 * IDs are stable because user selections are persisted in localStorage.
 */
export const EXPLORER_ICON_PALETTE_DEFAULT = 'auto';

export const explorerIconPaletteChoices = Object.freeze([
  { id: 'auto', label: 'Follow code syntax theme' },
  { id: 'material', label: 'Material Icons-inspired' },
  { id: 'seti-dark', label: 'VS Code Seti-inspired (Dark)' },
  { id: 'seti-light', label: 'VS Code Seti-inspired (Light)' },
  { id: 'catppuccin-mocha', label: 'Catppuccin Mocha-inspired' },
  { id: 'catppuccin-latte', label: 'Catppuccin Latte-inspired' },
  { id: 'github-dark', label: 'GitHub Dark-inspired' },
  { id: 'github-light', label: 'GitHub Light-inspired' },
  { id: 'monokai-pro', label: 'Monokai Pro-inspired' },
  { id: 'monochrome', label: 'Monochrome (interface)' }
]);

const iconNames = [
  'folder.svg', 'file.svg', 'html5.svg', 'css3.svg', 'js.svg', 'json.svg',
  'php.svg', 'markdown.svg', 'txt.svg', 'fonts.svg', 'png.svg', 'jpeg.svg', 'gif.svg',
  'svg.svg', 'webp.svg', 'image.svg', 'audio.svg', 'video.svg', 'package.svg'
];
export const explorerIconNames = Object.freeze(iconNames);

// Each palette assigns readable, meaningful hues to every supported file type.
// The values are original adaptations, not a reproduction of another icon pack.
function palette(folder, file, html, css, js, json, php, text, fonts, image, svg, audio, video, archive) {
  return Object.freeze({
    'folder.svg': folder, 'file.svg': file, 'html5.svg': html,
    'css3.svg': css, 'js.svg': js, 'json.svg': json, 'php.svg': php,
    'markdown.svg': css, 'txt.svg': text, 'fonts.svg': fonts, 'png.svg': image,
    'jpeg.svg': image, 'gif.svg': image, 'svg.svg': svg,
    'webp.svg': image, 'image.svg': image, 'audio.svg': audio,
    'video.svg': video, 'package.svg': archive
  });
}

export const explorerIconPalettes = Object.freeze({
  'jotta-dark': palette('#FFC107','#ABB2C1','#E77B54','#58B8E8','#F0D45E','#E7B357','#B8A0DF','#A9AFB8','#BA8BDD','#7BC3A8','#EDAA67','#D6A1CE','#E194A2','#C6A776'),
  'jotta-light': palette('#B58100','#5C6473','#BA4E26','#166BA0','#9A7600','#9B621A','#7855A3','#68707C','#80549D','#24836C','#AD6527','#9D4E8F','#A34B66','#946E24'),
  material: palette('#FBC02D','#90A4AE','#EF6C00','#0288D1','#E3BC24','#F9A825','#7E57C2','#78909C','#AB47BC','#26A69A','#FF7043','#EC407A','#5C6BC0','#8D6E63'),
  'seti-dark': palette('#D5AF58','#B0BEC5','#E27E57','#5AADE6','#E8CA67','#D3B270','#A78BD4','#A9B3BD','#B896C9','#74B6A5','#D5A26D','#C78CB8','#92A8DD','#C7A67A'),
  'seti-light': palette('#A67A21','#637385','#C36231','#2676AE','#9A7800','#956A27','#7957AD','#657281','#8658AA','#2F877A','#B26635','#A34E8C','#516CA8','#94702E'),
  'catppuccin-mocha': palette('#F9E2AF','#A6ADC8','#FAB387','#89B4FA','#F9E2AF','#EBA0AC','#CBA6F7','#BAC2DE','#F5C2E7','#94E2D5','#FAB387','#F5C2E7','#B4BEFE','#EBA0AC'),
  'catppuccin-latte': palette('#B78727','#6C7086','#D85D21','#1E66F5','#A87909','#985A17','#8839EF','#6C6F85','#8839EF','#179299','#CA5D1D','#EA5C9A','#5264BB','#98621F'),
  'github-dark': palette('#D0A86A','#8B949E','#FF7B72','#79C0FF','#E3B341','#A5D6FF','#BC8CFF','#8B949E','#D2A8FF','#7EE787','#FFA657','#D2A8FF','#79C0FF','#CCA569'),
  'github-light': palette('#A67B28','#57606A','#CF222E','#0969DA','#9A6900','#0550AE','#8250DF','#57606A','#8250DF','#1A7F37','#BC4C00','#BF3989','#0550AE','#986525'),
  'monokai-pro': palette('#FFD866','#A9A9A4','#FF6188','#78DCE8','#FFD866','#AB9DF2','#AB9DF2','#BAB8B4','#FC9867','#A9DC76','#FC9867','#FF6188','#78DCE8','#E8B665'),
  'mariana': palette('#FAC863','#ABB9C4','#F99179','#79B8DD','#E6C46E','#C695C6','#C695C6','#B0BBC5','#C695C6','#5FB3B3','#F99179','#C695C6','#7BAED4','#BAA071'),
  'one-dark': palette('#E5C07B','#ABB2BF','#E06C75','#61AFEF','#E5C07B','#D19A66','#C678DD','#ABB2BF','#C678DD','#56B6C2','#D19A66','#C678DD','#61AFEF','#BE995C'),
  dracula: palette('#F1FA8C','#B8B9C7','#FF79C6','#8BE9FD','#F1FA8C','#BD93F9','#BD93F9','#B8B9C7','#FF79C6','#50FA7B','#FFB86C','#FF79C6','#8BE9FD','#D9AC82'),
  nord: palette('#EBCB8B','#D8DEE9','#D08770','#81A1C1','#EBCB8B','#B48EAD','#B48EAD','#A7B4C4','#B48EAD','#8FBCBB','#D08770','#B48EAD','#88C0D0','#C0A478'),
  'tokyo-night': palette('#E0AF68','#A9B1D6','#F7768E','#7AA2F7','#E0AF68','#BB9AF7','#BB9AF7','#A9B1D6','#BB9AF7','#73DACA','#FF9E64','#BB9AF7','#7AA2F7','#C8A565'),
  'solarized-light': palette('#9B751C','#657B83','#CB4B16','#268BD2','#9A7900','#B58900','#6C71C4','#657B83','#6C71C4','#2E837A','#CB4B16','#B4517B','#268BD2','#947228')
});

const bySyntaxTheme = Object.freeze({
  'jotta-dark': 'jotta-dark', 'jotta-light': 'jotta-light',
  'vscode-dark-plus': 'seti-dark', 'vscode-light-plus': 'seti-light',
  'monokai': 'monokai-pro', 'sublime-monokai': 'monokai-pro', 'monokai-pro': 'monokai-pro',
  'catppuccin-mocha': 'catppuccin-mocha',
  'sublime-mariana': 'mariana', 'mariana-pro-cool': 'mariana',
  'mariana-pro-gray': 'mariana', 'mariana-pro-warm': 'mariana',
  'github-dark': 'github-dark',
  'github-light': 'github-light',
  'sublime-celeste': 'seti-light', 'sublime-breakers': 'seti-light',
  'one-dark': 'one-dark', dracula: 'dracula', nord: 'nord',
  'tokyo-night': 'tokyo-night', 'solarized-light': 'solarized-light'
});

export function normalizeExplorerIconPalette(value) {
  return explorerIconPaletteChoices.some(({id}) => id === value) ? value : EXPLORER_ICON_PALETTE_DEFAULT;
}

export function resolveExplorerIconPalette(selectedPalette, resolvedSyntaxTheme, interfaceMode) {
  const selected = normalizeExplorerIconPalette(selectedPalette);
  if (selected !== 'auto') return selected;
  return bySyntaxTheme[resolvedSyntaxTheme] || (interfaceMode === 'light' ? 'jotta-light' : 'jotta-dark');
}

// Keep small SVGs discernible when the syntax theme and UI use opposite modes.
// This adjusts automatic icon colours only; manually chosen HEX values stay exact.
function luminance(hex) {
  const channels = [1, 3, 5].map(i => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
export function iconContrast(colour, mode) {
  const canvas = mode === 'light' ? '#F6F6F7' : '#242529';
  const a = luminance(colour), b = luminance(canvas);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
export function makeIconColourLegible(colour, mode) {
  const target = 3.05;
  if (iconContrast(colour, mode) >= target) return colour;
  const goal = mode === 'light' ? 0 : 255;
  const channels = [1, 3, 5].map(i => parseInt(colour.slice(i, i + 2), 16));
  let low = 0, high = 1;
  for (let i = 0; i < 14; i++) {
    const mid = (low + high) / 2;
    const changed = '#' + channels.map(c => Math.round(c * (1 - mid) + goal * mid).toString(16).padStart(2, '0')).join('');
    if (iconContrast(changed, mode) >= target) high = mid;
    else low = mid;
  }
  return '#' + channels.map(c => Math.round(c * (1 - high) + goal * high).toString(16).padStart(2, '0')).join('');
}

export function explorerIconColour(fileName, overrides = {}, selection = 'auto', resolvedSyntaxTheme = 'jotta-dark', interfaceMode = 'dark') {
  const name = String(fileName).split('/').pop();
  if (!iconNames.includes(name)) return null;
  if (Object.hasOwn(overrides, name) && /^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(overrides[name])) return overrides[name];
  const resolved = resolveExplorerIconPalette(selection, resolvedSyntaxTheme, interfaceMode);
  if (resolved === 'monochrome') return interfaceMode === 'light' ? '#4A5564' : '#C4CAD4';
  const base = explorerIconPalettes[resolved]?.[name] ?? explorerIconPalettes['jotta-dark'][name];
  return makeIconColourLegible(base, interfaceMode);
}
