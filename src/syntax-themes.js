/**
 * Jotta Edit editor syntax themes.
 * Inspired by familiar editor colour schemes; these are original, locally
 * defined Monaco palettes rather than third-party theme packages.
 * No UI colours outside Monaco are changed by this module.
 */

export const SYNTAX_THEME_DEFAULT = 'auto';

// Keep ids stable: the selected id is stored in localStorage.
export const syntaxThemeChoices = Object.freeze([
  { id: 'auto', label: 'Follow interface (Jotta)' },
  { id: 'jotta-dark', label: 'Jotta Dark', mode: 'dark' },
  { id: 'jotta-light', label: 'Jotta Light', mode: 'light' },
  { id: 'monokai', label: 'Monokai-inspired', mode: 'dark' },
  { id: 'one-dark', label: 'One Dark-inspired', mode: 'dark' },
  { id: 'dracula', label: 'Dracula-inspired', mode: 'dark' },
  { id: 'nord', label: 'Nord-inspired', mode: 'dark' },
  { id: 'tokyo-night', label: 'Tokyo Night-inspired', mode: 'dark' },
  { id: 'catppuccin-mocha', label: 'Catppuccin Mocha-inspired', mode: 'dark' },
  { id: 'github-light', label: 'GitHub Light (Default)', mode: 'light' },
  { id: 'solarized-light', label: 'Solarized Light-inspired', mode: 'light' },
  { id: 'sublime-mariana', label: 'Sublime Text — Mariana Dark', mode: 'dark' },
  { id: 'sublime-monokai', label: 'Sublime Text — Monokai Dark', mode: 'dark' },
  { id: 'sublime-celeste', label: 'Sublime Text — Celeste Light', mode: 'light' },
  { id: 'sublime-breakers', label: 'Sublime Text — Breakers Light', mode: 'light' },
  { id: 'vscode-dark-plus', label: 'VS Code — Dark+', mode: 'dark' },
  { id: 'vscode-light-plus', label: 'VS Code — Light+', mode: 'light' },
  { id: 'github-dark', label: 'GitHub Dark (Default)', mode: 'dark' },
  { id: 'monokai-pro', label: 'Monokai Pro (Classic)', mode: 'dark' },
  { id: 'mariana-pro-cool', label: 'Mariana Pro (Cool)', mode: 'dark' },
  { id: 'mariana-pro-gray', label: 'Mariana Pro (Gray)', mode: 'dark' },
  { id: 'mariana-pro-warm', label: 'Mariana Pro (Warm)', mode: 'dark' }
]);

// Field names in each palette match Monaco's main token categories.
export const syntaxPalettes = Object.freeze({
  'jotta-dark': {
    mode: 'dark', inheritSyntax: true, background: '#1f2023', foreground: '#d8d8df', widget: '#242529', border: '#35363b',
    keyword: '#569cd6', string: '#ce9178', number: '#b5cea8', comment: '#6a9955',
    function: '#dcdcaa', type: '#4ec9b0', variable: '#9cdcfe', tag: '#569cd6',
    attribute: '#9cdcfe', operator: '#d8d8df', accent: '#ffc107'
  },
  'jotta-light': {
    mode: 'light', inheritSyntax: true, background: '#ffffff', foreground: '#27282d', widget: '#f5f5f6', border: '#e1e2e5',
    keyword: '#0000ff', string: '#a31515', number: '#098658', comment: '#008000',
    function: '#795e26', type: '#267f99', variable: '#001080', tag: '#800000',
    attribute: '#a31515', operator: '#27282d', accent: '#9a6200'
  },
  monokai: {
    mode: 'dark', background: '#272822', foreground: '#f8f8f2', widget: '#34352c', border: '#494a40',
    keyword: '#ff4680', string: '#e6db74', number: '#ae81ff', comment: '#a5a192',
    function: '#a6e22e', type: '#66d9ef', variable: '#f8f8f2', tag: '#ff4680',
    attribute: '#a6e22e', operator: '#ff4680', accent: '#a6e22e'
  },
  'one-dark': {
    mode: 'dark', background: '#282c34', foreground: '#abb2bf', widget: '#303641', border: '#3e4451',
    keyword: '#c678dd', string: '#98c379', number: '#d19a66', comment: '#9198a3',
    function: '#61afef', type: '#e5c07b', variable: '#e7767d', tag: '#e7767d',
    attribute: '#d19a66', operator: '#56b6c2', accent: '#61afef'
  },
  dracula: {
    mode: 'dark', background: '#282a36', foreground: '#f8f8f2', widget: '#343746', border: '#44475a',
    keyword: '#ff79c6', string: '#f1fa8c', number: '#bd93f9', comment: '#9298ad',
    function: '#50fa7b', type: '#8be9fd', variable: '#f8f8f2', tag: '#ff79c6',
    attribute: '#50fa7b', operator: '#ff79c6', accent: '#bd93f9'
  },
  nord: {
    mode: 'dark', background: '#2e3440', foreground: '#d8dee9', widget: '#3b4252', border: '#4c566a',
    keyword: '#81a1c1', string: '#a3be8c', number: '#b990bc', comment: '#939fab',
    function: '#88c0d0', type: '#8fbcbb', variable: '#d8dee9', tag: '#81a1c1',
    attribute: '#8fbcbb', operator: '#81a1c1', accent: '#88c0d0'
  },
  'tokyo-night': {
    mode: 'dark', background: '#1a1b26', foreground: '#c0caf5', widget: '#24283b', border: '#414868',
    keyword: '#bb9af7', string: '#9ece6a', number: '#ff9e64', comment: '#7f8dab',
    function: '#7aa2f7', type: '#2ac3de', variable: '#c0caf5', tag: '#f7768e',
    attribute: '#e0af68', operator: '#89ddff', accent: '#7aa2f7'
  },
  'catppuccin-mocha': {
    mode: 'dark', background: '#1e1e2e', foreground: '#cdd6f4', widget: '#313244', border: '#45475a',
    keyword: '#cba6f7', string: '#a6e3a1', number: '#fab387', comment: '#9399b2',
    function: '#89b4fa', type: '#f9e2af', variable: '#cdd6f4', tag: '#f38ba8',
    attribute: '#f9e2af', operator: '#89dceb', accent: '#b4befe'
  },
  'github-light': {
    mode: 'light', background: '#ffffff', foreground: '#24292f', widget: '#f6f8fa', border: '#d0d7de',
    keyword: '#cf222e', string: '#0a3069', number: '#0550ae', comment: '#66727e',
    function: '#8250df', type: '#953800', variable: '#24292f', tag: '#116329',
    attribute: '#8250df', operator: '#cf222e', accent: '#0969da'
  },
  'sublime-mariana': {
    mode: 'dark', background: '#303841', foreground: '#d8dee9', widget: '#38434d', border: '#46515d',
    keyword: '#c695c6', string: '#99c794', number: '#f99157', comment: '#9faab4',
    function: '#8bb8e1', type: '#5fb3b3', variable: '#d8dee9', tag: '#ff858b',
    attribute: '#fac863', operator: '#c695c6', accent: '#6699cc'
  },
  'sublime-monokai': {
    mode: 'dark', background: '#272822', foreground: '#f8f8f2', widget: '#34352c', border: '#494a40',
    keyword: '#ff5993', string: '#e6db74', number: '#ae81ff', comment: '#a5a192',
    function: '#a6e22e', type: '#66d9ef', variable: '#f8f8f2', tag: '#ff5993',
    attribute: '#a6e22e', operator: '#ff5993', accent: '#a6e22e'
  },
  'sublime-celeste': {
    mode: 'light', background: '#ffffff', foreground: '#202020', widget: '#f6f6f6', border: '#d7d7d7',
    keyword: '#a3316f', string: '#9a4515', number: '#7351a1', comment: '#636b70',
    function: '#166fa0', type: '#087c70', variable: '#313131', tag: '#aa3a4f',
    attribute: '#785100', operator: '#95531c', accent: '#087c70'
  },
  'sublime-breakers': {
    mode: 'light', background: '#fcfdfd', foreground: '#333333', widget: '#f2f4f5', border: '#d5d9dc',
    keyword: '#9e2853', string: '#895011', number: '#7653a1', comment: '#677178',
    function: '#24689c', type: '#28736e', variable: '#333333', tag: '#a03340',
    attribute: '#925615', operator: '#8a3655', accent: '#24689c'
  },
  'vscode-dark-plus': {
    mode: 'dark', background: '#1e1e1e', foreground: '#d4d4d4', widget: '#252526', border: '#454545',
    keyword: '#569cd6', string: '#ce9178', number: '#b5cea8', comment: '#6a9955',
    function: '#dcdcaa', type: '#4ec9b0', variable: '#9cdcfe', tag: '#569cd6',
    attribute: '#9cdcfe', operator: '#d4d4d4', accent: '#007acc'
  },
  'vscode-light-plus': {
    mode: 'light', background: '#ffffff', foreground: '#000000', widget: '#f3f3f3', border: '#d4d4d4',
    keyword: '#0000ff', string: '#a31515', number: '#098658', comment: '#008000',
    function: '#795e26', type: '#267f99', variable: '#001080', tag: '#800000',
    attribute: '#a31515', operator: '#111111', accent: '#007acc'
  },
  'github-dark': {
    mode: 'dark', background: '#0d1117', foreground: '#e6edf3', widget: '#161b22', border: '#30363d',
    keyword: '#ff7b72', string: '#a5d6ff', number: '#79c0ff', comment: '#9198a1',
    function: '#d2a8ff', type: '#ffa657', variable: '#e6edf3', tag: '#7ee787',
    attribute: '#d2a8ff', operator: '#ff7b72', accent: '#58a6ff'
  },
  'monokai-pro': {
    mode: 'dark', background: '#2d2a2e', foreground: '#fcfcfa', widget: '#403e41', border: '#555057',
    keyword: '#ff6188', string: '#ffd866', number: '#ab9df2', comment: '#a49fa6',
    function: '#a9dc76', type: '#78dce8', variable: '#fcfcfa', tag: '#ff6188',
    attribute: '#a9dc76', operator: '#ff6188', accent: '#ffd866'
  },
  'mariana-pro-cool': {
    mode: 'dark', background: '#263238', foreground: '#e0e6ec', widget: '#303d46', border: '#455762',
    keyword: '#c695c6', string: '#99c794', number: '#f99157', comment: '#a2b1bb',
    function: '#7baed4', type: '#5fb3b3', variable: '#e0e6ec', tag: '#ff858b',
    attribute: '#fac863', operator: '#c695c6', accent: '#7baed4'
  },
  'mariana-pro-gray': {
    mode: 'dark', background: '#34343b', foreground: '#e1dfe6', widget: '#3e3e47', border: '#53535d',
    keyword: '#c99bcc', string: '#a9cc9a', number: '#f2a372', comment: '#a9a8b2',
    function: '#91b3d8', type: '#88c3c3', variable: '#e1dfe6', tag: '#ee858a',
    attribute: '#e6c48a', operator: '#c99bcc', accent: '#91b3d8'
  },
  'mariana-pro-warm': {
    mode: 'dark', background: '#38312f', foreground: '#e9e2dd', widget: '#443b38', border: '#5b514c',
    keyword: '#d8a4c5', string: '#b4cd91', number: '#f9b17e', comment: '#b9aaa4',
    function: '#a1beda', type: '#8ccbc1', variable: '#e9e2dd', tag: '#f18c88',
    attribute: '#f5cd8a', operator: '#d8a4c5', accent: '#f9b17e'
  },
  'solarized-light': {
    mode: 'light', background: '#fdf6e3', foreground: '#586e75', widget: '#eee8d5', border: '#d7d0bc',
    keyword: '#647600', string: '#086d68', number: '#b73172', comment: '#5a6d73',
    function: '#145d9a', type: '#936500', variable: '#586e75', tag: '#145d9a',
    attribute: '#936500', operator: '#a83e0f', accent: '#145d9a'
  }
});

let userPalettes = Object.create(null);
export function setCustomSyntaxPalettes(themes) {
  const next = Object.create(null);
  for (const [id, theme] of Object.entries(themes || {})) {
    if (/^custom-[a-z0-9-]{1,50}$/.test(id) && theme?.palette) next[id] = theme.palette;
  }
  userPalettes = next;
}
export function syntaxPaletteFor(id) {
  return syntaxPalettes[id] || userPalettes[id] || null;
}
export function registerCustomSyntaxThemes(monaco) {
  for (const [id, palette] of Object.entries(userPalettes)) monaco.editor.defineTheme(id, createMonacoTheme(palette));
}
export function normalizeSyntaxTheme(value) {
  return syntaxThemeChoices.some(({id}) => id === value) || Object.hasOwn(userPalettes, value) ? value : SYNTAX_THEME_DEFAULT;
}

export function resolveSyntaxTheme(value, interfaceMode) {
  const selected = normalizeSyntaxTheme(value);
  return selected === 'auto' ? (interfaceMode === 'light' ? 'jotta-light' : 'jotta-dark') : selected;
}

function themeRules(palette) {
  const names = [
    ['comment', 'comment'], ['comment.doc', 'comment'],
    ['keyword', 'keyword'], ['keyword.control', 'keyword'], ['storage', 'keyword'],
    ['string', 'string'], ['string.escape', 'number'], ['regexp', 'string'],
    ['number', 'number'], ['number.hex', 'number'], ['constant.numeric', 'number'],
    ['constant.language', 'number'], ['constant.boolean', 'number'],
    ['type', 'type'], ['type.identifier', 'type'], ['entity.name.type', 'type'],
    ['function', 'function'], ['function.call', 'function'], ['entity.name.function', 'function'],
    ['variable', 'variable'], ['variable.parameter', 'variable'],
    ['tag', 'tag'], ['tag.html', 'tag'], ['metatag', 'tag'],
    ['attribute.name', 'attribute'], ['attribute.value', 'string'],
    ['operator', 'operator'], ['keyword.operator', 'operator'],
    ['delimiter', 'foreground']
  ];
  return names.map(([token, colour]) => ({ token, foreground: palette[colour].slice(1) }));
}

function blendHex(a, b, portion) {
  const components = [1, 3, 5].map(i => {
    const x = parseInt(a.slice(i, i + 2), 16);
    const y = parseInt(b.slice(i, i + 2), 16);
    return Math.round(x * (1 - portion) + y * portion).toString(16).padStart(2, '0');
  });
  return '#' + components.join('');
}

export function createMonacoTheme(palette) {
  const light = palette.mode === 'light';
  const mix = (other, fraction) => blendHex(palette.background, other, fraction);
  const lineNumber = blendHex(palette.foreground, palette.background, light ? .44 : .38);
  return {
    base: light ? 'vs' : 'vs-dark', inherit: true,
    rules: palette.inheritSyntax ? [] : themeRules(palette),
    colors: {
      'editor.background': palette.background,
      'editor.foreground': palette.foreground,
      'editorCursor.foreground': palette.accent,
      'editorLineNumber.foreground': lineNumber,
      'editorLineNumber.activeForeground': palette.foreground,
      'editor.selectionBackground': mix(palette.accent, light ? .2 : .32),
      'editor.inactiveSelectionBackground': mix(palette.accent, .12),
      'editor.lineHighlightBackground': light ? mix(palette.foreground, .04) : mix(palette.foreground, .055),
      'editorIndentGuide.background1': mix(palette.foreground, .12),
      'editorIndentGuide.activeBackground1': mix(palette.foreground, .35),
      'editorWhitespace.foreground': mix(palette.foreground, .23),
      'editorBracketMatch.background': mix(palette.accent, .14),
      'editorBracketMatch.border': palette.accent,
      'editor.findMatchBackground': mix(palette.accent, .35),
      'editor.findMatchHighlightBackground': mix(palette.accent, .18),
      'editorHoverWidget.background': palette.widget,
      'editorHoverWidget.foreground': palette.foreground,
      'editorHoverWidget.border': palette.border,
      'editorWidget.background': palette.widget,
      'editorWidget.foreground': palette.foreground,
      'editorWidget.border': palette.border,
      'editorSuggestWidget.background': palette.widget,
      'editorSuggestWidget.foreground': palette.foreground,
      'editorSuggestWidget.border': palette.border,
      'editorSuggestWidget.selectedBackground': mix(palette.accent, .14),
      'minimap.background': palette.background
    }
  };
}

export function registerSyntaxThemes(monaco) {
  for (const [id, palette] of Object.entries(syntaxPalettes)) {
    monaco.editor.defineTheme(id, createMonacoTheme(palette));
  }
}
