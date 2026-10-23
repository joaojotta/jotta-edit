import '@fontsource/rubik/400.css';
import '@fontsource/rubik/500.css';
import '@fontsource/rubik/600.css';
import '@fontsource/rubik/700.css';
import * as monaco from 'monaco-editor';
import EditorWorker from '../node_modules/monaco-editor/esm/vs/editor/editor.worker.js?worker';
import JsonWorker from '../node_modules/monaco-editor/esm/vs/language/json/json.worker.js?worker';
import CssWorker from '../node_modules/monaco-editor/esm/vs/language/css/css.worker.js?worker';
import HtmlWorker from '../node_modules/monaco-editor/esm/vs/language/html/html.worker.js?worker';
import TsWorker from '../node_modules/monaco-editor/esm/vs/language/typescript/ts.worker.js?worker';
import 'monaco-editor/min/vs/editor/editor.main.css';
import { abbreviationAt, indentedExpansion } from './emmet.js';
import { insertionForExpansion, snippetForExpansion } from './emmet-caret.js';
import { formatCode, formatLanguages, hasMixedPhpHtml } from './formatting.js';
import { normalizeFormatterWidth, normalizePlainTextHighlight, plainTextHighlightOptions } from './editor-behaviour.js';
import { pathContext, filterPathItems } from './path-completion.js';
import { workspacePreferences } from './workspace-preferences.js';
import { installRecentWorkspaces } from './recent-workspaces.js';
import { installFavourites, browserFavourites } from './favourites.js';
import { installFolderPicker } from './folder-picker.js';
import { installRemoteFolders } from './remote-folders.js';
import { installMarkdownPanel } from './markdown-panel.js';
import { installLocalHistory } from './local-history-panel.js';
import { installEditorLayout } from './editor-layout.js';
import { installProjectSearch } from './project-search-panel.js';
import { installSidebarViews } from './sidebar-views.js';
import { installDocumentOutline } from './document-outline-panel.js';
import { installRemoteConnectionPanel } from './remote-connection-panel.js';
import { projectPathContains } from './project-search.js';
import { installColorEditor } from './color-picker.js';
import { detectLanguage } from './language-detection.js';
import { installTagUnderlining } from './tag-matching.js';
import { registerSyntaxThemes, normalizeSyntaxTheme, resolveSyntaxTheme, syntaxThemeChoices, syntaxPalettes,
  syntaxPaletteFor, setCustomSyntaxPalettes, registerCustomSyntaxThemes } from './syntax-themes.js';
import { readCustomThemes, createCustomTheme, CUSTOM_THEME_FIELDS, CUSTOM_THEME_LIMIT,
  exportCustomTheme, importCustomTheme, validateCustomTheme } from './custom-syntax-themes.js';
import { interfaceColourFields, readInterfaceColours, setInterfaceColour, applyInterfaceColours } from './interface-theme.js';
import { explorerIconPaletteChoices, normalizeExplorerIconPalette, explorerIconColour } from './explorer-icon-palettes.js';
import { installSettingsTabs, installSettingsDragging } from './settings-tabs.js';
import { installFontMenu } from './font-menu.js';
import { requiredElement, editorInputTarget } from './dom-guards.js';
import { tr, locale, configureLanguage, translateDom, translateMessage } from './i18n.js';
import './style.css';

self.MonacoEnvironment = {
  getWorker(_moduleId, label) {
    if (label === 'json') return new JsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker();
    if (label === 'typescript' || label === 'javascript') return new TsWorker();
    return new EditorWorker();
  }
};

const api = {...window.slate};
const $ = id => requiredElement(document, id);
const stored = (name, fallback) => localStorage.getItem('jotta.' + name) ?? localStorage.getItem('slate.' + name) ?? fallback;
let workspacePrefs, recentWorkspaces, favouritesPanel;
const remember = (name, value) => {
  if (!workspacePrefs?.remember(state.root, name, value)) localStorage.setItem('jotta.' + name, String(value));
};
function fontCss(name) { return `"${String(name || 'Monospace').replace(/["\\]/g, '')}", monospace`; }
function boundedExplorerSize(size) { return Math.min(26, Math.max(11, Number.isFinite(Number(size)) ? Math.round(Number(size)) : 14)); }
function boundedUiSize(size) { return Math.min(22, Math.max(11, Number.isFinite(Number(size)) ? Math.round(Number(size)) : 14)); }
function boundedSize(size) { return Math.min(36, Math.max(10, Number.isFinite(Number(size)) ? Math.round(Number(size)) : 14)); }

const state = {
  root: null, nodes: [], files: [], tabs: [], active: null, nextUntitled: 1,
  removedFolders: new Set(), iconColours: {},
  expanded: new Set(), sidebarOpen: stored('sidebar', 'true') !== 'false',
  sidebarWidth: Number(stored('sidebar-width', '230')),
  theme: stored('theme', 'dark'),
  syntaxTheme: normalizeSyntaxTheme(stored('syntaxTheme', 'auto')),
  explorerIconPalette: normalizeExplorerIconPalette(stored('explorerIconPalette', 'auto')),
  languagePreference: stored('languagePreference', 'system'),
  minimap: stored('minimap', 'true') !== 'false',
  wordWrap: stored('wrap', 'false') === 'true',
  plainTextHighlights: normalizePlainTextHighlight(stored('plainTextHighlights', 'selection')),
  colorDisplayMode: stored('colorDisplayMode', 'swatch') === 'background' ? 'background' : 'swatch',
  formatWidth: normalizeFormatterWidth(stored('formatWidth', 'none')),
  fontSize: boundedSize(stored('fontsize', '14')),
  uiFontSize: boundedUiSize(stored('uiFontSize', '14')),
  explorerFontSize: boundedExplorerSize(stored('explorerFontSize', '14')),
  fontFamily: stored('fontFamily', 'Monospace'),
  uiFontFamily: stored('uiFontFamily', 'Rubik'),
  lineHeightRatio: Number(stored('lineHeightRatio', '1.55')),
  indentMode: stored('indentMode', 'spaces') === 'tabs' ? 'tabs' : 'spaces',
  tabSize: [2, 4, 8].includes(Number(stored('tabSize', '2'))) ? Number(stored('tabSize', '2')) : 2,
  previewBrowser: ['default', 'firefox', 'chrome'].includes(stored('previewBrowser', 'default')) ? stored('previewBrowser', 'default') : 'default',
  nativeFrame: true,
  formatOnSave: stored('formatOnSave', 'true') !== 'false',
  showHidden: stored('showHidden', 'false') === 'true',
  palette: null, paletteItems: [], paletteIndex: 0, queryId: 0
};
workspacePrefs = workspacePreferences(localStorage, {indentMode:state.indentMode, tabSize:state.tabSize,
  wrap:state.wordWrap, formatOnSave:state.formatOnSave, formatWidth:state.formatWidth});
let colorEditor;
let projectSearch;
let localHistoryPanel;
let remoteFoldersPanel, folderPicker;
let sidebarViews,outlinePanel,remoteConnectionPanel;
let markdownPanel;
let settingsDrag = null;
let editor;
let statusTimeout;
let editorLayout;
const colorEditors = new Map();

function normalizedSlashes(p) { return String(p || '').replace(/\\/g, '/'); }
function basename(p) { return normalizedSlashes(p).split('/').filter(Boolean).pop() || 'Untitled'; }
function parent(p) { return p ? p.slice(0, Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))) : ''; }
function displayPath(p) {
  const path = normalizedSlashes(p);
  return api.platform === 'web' && /^\/(local-files|imports|downloads)\//.test(path) ? basename(path) : path;
}
function relative(p) {
  const r = normalizedSlashes(state.root); const target = normalizedSlashes(p);
  return r && target.startsWith(r + '/') ? target.slice(r.length + 1) : displayPath(target);
}
function languageOf(file) {
  const extension = (file || '').split('.').pop().toLowerCase();
  const names = {
    js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
    ts: 'typescript', tsx: 'typescript', json: 'json', jsonc: 'json',
    htm: 'html', html: 'html', css: 'css', scss: 'scss', less: 'less',
    py: 'python', php: 'php', phtml: 'php', go: 'go', rs: 'rust',
    c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', hpp: 'cpp', java: 'java',
    sh: 'shell', bash: 'shell', zsh: 'shell', sql: 'sql', rb: 'ruby',
    md: 'markdown', markdown: 'markdown', yaml: 'yaml', yml: 'yaml',
    xml: 'xml', svg: 'xml', toml: 'ini', ini: 'ini', dockerfile: 'dockerfile',
    kt: 'kotlin', swift: 'swift', lua: 'lua', r: 'r', vue: 'html', svelte: 'html'
  };
  if (basename(file).toLowerCase() === 'dockerfile') return 'dockerfile';
  return names[extension] || 'plaintext';
}
function titleCase(str) {
  return ({ javascript: 'JavaScript', typescript: 'TypeScript', json: 'JSON', css: 'CSS', html: 'HTML', php: 'PHP', python: 'Python', sql: 'SQL', cpp: 'C++', shell: 'Shell', plaintext: 'Plain Text', markdown: 'Markdown' })[str] || str.charAt(0).toUpperCase() + str.slice(1);
}
function modelUri(p, id) {
  return p ? monaco.Uri.file(p) : monaco.Uri.parse(`inmemory://slate/untitled-${id}`);
}

// Register the editor-only palettes once, independently of Jotta's UI theme.
state.customThemes = readCustomThemes(stored('customThemes', '{}'));
state.interfaceColours = readInterfaceColours(stored('interfaceColours', '{}'));
setCustomSyntaxPalettes(state.customThemes);
state.syntaxTheme = normalizeSyntaxTheme(stored('syntaxTheme', 'auto'));
registerSyntaxThemes(monaco);
registerCustomSyntaxThemes(monaco);
function updateSyntaxThemePreview() {
  const preview = document.getElementById('setting-syntax-preview');
  if (!preview) return;
  const selected = resolveSyntaxTheme(state.syntaxTheme, state.theme);
  const palette = syntaxPaletteFor(selected);
  if (!palette) return;
  preview.style.backgroundColor = palette.background;
  preview.style.color = palette.foreground;
  preview.style.borderColor = palette.border;
  for (const [part, colorKey] of Object.entries({keyword:'keyword', variable:'variable', operator:'operator', string:'string', number:'number', comment:'comment', function:'function', tag:'tag', attribute:'attribute'})) {
    const item = preview.querySelector(`[data-token="${part}"]`);
    if (item) item.style.color = palette[colorKey];
  }
}
function applySyntaxTheme() {
  monaco.editor.setTheme(resolveSyntaxTheme(state.syntaxTheme, state.theme));
  updateSyntaxThemePreview();
  if (colorEditors.size) requestAnimationFrame(() => { for (const picker of colorEditors.values()) picker.refresh(); });
  if (editor) { renderTree(); renderTabs(); }
  updateIconColourPreview();
}
function setSyntaxTheme(choice) {
  state.syntaxTheme = normalizeSyntaxTheme(choice);
  remember('syntaxTheme', state.syntaxTheme);
  applySyntaxTheme();
}
function setTheme(theme) {
  state.theme = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = state.theme;
  applyInterfaceColours(document.documentElement, state.interfaceColours, state.theme);
  if (document.getElementById('theme-ui-colours')) refreshInterfaceColourEditor();
  applySyntaxTheme();
  remember('theme', state.theme);
}
function showStatus(message, duration = 3000) {
  $('status-message').textContent = translateMessage(message);
  $('status-message').title = translateMessage(message);
  clearTimeout(statusTimeout);
  if (duration) statusTimeout = setTimeout(() => { $('status-message').textContent = tr('Ready'); $('status-message').title = ''; }, duration);
}
// The desktop session stores dirty buffers and untitled tabs in userData/session.json.
// Debounced snapshots cover crashes; close/restart waits for the final disk write.
let sessionRestoreInProgress = true;
let sessionSaveTimer = null;
let sessionSaveChain = Promise.resolve();
function sessionSnapshot() {
  return {
    root: state.root,
    files: state.tabs.filter(doc => !!doc.path).map(doc => doc.path), // legacy compatibility
    activeIndex: state.tabs.findIndex(doc => doc.id === state.active),
    nextUntitled: state.nextUntitled,
    tabs: state.tabs.map(doc => ({
      path: doc.path || null,
      name: doc.name,
      dirty: doc.dirty,
      language: doc.path ? undefined : doc.model.getLanguageId(),
      // Clean files are reloaded from disk; drafts and dirty files need a local copy.
      ...(!doc.path || doc.dirty ? { text: doc.model.getValue() } : {})
    }))
  };
}
function flushSession() {
  clearTimeout(sessionSaveTimer);
  sessionSaveTimer = null;
  if (sessionRestoreInProgress) return sessionSaveChain;
  const snapshot = sessionSnapshot();
  sessionSaveChain = sessionSaveChain.catch(() => {}).then(() => api.setSession(snapshot));
  return sessionSaveChain;
}
function persist() {
  queuePreviewUpdate();
  if (sessionRestoreInProgress) return;
  clearTimeout(sessionSaveTimer);
  sessionSaveTimer = setTimeout(() => {
    flushSession().catch(error => showStatus(`Session backup failed: ${error.message}`, 7500));
  }, 650);
}
let previewRunning = false;
let previewUntitled = null;
let previewTimer;
let previewChain = Promise.resolve();
function previewBuffers() {
  return state.tabs.filter(doc => (doc.path && doc.dirty) || doc.id === previewUntitled).map(doc => ({path: doc.id === previewUntitled ? null : doc.path, content: doc.model.getValue()}));
}
function queuePreviewUpdate() {
  if (!previewRunning) return;
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    previewChain = previewChain.catch(() => {}).then(() => api.updatePreview(previewBuffers())).catch(error => showStatus(error.message));
  }, 180);
}
async function startLivePreview() {
  if (!api.startPreview) { showStatus('Live preview is available in the desktop app'); return; }
  const doc = activeDocument();
  const previewable = file => /\.(?:html?|php)$/i.test(file || '');
  const untitled = doc && !doc.path && doc.model.getLanguageId() === 'html';
  const entry = untitled ? null : previewable(doc?.path) ? doc.path : state.files.find(file => normalizedSlashes(file) === normalizedSlashes(state.root) + '/index.html' || normalizedSlashes(file) === normalizedSlashes(state.root) + '/index.php') || state.files.find(file => /(^|[\\/])index\.(?:html?|php)$/i.test(file)) || state.files.find(previewable) || state.tabs.find(tab => previewable(tab.path))?.path;
  if (!entry && !untitled) { showStatus('Open an HTML or PHP file or a folder containing index.html or index.php to preview'); return; }
  try {
    clearTimeout(previewTimer);
    await previewChain;
    previewUntitled = untitled ? doc.id : null;
    await api.startPreview({root: state.root && (!entry || isPathUnder(entry, state.root)) ? state.root : parent(entry) || null, entry, buffers: previewBuffers(), browser: state.previewBrowser});
    previewRunning = true;
    queuePreviewUpdate();
    showStatus(/\.php$/i.test(entry || '') ? 'PHP preview started — save PHP changes to reload' : 'Live preview started — updates as you type');
  } catch (error) { previewRunning = false; showStatus(error.message, 0); }
}
async function stopLivePreview() {
  previewRunning = false; clearTimeout(previewTimer);
  await previewChain;
  await api.stopPreview?.();
  showStatus('Live preview stopped');
}
function activeDocument() { return state.tabs.find(t => t.id === state.active) || null; }
function getEditorModel() { return activeDocument()?.model || null; }
function setActive(id) {
  editorLayout.selectDocument(state.tabs.find(doc => doc.id === id) || null);
}
function activateEditor(target, doc) {
  editor = target;
  colorEditor = colorEditors.get(target) || colorEditor;
  state.active = doc?.id || null;
  $('welcome').classList.toggle('hidden', Boolean(doc));
  $('editor').classList.toggle('visible', Boolean(doc));
  $('breadcrumbs').textContent = doc ? relative(doc.path) || doc.name : tr('START');
  document.title = doc ? `${doc.name}${doc.dirty ? ' •' : ''} — Jotta Edit` : 'Jotta Edit';
  renderTabs(); renderTree(); updateStatus(); persist();
  markdownPanel?.activate(doc,target);
  outlinePanel?.activate(doc,target);
}
function attachDocumentListener(doc) {
  doc.listener?.dispose();
  doc.listener = doc.model.onDidChangeContent(() => {
    if (!doc.path && !doc.languagePinned) {
      clearTimeout(doc.detectTimer);
      doc.detectTimer = setTimeout(() => {
        const detected = detectLanguage(doc.model.getValue()) || 'plaintext';
        if (!doc.path && !doc.languagePinned && doc.model.getLanguageId() !== detected) {
          monaco.editor.setModelLanguage(doc.model, detected);
          if (doc.id === state.active) updateStatus();
        }
      }, 320);
    }
    projectSearch?.invalidate();
    const wasDirty = doc.dirty;
    doc.dirty = doc.model.getValue() !== doc.savedText;
    if (wasDirty !== doc.dirty) {
      renderTabs();
      if (doc.id === state.active) document.title = `${doc.name}${doc.dirty ? ' •' : ''} — Jotta Edit`;
    }
    persist();
  });
}
function addDocument(file, content = '', mtimeMs = null) {
  const existing = file && state.tabs.find(t => t.path === file);
  if (existing) { setActive(existing.id); return existing; }
  const id = crypto.randomUUID();
  const name = file ? basename(file) : `untitled-${state.nextUntitled++}`;
  const lang = file ? languageOf(file) : (detectLanguage(content) || 'plaintext');
  const model = monaco.editor.createModel(content, lang, modelUri(file, id));
  applyIndentToModel(model);
  const doc = { id, path: file, name, model, savedText: content, mtimeMs, dirty: false, viewState: null, listener: null, detectTimer: null };
  attachDocumentListener(doc);
  state.tabs.push(doc);
  setActive(id);
  persist();
  return doc;
}
function newMarkdown(){
  const doc=addDocument(null);doc.name=doc.name+'.md';doc.languagePinned=true;
  monaco.editor.setModelLanguage(doc.model,'markdown');setActive(doc.id);persist();
}
async function openFile(file, opts = {}) {
  try {
    const existing = state.tabs.find(t => t.path === file);
    if (existing) setActive(existing.id);
    else {
      const data = await api.readFile(file);
      addDocument(data.path, data.content, data.mtimeMs);
    }
    if (opts.line) {
      const line = Math.max(1, Math.min(Math.floor(opts.line), getEditorModel().getLineCount()));
      editor.revealLineInCenter(line);
      const column = Math.max(1, Math.min(opts.column || 1, getEditorModel().getLineMaxColumn(line)));
      editor.setPosition({ lineNumber: line, column });
      if (opts.length) editor.setSelection(new monaco.Range(line, column, line, Math.min(column + opts.length, getEditorModel().getLineMaxColumn(line))));
      editor.focus();
    }
    return true;
  } catch (err) { showStatus(`Cannot open: ${err.message}`, 6500);return false; }
}
async function restoreSavedSession(saved) {
  if (saved.root) await openFolder(saved.root);
  if (Array.isArray(saved.tabs)) {
    for (const item of saved.tabs) {
      if (!item || typeof item !== 'object') continue;
      if (!item.path) {
        const doc = addDocument(null);
        if (typeof item.name === 'string' && item.name.trim()) doc.name = item.name;
        if (typeof item.text === 'string') doc.model.setValue(item.text);
        if (typeof item.language === 'string' && monaco.languages.getLanguages().some(l => l.id === item.language)) {
          doc.languagePinned=true;
          monaco.editor.setModelLanguage(doc.model, item.language);
        }
      } else {
        try {
          const disk = await api.readFile(item.path);
          const doc = addDocument(disk.path, disk.content, disk.mtimeMs);
          if (item.dirty && typeof item.text === 'string') doc.model.setValue(item.text);
        } catch (error) {
          // A moved/deleted file must not make its unsaved edits disappear.
          if (item.dirty && typeof item.text === 'string') {
            const recovered = addDocument(null);
            recovered.name = `recovered-${basename(item.path)}`;
            recovered.model.setValue(item.text);
            showStatus(`Recovered unsaved changes from ${basename(item.path)}`, 8000);
          }
        }
      }
    }
    state.nextUntitled = Math.max(state.nextUntitled, Number.isSafeInteger(saved.nextUntitled) ? saved.nextUntitled : 1);
    const index = Number.isInteger(saved.activeIndex) ? saved.activeIndex : -1;
    if (state.tabs[index]) selectDocument(state.tabs[index].id);
  } else {
    // Read existing pre-upgrade sessions that stored only file paths.
    for (const file of saved.files || []) await openFile(file);
  }
  renderTabs();
}
async function chooseFile() {
  try { const files = await api.chooseFiles({openPaths:state.tabs.map(doc => doc.path).filter(Boolean)}); for (const file of files) await openFile(file); }
  catch (error) { showStatus(`Cannot open: ${error.message}`, 7500); }
}
function downloadActiveFile() {
  const doc = activeDocument();
  if (!doc || !api.downloadFile) return;
  try {
    api.downloadFile(doc.name, doc.model.getValue());
    showStatus('File download started');
  } catch (error) { showStatus(error.message, 7500); }
}
async function save(doc = activeDocument(), saveAs = false) {
  if (!doc) return false;
  let dest = doc.path;
  try {
    if (!dest || saveAs) dest = await api.saveAsDialog(dest || `${doc.name}.txt`, {openPaths:state.tabs.map(tab => tab.path).filter(Boolean)});
    if (!dest) return false;
    if (dest !== doc.path && state.tabs.some(tab => tab !== doc && tab.path === dest)) throw new Error(tr('That file is already open. Save it from its own tab.'));
    await api.prepareSave?.(dest);
    let formatIssue = '';
    if (state.formatOnSave && formatLanguages.has(doc.model.getLanguageId())) {
      if (doc.model.getLanguageId() === 'php' && hasMixedPhpHtml(doc.model.getValue())) {
        formatIssue = 'mixed PHP/HTML not autoformatted';
      } else if (!await formatDocument(doc, { quiet: true })) {
        formatIssue = 'formatting failed';
      }
    }
    const value = doc.model.getValue();
    const saved = await api.saveFile(dest, value, dest === doc.path ? {expectedText:doc.savedText} : {});
    if (dest !== doc.path) {
      const old = doc.model;
      doc.listener?.dispose();
      doc.path = dest; doc.name = basename(dest);
      const lang = languageOf(dest);
      doc.model = monaco.editor.createModel(old.getValue(), lang, modelUri(dest, doc.id));
      applyIndentToModel(doc.model);
      attachDocumentListener(doc);
      editorLayout.rebind(doc, old);
      old.dispose();
    }
    doc.savedText = value;
    doc.mtimeMs = saved.mtimeMs;
    doc.dirty = doc.model.getValue() !== value;
    renderTabs(); updateStatus(); persist();
    if (state.active === doc.id) {
      $('breadcrumbs').textContent = relative(doc.path) || doc.name;
      document.title = `${doc.name}${doc.dirty ? ' •' : ''} — Jotta Edit`;
    }
    const issues = [formatIssue, saved.historyWarning && tr(saved.historyWarning), saved.notice && tr(saved.notice)].filter(Boolean).join(' · ');
    showStatus(issues ? `Saved ${doc.name} · ${issues}` : `Saved ${doc.name}`, issues ? 7500 : 3000);
    if (state.root && normalizedSlashes(dest).startsWith(normalizedSlashes(state.root) + '/')) refreshFolder().catch(() => {});
    return true;
  } catch (err) { showStatus(`Save failed: ${err.message}`, 7500); return false; }
}
function confirmChanges(doc) {
  return new Promise(resolve => {
    $('confirm-description').textContent = translateMessage(`The file “${doc.name}” has unsaved changes. Do you want to save them?`);
    const overlay = $('confirm-overlay');
    overlay.classList.remove('hidden'); overlay.setAttribute('aria-hidden', 'false');
    const clean = (choice) => {
      overlay.classList.add('hidden'); overlay.setAttribute('aria-hidden', 'true');
      $('confirm-save').removeEventListener('click', onSave);
      $('confirm-discard').removeEventListener('click', onDiscard);
      $('confirm-cancel').removeEventListener('click', onCancel);
      resolve(choice);
    };
    const onSave = () => clean('save');
    const onDiscard = () => clean('discard');
    const onCancel = () => clean('cancel');
    $('confirm-save').addEventListener('click', onSave);
    $('confirm-discard').addEventListener('click', onDiscard);
    $('confirm-cancel').addEventListener('click', onCancel);
    $('confirm-save').focus();
  });
}
async function canDiscard(doc) {
  if (!doc.dirty) return true;
  const choice = await confirmChanges(doc);
  if (choice === 'save') return save(doc);
  return choice === 'discard';
}
async function closeDocument(id) {
  const index = state.tabs.findIndex(t => t.id === id);
  if (index === -1) return;
  const doc = state.tabs[index];
  if (!await canDiscard(doc)) return;
  if (doc.id === state.active) doc.viewState = editor.saveViewState();
  clearTimeout(doc.detectTimer);
  doc.listener?.dispose();
  state.tabs.splice(index, 1);
  editorLayout.removeDocument(id, state.tabs[Math.min(index, state.tabs.length - 1)] || null);
  renderTabs();
  doc.model.dispose();
  persist();
}
async function closeApp() {
  try {
    await flushSession(); // Never close until every modified buffer is safely backed up.
    api.closeConfirmed();
  } catch (error) {
    showStatus(`Cannot close: session backup failed: ${error.message}`, 0);
  }
}
function selectDocument(id) {
  const current = activeDocument();
  if (current) current.viewState = editor.saveViewState();
  setActive(id);
}
function renderTabs() {
  editorLayout?.refresh();
  for (const [id, pressed] of [['btn-split', editorLayout?.split], ['btn-compare', editorLayout?.comparing]]) {
    const button = $(id);
    button.disabled = !activeDocument();
    button.setAttribute('aria-pressed', String(Boolean(pressed)));
  }
  const downloadButton = document.getElementById('web-download-file');
  if (downloadButton) downloadButton.disabled = !activeDocument();
  for (const id of ['web-save-file','web-save-as']) { const button = document.getElementById(id); if (button) button.disabled = !activeDocument(); }
  const location = document.getElementById('web-save-location'), doc = activeDocument();
  if (location && api.saveLocation) {
    const path = doc?.path;
    location.textContent = tr(doc ? 'Choose save location' : 'No file open');
    if (doc) api.saveLocation(path).then(label => { if (activeDocument() === doc && doc.path === path) location.textContent = tr(label); }).catch(() => {});
  }
  const container = $('tabs');
  container.replaceChildren();
  for (const doc of state.tabs) {
    const tab = document.createElement('div');
    tab.className = `tab${doc.id === state.active ? ' active' : ''}`;
    tab.title = displayPath(doc.path) || doc.name;
    const dot = document.createElement('span'); dot.className = 'tab-dot'; dot.textContent = doc.dirty ? '●' : ' '; 
    const label = document.createElement('span'); label.className = 'tab-name'; label.textContent = doc.name;
    const close = document.createElement('button'); close.className = 'tab-close'; close.textContent = '×'; close.title = `${tr('Close')} ${doc.name}`;
    close.addEventListener('click', (e) => { e.stopPropagation(); closeDocument(doc.id); });
    tab.addEventListener('click', () => selectDocument(doc.id));
    tab.addEventListener('auxclick', e => { if (e.button === 1) closeDocument(doc.id); });
    const icon = makeThemedIcon(fileIconPath(doc.name), 'file-glyph tab-file-icon');
    tab.append(icon, dot, label, close); container.append(tab);
  }
  container.querySelector('.tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
// Icon colours are keyed by the shipped SVG name, never arbitrary image URLs.
const iconTypes = [
  ['folder.svg','Folder'],['file.svg','Other files'],['html5.svg','HTML'],['css3.svg','CSS'],['js.svg','JavaScript'],
  ['json.svg','JSON'],['php.svg','PHP'],['markdown.svg','Markdown'],['txt.svg','Text'],['fonts.svg','Fonts'],
  ['png.svg','PNG'],['jpeg.svg','JPEG'],['gif.svg','GIF'],['svg.svg','SVG'],
  ['webp.svg','WebP'],['image.svg','Images'],['audio.svg','Audio'],['video.svg','Video'],['package.svg','Packages']
];
const iconTypeNames = new Set(iconTypes.map(([name]) => name));
// Load settings only after icon names have been initialized.
state.iconColours = readIconColours();
function readIconColours() {
  try {
    const values = JSON.parse(stored('iconColours', '{}'));
    if (!values || typeof values !== 'object' || Array.isArray(values)) return {};
    return Object.fromEntries(Object.entries(values).filter(([type, colour]) =>
      iconTypeNames.has(type) && typeof colour === 'string' && /^#[\da-fA-F]{6}(?:[\da-fA-F]{2})?$/.test(colour)));
  } catch { return {}; }
}
function iconColourFor(path) {
  return explorerIconColour(
    path, state.iconColours, state.explorerIconPalette,
    state.customThemes[resolveSyntaxTheme(state.syntaxTheme, state.theme)]?.base || resolveSyntaxTheme(state.syntaxTheme, state.theme), state.theme
  );
}
// The PWA may be deployed in an HTTPS subdirectory. Resolve UI icons relative
// to the deployed index, while retaining original root URLs in Electron.
function interfaceAssetUrl(path) {
  if (api.platform !== 'web' || !path.startsWith('/')) return path;
  return new URL(path.slice(1), new URL('.', window.location.href)).href;
}
function makeThemedIcon(path, className = 'file-glyph') {
  const glyph = document.createElement('span');
  glyph.className = className;
  // The mask preserves the user's SVG shape and permits per-type colour changes.
  glyph.style.webkitMaskImage = `url("${interfaceAssetUrl(path)}")`;
  glyph.style.maskImage = `url("${interfaceAssetUrl(path)}")`;
  const colour = iconColourFor(path);
  if (colour) glyph.style.backgroundColor = colour;
  glyph.setAttribute('aria-hidden', 'true');
  return glyph;
}
function saveIconColour(key, value) {
  if (!iconTypeNames.has(key)) return;
  if (value === null) delete state.iconColours[key];
  else state.iconColours[key] = value;
  remember('iconColours', JSON.stringify(state.iconColours));
  renderTree(); renderTabs(); updateIconColourPreview();
}
function updateIconColourPreview() {
  const choice = document.getElementById('setting-icon-type');
  const preview = document.getElementById('setting-icon-preview');
  if (!choice || !preview || !iconTypeNames.has(choice.value)) return;
  preview.replaceChildren(makeThemedIcon(`/file-icons/${choice.value}`));
  const colour = iconColourFor(`/file-icons/${choice.value}`);
  const colourValue = document.getElementById('setting-icon-colour-value');
  if (colourValue) colourValue.textContent = colour || '';
  const samples = document.getElementById('setting-icon-palette-preview');
  if (samples) {
    samples.replaceChildren(...['folder.svg','html5.svg','css3.svg','js.svg','php.svg','svg.svg','image.svg','package.svg']
      .map(name => makeThemedIcon(`/file-icons/${name}`)));
  }
}
function filterRemovedFolders(nodes) {
  return nodes.filter(node => !(node.dir && state.removedFolders.has(node.path))).map(node =>
    node.dir ? {...node, children:filterRemovedFolders(node.children || [])} : node);
}
function removeFolderFromView(path) {
  projectSearch?.reset();
  if (path === state.root) {
    state.root = null; state.nodes = []; state.files = [];
    applyWorkspaceSettings();
    state.expanded.clear(); state.removedFolders.clear();
    $('project-name').textContent = tr('NO FOLDER OPEN');
    $('project-name').removeAttribute('title');
    $('window-title').textContent = tr('Untitled workspace');
    $('btn-close-project').classList.add('hidden');
    persist();
  } else state.removedFolders.add(path);
  state.files = collectFiles(filterRemovedFolders(state.nodes));
  renderTree();
}
function makeIcon(src, label = '') {
  const img = document.createElement('img');
  img.src = interfaceAssetUrl(src); img.alt = ''; img.draggable = false; img.setAttribute('aria-hidden', 'true');
  if (label) img.title = label;
  return img;
}
function fileIconPath(name, isDir = false) {
  if (isDir) return '/file-icons/folder.svg';
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (['js','jsx','mjs','cjs','ts','tsx'].includes(ext)) return '/file-icons/js.svg';
  if (ext === 'php' || ext === 'phtml') return '/file-icons/php.svg';
  if (ext === 'json' || ext === 'jsonc') return '/file-icons/json.svg';
  if (ext === 'html' || ext === 'htm') return '/file-icons/html5.svg';
  if (ext === 'css' || ext === 'scss' || ext === 'less') return '/file-icons/css3.svg';
  if (ext === 'png') return '/file-icons/png.svg';
  if (['jpg','jpeg'].includes(ext)) return '/file-icons/jpeg.svg';
  if (ext === 'gif') return '/file-icons/gif.svg';
  if (ext === 'svg') return '/file-icons/svg.svg';
  if (ext === 'webp') return '/file-icons/webp.svg';
  if (['bmp','ico','avif','tif','tiff'].includes(ext)) return '/file-icons/image.svg';
  if (['zip','rar','7z','tar','gz','bz2','xz'].includes(ext)) return '/file-icons/package.svg';
  if (['mp3','wav','flac','ogg','m4a','aac'].includes(ext)) return '/file-icons/audio.svg';
  if (['mp4','webm','mkv','avi','mov'].includes(ext)) return '/file-icons/video.svg';
  if (['md','markdown'].includes(ext)) return '/file-icons/markdown.svg';
  if (ext === 'txt') return '/file-icons/txt.svg';
  if (['ttf','otf','woff','woff2','eot'].includes(ext)) return '/file-icons/fonts.svg';
  return '/file-icons/file.svg';
}
function isPathUnder(file, base) {
  const path = normalizedSlashes(file);
  const prefix = normalizedSlashes(base);
  return path === prefix || path.startsWith(prefix + '/');
}
function movedPath(file, oldPath, nextPath) {
  return nextPath + file.slice(oldPath.length);
}
function refreshPathsAfterMove(oldPath, nextPath) {
  if (oldPath === nextPath) return;
  for (const doc of state.tabs) {
    if (!doc.path || !isPathUnder(doc.path, oldPath)) continue;
    const wasSelected = doc.id === state.active;
    const viewState = wasSelected ? editor.saveViewState() : doc.viewState;
    const old = doc.model;
    doc.listener?.dispose();
    doc.path = movedPath(doc.path, oldPath, nextPath);
    doc.name = basename(doc.path);
    doc.model = monaco.editor.createModel(old.getValue(), languageOf(doc.path), modelUri(doc.path, doc.id));
    applyIndentToModel(doc.model);
    attachDocumentListener(doc);
    editorLayout.rebind(doc, old);
    if (wasSelected) {
      $('breadcrumbs').textContent = relative(doc.path);
      document.title = `${doc.name}${doc.dirty ? ' •' : ''} — Jotta Edit`;
    }
    doc.viewState = viewState;
    old.dispose();
  }
  state.expanded = new Set([...state.expanded].map(p => isPathUnder(p,oldPath) ? movedPath(p,oldPath,nextPath) : p));
  state.removedFolders = new Set([...state.removedFolders].map(p => isPathUnder(p,oldPath) ? movedPath(p,oldPath,nextPath) : p));
  persist(); renderTabs(); updateStatus();
}
async function protectOpenDocuments(source) {
  for (const doc of state.tabs.filter(doc => doc.path && isPathUnder(doc.path, source) && doc.dirty)) {
    // For disk mutations offer Save or Cancel only. Discard must never
    // silently destroy unsaved text while paths are being changed or removed.
    const discard = $('confirm-discard');
    discard.hidden = true;
    let answer;
    try { answer = await confirmChanges(doc); }
    finally { discard.hidden = false; }
    if (answer !== 'save' || !(await save(doc))) return false;
  }
  return true;
}
function closeDeletedDocuments(source) {
  const removed = state.tabs.filter(doc => doc.path && isPathUnder(doc.path, source));
  state.expanded = new Set([...state.expanded].filter(path => !isPathUnder(path, source)));
  state.removedFolders = new Set([...state.removedFolders].filter(path => !isPathUnder(path, source)));
  for (const doc of removed) {
    clearTimeout(doc.detectTimer);
    doc.listener?.dispose();
    state.tabs.splice(state.tabs.indexOf(doc),1);
    editorLayout.removeDocument(doc.id, state.tabs[0] || null);
    doc.model.dispose();
  }
  if (removed.some(doc => doc.id === state.active)) { state.active = null; setActive(state.tabs[0]?.id || null); }
  else { renderTabs(); renderTree(); }
  persist();
}
function hideExplorerContext() {
  const menu = $('explorer-menu'); menu.classList.add('hidden'); menu.setAttribute('aria-hidden','true');
}
function askExplorerAction(type, name) {
  return new Promise(resolve => {
    const overlay = $('explorer-action-overlay');
    const isRename = type === 'rename';
    const isCreate = type === 'new-file' || type === 'new-folder';
    const needsName = isRename || isCreate;
    const title = isCreate ? (type === 'new-file' ? 'New File' : 'New Folder') : isRename ? 'Rename' : 'Move to Trash';
    $('explorer-action-title').textContent = tr(title);
    $('explorer-action-message').textContent = needsName ? tr('Enter the new name:') : `${tr('Move to Trash?')} ${name}`;
    $('explorer-action-name-wrap').classList.toggle('hidden', !needsName);
    $('explorer-action-name').value = name;
    $('explorer-action-confirm').textContent = tr(title);
    $('explorer-action-confirm').classList.toggle('danger', !needsName);
    overlay.classList.remove('hidden'); overlay.setAttribute('aria-hidden','false');
    const finish = value => {
      overlay.classList.add('hidden'); overlay.setAttribute('aria-hidden','true');
      confirm.removeEventListener('click', onConfirm);
      cancel.removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKey);
      overlay.removeEventListener('pointerdown', onBackdrop);
      resolve(value);
    };
    const confirm = $('explorer-action-confirm'), cancel = $('explorer-action-cancel'), input = $('explorer-action-name');
    const onConfirm = () => finish(needsName ? input.value : true);
    const onCancel = () => finish(null);
    const onKey = e => { if (e.key === 'Enter') { e.preventDefault(); onConfirm(); } else if (e.key === 'Escape') { e.preventDefault(); onCancel(); } };
    const onBackdrop = e => { if (e.target === overlay) onCancel(); };
    confirm.addEventListener('click',onConfirm); cancel.addEventListener('click',onCancel);
    input.addEventListener('keydown',onKey); overlay.addEventListener('pointerdown',onBackdrop);
    if (needsName) { input.focus(); const dot = name.lastIndexOf('.'); input.setSelectionRange(0,dot>0?dot:name.length); }
    else cancel.focus();
  });
}
async function explorerOperation(type, source, targetFolder = null) {
  hideExplorerContext();
  let historyWarning = '';
  try {
    if (type === 'new-file' || type === 'new-folder') {
      const answer = await askExplorerAction(type, '');
      if (answer === null || !answer.trim()) return;
      const result = await api.createEntry(state.root, source, answer, type === 'new-folder' ? 'folder' : 'file');
      state.expanded.add(source);
      if (result.dir) state.expanded.add(result.path);
      if (answer.startsWith('.')) { state.showHidden = true; remember('showHidden', true); }
      await refreshFolder();
      persist();
      if (!result.dir) await openFile(result.path);
      showStatus(result.dir ? 'Folder created' : 'File created');
      return;
    }
    if (type !== 'move') {
      const answer = await askExplorerAction(type, basename(source));
      if (answer === null) return;
      if (type === 'rename' && (answer === basename(source) || !answer)) return;
      if (!await protectOpenDocuments(source)) return;
      if (type === 'rename') {
        const result = await api.renameEntry(state.root, source, answer);
        refreshPathsAfterMove(result.oldPath,result.path);
        historyWarning = result.historyWarning || '';
      } else {
        await api.deleteEntry(state.root, source);
        closeDeletedDocuments(source);
      }
    } else {
      if (!targetFolder || !await protectOpenDocuments(source)) return;
      const result = await api.moveEntry(state.root, source, targetFolder);
      refreshPathsAfterMove(result.oldPath,result.path);
      historyWarning = result.historyWarning || '';
    }
    await refreshFolder();
    showStatus(historyWarning ? tr(historyWarning) : type === 'rename' ? 'Renamed successfully' : type === 'delete' ? 'Moved to Trash' : 'Moved successfully', historyWarning ? 7500 : 3000);
  } catch (error) { showStatus(`${type}: ${error.message}`, 7000); }
}
function showExplorerContext(event, node) {
  event.preventDefault(); event.stopPropagation();
  const menu = $('explorer-menu');
  menu.classList.remove('hidden'); menu.setAttribute('aria-hidden','false');
  const isRoot = node.path === state.root;
  $('explorer-new-file').hidden = !node.dir;
  $('explorer-new-folder').hidden = !node.dir;
  $('explorer-rename').hidden = isRoot;
  $('explorer-delete').hidden = isRoot;
  $('explorer-new-file').onclick = () => explorerOperation('new-file', node.path);
  $('explorer-new-folder').onclick = () => explorerOperation('new-folder', node.path);
  const bounds = menu.getBoundingClientRect();
  menu.style.left = Math.max(5, Math.min(innerWidth - bounds.width - 5, event.clientX ?? 40)) + 'px';
  menu.style.top = Math.max(5, Math.min(innerHeight - bounds.height - 5, event.clientY ?? 40)) + 'px';
  $('explorer-rename').onclick = () => explorerOperation('rename', node.path);
  $('explorer-delete').onclick = () => explorerOperation('delete', node.path);
  $(node.dir ? 'explorer-new-file' : 'explorer-rename').focus();
}
let draggingExplorerEntry = null;
function attachDropTarget(element, folder) {
  element.addEventListener('dragover', event => {
    if (!draggingExplorerEntry || draggingExplorerEntry === folder || isPathUnder(folder, draggingExplorerEntry)) return;
    event.preventDefault(); event.dataTransfer.dropEffect = 'move'; element.classList.add('explorer-drop-target');
  });
  element.addEventListener('dragleave', () => element.classList.remove('explorer-drop-target'));
  element.addEventListener('drop', event => {
    element.classList.remove('explorer-drop-target');
    if (!draggingExplorerEntry || draggingExplorerEntry === folder || isPathUnder(folder, draggingExplorerEntry)) return;
    event.preventDefault(); event.stopPropagation();
    const source = draggingExplorerEntry; draggingExplorerEntry = null;
    explorerOperation('move', source, folder);
  });
}
function renderTree() {
  const tree = $('file-tree'); tree.replaceChildren();
  if (!state.root) return;
  function addNodes(nodes, depth) {
    for (const node of nodes) {
      const row = document.createElement('div');
      row.className = 'file-row' + (node.dir ? ' directory' : '') + (!node.dir && activeDocument()?.path === node.path ? ' selected' : '');
      row.style.paddingLeft = `${11 + depth * 13}px`;
      row.tabIndex = 0;
      const chevron = document.createElement('span'); chevron.className = 'chevron';
      if (node.dir) chevron.append(makeIcon(state.expanded.has(node.path) ? '/ui-icons/arrow-down.svg' : '/ui-icons/arrow-right.svg'));
      const symbol = document.createElement('span'); symbol.className = 'file-symbol';
      symbol.replaceChildren(makeThemedIcon(fileIconPath(node.name, node.dir)));
      const name = document.createElement('span'); name.className = 'file-name'; name.textContent = node.name;
      row.append(chevron, symbol, name);
      if (node.dir) {
        const remove = document.createElement('button'); remove.type = 'button';
        remove.className = 'folder-remove'; remove.replaceChildren(makeIcon('/ui-icons/close.svg'));
        remove.title = tr('Remove folder from Explorer');
        remove.setAttribute('aria-label', `${tr('Remove folder from Explorer')}: ${node.name}`);
        remove.addEventListener('click', event => {
          event.preventDefault(); event.stopPropagation(); removeFolderFromView(node.path);
        });
        row.append(remove);
      }

      if(node.error)row.title=tr(node.error);
      const activate = async () => {
        if(node.error){showStatus(node.error,6500);return;}
        if(!node.dir){openFile(node.path);return;}
        if(state.expanded.has(node.path)){state.expanded.delete(node.path);renderTree();return;}
        state.expanded.add(node.path);renderTree();
        const source=findExplorerNode(state.nodes,node.path);
        if(!source||source.loading||(!source.incomplete&&source.children?.length))return;
        source.loading=true;const root=state.root;
        showStatus('Loading folder…');
        try{
          const listing=await api.scanFolder(node.path,{showHidden:state.showHidden,shallow:true});
          if(state.root!==root)return;
          if(findExplorerNode(state.nodes,node.path)!==source)return;
          source.children=listing.nodes;source.incomplete=false;
          state.files=collectFiles(filterRemovedFolders(state.nodes));
          if(listing.truncated)showStatus('Explorer limited to first 8,000 files',6000);
          else showStatus(listing.nodes.length?'Ready':'No visible files or folders');
        }catch(error){if(state.root===root){state.expanded.delete(node.path);showStatus(error.message,6500);}}
        finally{source.loading=false;if(state.root===root)renderTree();}
      };
      row.draggable = true;
      row.addEventListener('dragstart', event => {
        if (event.target.closest?.('button')) { event.preventDefault(); return; }
        draggingExplorerEntry = node.path;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', node.name);
      });
      row.addEventListener('dragend', () => { draggingExplorerEntry = null; document.querySelectorAll('.explorer-drop-target').forEach(el => el.classList.remove('explorer-drop-target')); });
      if (node.dir) attachDropTarget(row, node.path);
      row.addEventListener('contextmenu', event => showExplorerContext(event, node));
      row.addEventListener('keydown', event => {
        if (event.key === 'Delete') { event.preventDefault(); event.stopPropagation(); explorerOperation('delete', node.path); }
        if (event.key === 'F2') { event.preventDefault(); explorerOperation('rename',node.path); }
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) showExplorerContext(event, node);
      });
      row.addEventListener('click', activate);
      row.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); activate(); } });
      tree.append(row);
      if (node.dir && state.expanded.has(node.path)) addNodes(node.children || [], depth + 1);
    }
  }
  addNodes(filterRemovedFolders(state.nodes), 0);
}
function findExplorerNode(nodes, wanted) {
  for(const node of nodes){
    if(node.path===wanted)return node;
    if(node.dir){const found=findExplorerNode(node.children||[],wanted);if(found)return found;}
  }
  return null;
}
function collectFiles(nodes, output = []) {
  for (const node of nodes) node.dir ? collectFiles(node.children || [], output) : output.push(node.path);
  return output;
}
async function refreshFolder({ restoreFolders = false } = {}) {
  if (restoreFolders) state.removedFolders.clear();
  if (!state.root) return;
  const listing = await api.scanFolder(state.root, { showHidden: state.showHidden });
  state.nodes = listing.nodes;
  state.files = collectFiles(filterRemovedFolders(state.nodes));
  renderTree();
  if (listing.truncated) showStatus('Explorer limited to first 8,000 files', 6000);
}
async function retryRemoteOperation(operation){
  if(operation.kind==='save'){
    const doc=state.tabs.find(doc=>doc.path===operation.file);
    if(!doc)throw new Error(tr('Open the affected file before retrying its save.'));
    return save(doc);
  }
  if(operation.kind==='read'){
    const data=await api.readFile(operation.file),existing=state.tabs.find(doc=>doc.path===operation.file);
    if(existing)setActive(existing.id);else addDocument(data.path,data.content,data.mtimeMs);
    return true;
  }
  if(operation.kind==='list'){
    await api.scanFolder(operation.file,{showHidden:state.showHidden});
    if(state.root===operation.root)await refreshFolder();
    return true;
  }
  return false;
}
async function openFolder(folder = null, {isCurrent=()=>true}={}) {
  const previousRoot = state.root;
  try {
    const p = folder || await api.chooseFolder();
    if (!p) return false;
    if (api.reopenWorkspace) await api.reopenWorkspace(p);
    const listing = await api.scanFolder(p, {showHidden:state.showHidden});
    const remoteInfo=await api.remoteInfo?.(p);
    if(!isCurrent())return false;
    state.root = p;
    void favouritesPanel?.refresh().catch(()=>{});
    markdownPanel?.refresh();
    applyWorkspaceSettings();
    projectSearch?.reset();
    state.removedFolders.clear(); state.expanded.clear(); state.expanded.add(p);
    state.nodes = listing.nodes; state.files = collectFiles(listing.nodes);
    $('project-name').textContent = basename(p).toUpperCase();
    $('btn-close-project').classList.remove('hidden');
    $('project-name').title = remoteInfo?.uri || p; $('window-title').textContent = remoteInfo?.uri || p;
    if (!state.sidebarOpen) toggleSidebar();
    renderTree(); persist();
    try { workspacePrefs.opened(p); recentWorkspaces?.render(); }
    catch (error) { showStatus(error.message, 6500); return true; }
    if (api.platform === 'web') window.dispatchEvent(new CustomEvent('jotta:workspace-opened', {detail:{root:p}}));
    if(listing.truncated)showStatus('Explorer limited to first 8,000 files',6000);
    else showStatus(`Opened ${basename(p)} · ${state.files.length} files`);
    return true;
  } catch (err) {
    if(!isCurrent())return false;
    if (api.reopenWorkspace && previousRoot) await api.reopenWorkspace(previousRoot, false).catch(() => {});
    showStatus(`Cannot open folder: ${err.message}`, 6500); return false;
  }
}
function projectEditorSettings() {
  return {indentMode:state.indentMode, tabSize:state.tabSize, wrap:state.wordWrap,
    formatOnSave:state.formatOnSave, formatWidth:state.formatWidth};
}
function updateProjectSettingsControls() {
  $('setting-project-settings').disabled = !state.root;
  $('setting-project-settings').checked = workspacePrefs.enabled(state.root);
  $('setting-project-path').textContent = state.root || tr('Open a folder to enable project settings.');
}
function applyWorkspaceSettings() {
  const settings = workspacePrefs.settings(state.root);
  state.indentMode = settings.indentMode; state.tabSize = settings.tabSize;
  state.wordWrap = settings.wrap; state.formatOnSave = settings.formatOnSave; state.formatWidth = settings.formatWidth;
  for (const doc of state.tabs) applyIndentToModel(doc.model);
  editorLayout?.updateOptions({tabSize:state.tabSize, insertSpaces:state.indentMode === 'spaces', wordWrap:state.wordWrap ? 'on' : 'off'});
  $('setting-indent').value = state.indentMode; $('setting-tab-size').value = String(state.tabSize);
  $('setting-word-wrap').checked = state.wordWrap; $('setting-format-save').checked = state.formatOnSave;
  $('setting-format-width').value = state.formatWidth;
  updateProjectSettingsControls(); updateStatus();
}
function updateSidebarToggle() {
  const button = $('btn-sidebar');
  const icon = $('sidebar-toggle-icon');
  const action = state.sidebarOpen ? 'Hide sidebar (Ctrl+B)' : 'Show sidebar (Ctrl+B)';
  icon.src = interfaceAssetUrl(state.sidebarOpen
    ? '/ui-icons/sidebar-fold.svg'
    : '/ui-icons/sidebar-unfold.svg');
  button.title = tr(action);
  button.setAttribute('aria-label', tr(action));
  button.setAttribute('aria-expanded', String(state.sidebarOpen));
}
function toggleSidebar() {
  state.sidebarOpen = !state.sidebarOpen;
  $('sidebar').classList.toggle('hidden-sidebar', !state.sidebarOpen);
  $('splitter').classList.toggle('hidden-sidebar', !state.sidebarOpen);
  updateSidebarToggle();
  remember('sidebar', String(state.sidebarOpen));
  editorLayout?.layout();
}
function toggleMinimap() {
  state.minimap = !state.minimap;
  remember('minimap', String(state.minimap));
  editorLayout.updateOptions({ minimap: { enabled: state.minimap } });
  showStatus(`Minimap ${state.minimap ? 'enabled' : 'disabled'}`);
}
function setWordWrap(enabled) {
  state.wordWrap = Boolean(enabled);
  remember('wrap', String(state.wordWrap));
  editorLayout.updateOptions({ wordWrap: state.wordWrap ? 'on' : 'off' });
  const checkbox = document.getElementById('setting-word-wrap');
  if (checkbox) checkbox.checked = state.wordWrap;
  showStatus(`Word wrap ${state.wordWrap ? 'enabled' : 'disabled'}`);
}
function toggleWrap() { setWordWrap(!state.wordWrap); }
function applyIndentToModel(model) {
  model.updateOptions({ tabSize: state.tabSize, indentSize: state.tabSize, insertSpaces: state.indentMode === 'spaces' });
}
function applyIndentation() {
  for (const doc of state.tabs) applyIndentToModel(doc.model);
  remember('tabSize', state.tabSize);
  remember('indentMode', state.indentMode);
  editorLayout.updateOptions({ tabSize: state.tabSize, insertSpaces: state.indentMode === 'spaces' });
  updateStatus();
}
function applyExplorerTypography() {
  state.explorerFontSize = boundedExplorerSize(state.explorerFontSize);
  const sidebar = $('sidebar');
  sidebar.style.setProperty('--explorer-font-size', `${state.explorerFontSize}px`);
  sidebar.style.setProperty('--explorer-icon-size', `${Math.round(state.explorerFontSize * 1.14)}px`);
  sidebar.style.setProperty('--explorer-row-height', `${Math.max(25, Math.round(state.explorerFontSize * 1.95))}px`);
  remember('explorerFontSize', state.explorerFontSize);
}
function adjustExplorerFont(delta) {
  state.explorerFontSize = boundedExplorerSize(state.explorerFontSize + delta);
  applyExplorerTypography();
  showStatus(`Explorer: ${state.explorerFontSize}px`);
}
function explorerZoomTarget(event) {
  // An Explorer control/row has keyboard focus, or the pointer is over it.
  return Boolean(event?.target?.closest?.('#sidebar') || document.activeElement?.closest?.('#sidebar') || $('sidebar').matches(':hover'));
}
function setupExplorerZoom() {
  const sidebar = $('sidebar');
  let accumulated = 0;
  sidebar.addEventListener('wheel', event => {
    if (!event.ctrlKey || event.altKey) return;
    event.preventDefault();
    event.stopPropagation();
    const dy = event.deltaY * (event.deltaMode === 1 ? 36 : event.deltaMode === 2 ? 600 : 1);
    accumulated += dy;
    const threshold = 40;
    if (Math.abs(accumulated) >= threshold) {
      const steps = Math.min(3, Math.floor(Math.abs(accumulated) / threshold));
      adjustExplorerFont((accumulated < 0 ? 1 : -1) * steps);
      accumulated -= Math.sign(accumulated) * threshold * steps;
    }
  }, { capture: true, passive: false });
}
function applyUiTypography() {
  state.uiFontFamily = String(state.uiFontFamily || 'Rubik').replace(/[\"\\]/g, '').trim().slice(0,65) || 'Rubik';
  document.documentElement.style.setProperty('--ui-font-family', `"${state.uiFontFamily}", system-ui, sans-serif`);
  remember('uiFontFamily', state.uiFontFamily);
  state.uiFontSize = boundedUiSize(state.uiFontSize);
  document.documentElement.style.setProperty('--ui-font-size', `${state.uiFontSize}px`);
  remember('uiFontSize', state.uiFontSize);
}
function applyTypography() {
  const fontSize = boundedSize(state.fontSize);
  state.fontSize = fontSize;
  const lineHeight = Math.round(fontSize * state.lineHeightRatio);
  // Keep the width of wrapped lines proportional to the glyph size as zoom changes.
  const wrapColumn = Math.max(55, Math.round(100 * 14 / fontSize));
  editorLayout.updateOptions({
    fontFamily: fontCss(state.fontFamily), fontSize, lineHeight,
    letterSpacing: Math.max(0, Math.round((fontSize - 14) * .06 * 100) / 100),
    wordWrapColumn: wrapColumn, wrappingIndent: 'same',
    padding: { top: Math.max(12, Math.round(lineHeight * .65)), bottom: Math.max(12, Math.round(lineHeight * .65)) }
  });
  editorLayout?.layout();
  remember('fontsize', state.fontSize);
  remember('fontFamily', state.fontFamily);
  remember('lineHeightRatio', state.lineHeightRatio);
}
function adjustFont(delta) {
  state.fontSize = boundedSize(state.fontSize + delta);
  applyTypography();
  if (!$('settings-overlay').classList.contains('hidden')) $('setting-size').value = String(state.fontSize);
}
function applyPlainTextHighlights() {
  if (!editor) return;
  editor.updateOptions(plainTextHighlightOptions(editor.getModel()?.getLanguageId(), state.plainTextHighlights));
}
function updateStatus() {
  applyPlainTextHighlights();
  const doc = activeDocument();
  const pos = editor?.getPosition();
  $('status-position').textContent = pos ? `Ln ${pos.lineNumber}, Col ${pos.column}` : 'Ln 1, Col 1';
  $('status-language').textContent = doc ? tr(titleCase(doc.model.getLanguageId())) : tr('Plain Text');
  $('status-indent').textContent = `${tr(state.indentMode === 'spaces' ? 'Spaces' : 'Tabs')}: ${state.tabSize}`;
  $('status-format').textContent = tr(state.formatOnSave ? 'Fmt Save: On' : 'Fmt Save: Off');
  $('status-format').title = tr('Toggle format on save');
}

function toggleFormatOnSave() {
  state.formatOnSave = !state.formatOnSave;
  remember('formatOnSave', String(state.formatOnSave));
  updateStatus();
  showStatus(`Format on save ${state.formatOnSave ? 'enabled' : 'disabled'}`);
}

async function formatDocument(doc = activeDocument(), { quiet = false } = {}) {
  if (!doc) return false;
  const model = doc.model;
  const language = model.getLanguageId();
  if (!formatLanguages.has(language)) {
    if (!quiet) showStatus(`No formatter installed for ${titleCase(language)}`, 4500);
    return false;
  }
  try {
    const original = model.getValue();
    const formatted = await formatCode(original, {
      language, filename: doc.path || doc.name, printWidth: state.formatWidth, tabWidth: model.getOptions().tabSize,
      useTabs: !model.getOptions().insertSpaces
    });
    if (formatted == null || formatted === original) {
      if (!quiet) showStatus('Already formatted');
      return true;
    }
    // Never replace edits made while a slow formatting plugin was loading.
    if (model.isDisposed() || model.getValue() !== original) {
      if (!quiet) showStatus('Formatting cancelled: document changed');
      return false;
    }
    const edits = [{ range: model.getFullModelRange(), text: formatted }];
    if (doc.id === state.active) {
      editor.pushUndoStop();
      editor.executeEdits('jotta.prettier', edits);
      editor.pushUndoStop();
    } else model.pushEditOperations([], edits, () => null);
    if (!quiet) showStatus(`Formatted ${doc.name}`);
    return true;
  } catch (error) {
    showStatus(`Formatter error: ${error.message}`, 7500);
    return false;
  }
}

function registerFormatting() {
  for (const language of formatLanguages) {
    monaco.languages.registerDocumentFormattingEditProvider(language, {
      async provideDocumentFormattingEdits(model, options) {
        const source = model.getValue();
        try {
          const formatted = await formatCode(source, {
            language, filename: model.uri.path, printWidth: state.formatWidth,
            tabWidth: options.tabSize, useTabs: !options.insertSpaces
          });
          if (!formatted || formatted === source || model.getValue() !== source) return [];
          return [{ range: model.getFullModelRange(), text: formatted }];
        } catch (error) { showStatus(`Formatter error: ${error.message}`, 7500); return []; }
      }
    });
  }
}

function findEmmetAbbreviation(explicit = false, editor = globalEditor()) {
  const model = editor?.getModel();
  const position = editor?.getPosition();
  if (!model || !position || editor.getSelections().length !== 1 || !editor.getSelection().isEmpty()) return null;
  const line = model.getLineContent(position.lineNumber);
  const lang = model.getLanguageId();
  const doc = state.tabs.find(doc => doc.model === model);
  // For PHP, inspect the entire preceding document to avoid inserting tags
  // inside PHP code opened several lines before the cursor.
  const prefix = lang === 'php' ? model.getValue().slice(0, model.getOffsetAt(position)) : line.slice(0, position.column - 1);
  const found = abbreviationAt(line, position.column - 1, lang, doc?.path || doc?.name || '', explicit, prefix);
  return found && { found, line, position };
}

function expandEmmetAbbreviation(explicit = false) {
  const current = findEmmetAbbreviation(explicit);
  if (!current) { if (explicit) showStatus('No Emmet abbreviation at cursor'); return false; }
  const { found, line, position } = current;
  const range = new monaco.Range(position.lineNumber, found.start + 1, position.lineNumber, found.end + 1);
  const insertion = insertionForExpansion(indentedExpansion(found, line));
  const model = editor.getModel();
  const startOffset = model.getOffsetAt(range.getStartPosition());
  editor.pushUndoStop();
  editor.executeEdits('jotta.emmet', [{ range, text: insertion.text }]);
  editor.setPosition(model.getPositionAt(startOffset + insertion.caretOffset));
  editor.pushUndoStop();
  editor.focus();
  return true;
}

function globalEditor() { return editor; }
let emmetProvidersInstalled = false;
function setupEmmet(editor) {
  if (!emmetProvidersInstalled) for (const lang of ['html', 'php', 'xml', 'css', 'scss', 'less', 'javascript', 'typescript']) {
    monaco.languages.registerCompletionItemProvider(lang, {
      triggerCharacters: ['.', '#', '>', '+', '*', ':'],
      provideCompletionItems(model, position) {
        const line = model.getLineContent(position.lineNumber);
        const file = model.uri.path;
        const prefix = lang === 'php' ? model.getValue().slice(0, model.getOffsetAt(position)) : null;
        const found = abbreviationAt(line, position.column - 1, lang, file, false, prefix);
        if (!found) return { suggestions: [] };
        return { suggestions: [{
          label: `${found.abbreviation} (Emmet)`,
          filterText: found.abbreviation,
          detail: 'Expand abbreviation with Emmet',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: snippetForExpansion(indentedExpansion(found, line)),
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range: new monaco.Range(position.lineNumber, found.start + 1, position.lineNumber, found.end + 1),
          sortText: '000-emmet'
        }] };
      }
    });
  }
  emmetProvidersInstalled = true;
  const emmetContext = editor.createContextKey('jottaEmmetExpandable', false);
  const refresh = () => emmetContext.set(Boolean(findEmmetAbbreviation(false, editor)));
  editor.onDidChangeCursorPosition(refresh);
  editor.onDidChangeCursorSelection(refresh);
  editor.onDidChangeModelContent(refresh);
  editor.onDidChangeModel(refresh);
  editor.addAction({
    id: 'jotta.prettier.formatDocument', label: 'Format Document',
    keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF],
    precondition: 'editorTextFocus', run: () => formatDocument()
  });
  editor.addAction({
    id: 'jotta.emmet.expandTab', label: 'Emmet: Expand Abbreviation (Tab)',
    keybindings: [monaco.KeyCode.Tab],
    precondition: 'editorTextFocus && jottaEmmetExpandable && !suggestWidgetVisible && !inSnippetMode',
    run: () => expandEmmetAbbreviation()
  });
  editor.addAction({
    id: 'jotta.emmet.expandExplicit', label: 'Emmet: Expand Abbreviation',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyE],
    precondition: 'editorTextFocus',
    run: () => expandEmmetAbbreviation(true)
  });
  refresh();
}


function fuzzyScore(text, query) {
  if (!query) return 0;
  text = text.toLocaleLowerCase(); query = query.toLocaleLowerCase();
  const direct = text.indexOf(query);
  if (direct !== -1) return 2000 - direct * 3 - text.length * 0.1;
  let score = 0, at = 0, prev = -2;
  for (const char of query) {
    const i = text.indexOf(char, at);
    if (i === -1) return -Infinity;
    score += i === prev + 1 ? 18 : 5;
    if (i === 0 || '/._-'.includes(text[i - 1])) score += 25;
    at = i + 1; prev = i;
  }
  return score - text.length * .12;
}
const commands = [
  {label:'Document outline',description:'',run:()=>outlinePanel.show()},
  ...(api.getRemoteActivity?[{label:'Remote connections',description:'',run:()=>remoteConnectionPanel.show()}]:[]),
  ...(api.startPreview ? [{ label: 'Open Live Preview', description: '', run: startLivePreview }] : []),
  ...(api.stopPreview ? [{ label: 'Stop Live Preview', description: '', run: stopLivePreview }] : []),
  ...(api.downloadFile ? [{ label: 'Download file', description: '', run: downloadActiveFile }] : []),
  { label: 'New file', description: 'Ctrl+N', run: () => addDocument(null) },
  { label: 'New Markdown file', description: '', run:newMarkdown },
  { label: 'Markdown preview', description:'Ctrl+Shift+V', run:()=>markdownPanel.toggle() },
  { label: 'Export Markdown as HTML', description:'', run:()=>markdownPanel.export('html') },
  { label: 'Export Markdown as PDF', description:'', run:()=>markdownPanel.export('pdf') },
  { label: 'Open file…', description: 'Ctrl+O', run: chooseFile },
  { label: 'Favourites…', description: '', run: () => favouritesPanel.open() },
  { label: 'Recent Workspaces…', description: '', run: () => recentWorkspaces.open() },
  { label: 'Open folder…', description: 'Ctrl+Shift+O', run: () => openFolder() },
  ...(api.connectRemoteFolder ? [{label:'Open Remote Folder…',description:'FTP / SFTP / SMB',run:()=>remoteFoldersPanel.open()}] : []),
  { label: 'Save file', description: 'Ctrl+S', run: () => save() },
  { label: 'Save as…', description: 'Ctrl+Shift+S', run: () => save(activeDocument(), true) },
  { label: 'Close file', description: 'Ctrl+W', run: () => activeDocument() && closeDocument(state.active) },
  { label: 'Split editor', description: 'Ctrl+\\', run: () => editorLayout.toggleSplit() },
  { label: 'Local History…', description: '', run: () => localHistoryPanel.open() },
  { label: 'Compare with saved version', description: '', run: () => editorLayout.compareSaved(activeDocument()) },
  { label: 'Close comparison', description: '', run: () => editorLayout.closeComparison() },
  { label: 'Toggle sidebar', description: 'Ctrl+B', run: toggleSidebar },
  { label: 'Replace in project', description: 'Ctrl+Shift+H', run: () => projectSearch.show(true) },
  { label: 'Find in project', description: 'Ctrl+Shift+F', run: () => projectSearch.show() },
  { label: 'Go to line', description: 'Ctrl+G', run: () => showPalette('line') },
  { label: 'Change language mode', description: '', run: () => showPalette('language') },
  { label: 'Toggle minimap', description: '', run: toggleMinimap },
  { label: 'Toggle word wrap', description: 'Alt+Z', run: toggleWrap },
  { label: 'Toggle light/dark theme', description: '', run: () => setTheme(state.theme === 'dark' ? 'light' : 'dark') },
  { label: 'Increase font size', description: 'Ctrl++', run: () => adjustFont(1) },
  { label: 'Decrease font size', description: 'Ctrl+-', run: () => adjustFont(-1) },
  { label: 'Format document', description: 'Shift+Alt+F', run: () => formatDocument() },
  { label: 'Toggle format on save', description: '', run: toggleFormatOnSave },
  { label: 'Preferences…', description: 'Ctrl+,', run: openSettings },
  { label: 'Edit colour at cursor', description: 'Ctrl+Alt+C', run: () => editor.getAction('jotta.edit.colour')?.run() },
  { label: 'About Jotta Edit', description: '', run: openAbout },
  { label: 'Emmet: Expand abbreviation', description: 'Tab / Ctrl+Alt+E', run: () => expandEmmetAbbreviation(true) },
  { label: 'Find in file', description: 'Ctrl+F', run: () => editor.getAction('actions.find')?.run() },
  { label: 'Replace in file', description: 'Ctrl+H', run: () => editor.getAction('editor.action.startFindReplaceAction')?.run() }
];
const languages = ['plaintext','javascript','typescript','json','html','css','scss','python','php','go','rust','c','cpp','java','sql','shell','markdown','yaml','xml','ruby','lua','kotlin','swift'];
function showPalette(mode) {
  if (mode === 'files' && !state.files.length && !state.tabs.length) { showStatus('Open a folder or file first'); return; }
  state.palette = mode; state.paletteIndex = 0;
  $('overlay').classList.remove('hidden'); $('overlay').setAttribute('aria-hidden', 'false');
  $('palette-input').value = '';
  $('palette-symbol').textContent = ({ files: '⌕', commands: '›', line: ':', language: '⌘', search: '⌕' })[mode];
  $('palette-input').placeholder = tr(({ files: 'Go to file…', commands: 'Type a command…', line: 'Go to line number…', language: 'Select language…', search: 'Search text in project (at least 2 characters)…' })[mode]);
  fillPalette();
  $('palette-input').focus();
}
function hidePalette() {
  state.palette = null; state.queryId++;
  $('overlay').classList.add('hidden'); $('overlay').setAttribute('aria-hidden', 'true');
  editor.focus();
}
function paletteEntry(title, subtitle, action, extra = '') { return { title, subtitle, action, extra }; }
async function fillPalette() {
  const mode = state.palette;
  if (!mode) return;
  const query = $('palette-input').value.trim();
  let list = [];
  if (mode === 'files') {
    const paths = [...new Set([...state.tabs.filter(t => t.path).map(t => t.path), ...state.files])];
    list = paths.map(p => paletteEntry(basename(p), relative(p), () => openFile(p), p));
  } else if (mode === 'commands') {
    list = commands.map(c => paletteEntry(tr(c.label), c.description, c.run));
  } else if (mode === 'language') {
    list = languages.map(l => paletteEntry(titleCase(l), l, () => {
      const doc = activeDocument(); if (doc) { doc.languagePinned=true;monaco.editor.setModelLanguage(doc.model, l); updateStatus(); }
    }));
  } else if (mode === 'line') {
    const number = Number.parseInt(query, 10);
    if (number > 0) list = [paletteEntry(`Go to line ${number}`, '', () => {
      if (!getEditorModel()) return;
      const line = Math.min(number, getEditorModel().getLineCount());
      editor.setPosition({ lineNumber: line, column: 1 }); editor.revealLineInCenter(line);
    })];
  } else if (mode === 'search') {
    const request = ++state.queryId;
    if (query.length >= 2 && state.root) {
      const nodes = await api.searchProject(state.root, query).catch(() => []);
      if (request !== state.queryId || state.palette !== 'search') return;
      list = nodes.map(x => paletteEntry(`${relative(x.path)}:${x.line}`, x.preview, () => openFile(x.path, { line: x.line })));
    }
  }
  if (mode !== 'search') {
    list = list.map(item => ({ ...item, score: fuzzyScore(`${item.title} ${item.extra} ${item.subtitle}`, query) }))
      .filter(item => item.score !== -Infinity).sort((a, b) => b.score - a.score).slice(0, 100);
  }
  state.paletteItems = list;
  state.paletteIndex = 0;
  renderPaletteList();
}
function renderPaletteList() {
  const list = $('palette-list'); list.replaceChildren();
  if (!state.paletteItems.length) {
    const empty = document.createElement('div'); empty.className = 'palette-empty';
    empty.textContent = tr(state.palette === 'search' && !state.root ? 'Open a project folder first.' : 'No matches');
    list.append(empty); return;
  }
  for (const [index, item] of state.paletteItems.entries()) {
    const row = document.createElement('button'); row.className = `palette-item${index === state.paletteIndex ? ' active' : ''}`;
    const title = document.createElement('span'); title.className = 'palette-item-title'; title.textContent = item.title;
    const detail = document.createElement('span'); detail.className = 'palette-item-detail'; detail.textContent = item.subtitle;
    row.append(title);
    if (item.subtitle) row.append(detail);
    row.addEventListener('mouseenter', () => { state.paletteIndex = index; updatePaletteSelection(); });
    row.addEventListener('click', () => activatePalette());
    list.append(row);
  }
}
function updatePaletteSelection() {
  [...$('palette-list').children].forEach((row, i) => row.classList.toggle('active', i === state.paletteIndex));
  $('palette-list').children[state.paletteIndex]?.scrollIntoView({ block: 'nearest' });
}
function activatePalette() {
  const item = state.paletteItems[state.paletteIndex];
  if (!item) return;
  hidePalette();
  Promise.resolve(item.action()).catch(err => showStatus(err.message));
}
function setupPathCompletion() {
  for (const lang of ['html','xml','css','scss','less','javascript','typescript','php','json']) {
    monaco.languages.registerCompletionItemProvider(lang, {
      triggerCharacters: ['/', '.', '"', "'", '`'],
      async provideCompletionItems(model, position, _context, token) {
        const ctx = pathContext(model.getLineContent(position.lineNumber), position.column, lang);
        if (!ctx || token.isCancellationRequested) return { suggestions: [] };
        const doc = state.tabs.find(t => t.model === model);
        if (!doc?.path && !state.root) return { suggestions: [] };
        const files = await api.completePath({file: doc?.path || null, root: state.root, typed: ctx.typed}).catch(() => []);
        if (token.isCancellationRequested) return { suggestions: [] };
        const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
          startColumn: ctx.startColumn, endColumn: ctx.endColumn };
        return { suggestions: filterPathItems(files, ctx.segment).map(item => ({
          label: item.label, insertText: item.insertText, range,
          kind: item.dir ? monaco.languages.CompletionItemKind.Folder : monaco.languages.CompletionItemKind.File,
          detail: item.dir ? 'Project folder' : 'Project file',
          sortText: (item.dir ? '0' : '1') + item.label.toLowerCase(),
          command: item.dir ? { id: 'editor.action.triggerSuggest', title: 'Continue path completion' } : undefined
        })) };
      }
    });
  }
}
function setupCompletion() {
  setupPathCompletion();
  monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true);
  monaco.languages.typescript.javascriptDefaults.setEagerModelSync(true);
  const snippets = {
    python: [['def', 'def ${1:name}(${2:args}):\n    ${0:pass}'], ['class', 'class ${1:Name}:\n    def __init__(self${2:, args}):\n        ${0:pass}'], ['ifmain', "if __name__ == '__main__':\n    ${0:main()}"], ['for', 'for ${1:item} in ${2:items}:\n    ${0:pass}']],
    php: [['function', 'function ${1:name}(${2:args}) {\n    ${0}\n}'], ['foreach', 'foreach (${1:items} as ${2:item}) {\n    ${0}\n}']],
    go: [['func', 'func ${1:name}(${2:args}) ${3:error} {\n    ${0}\n}'], ['iferr', 'if err != nil {\n    return ${0:err}\n}']],
    rust: [['fn', 'fn ${1:name}(${2:args}) {\n    ${0}\n}'], ['match', 'match ${1:expr} {\n    ${0:_ => {}}\n}']],
    sql: [['select', 'SELECT ${1:*}\nFROM ${2:table}\nWHERE ${0:condition};']]
  };
  const keywords = {
    python: 'def class self import from as if elif else for while return yield async await try except finally with lambda pass raise True False None print range len str int list dict set tuple enumerate zip isinstance',
    php: 'function class public private protected static new namespace use return foreach if elseif else while try catch throw echo isset empty array require include null true false',
    go: 'package import func var const type struct interface map range return defer go select chan if else for switch case default nil true false make append len',
    rust: 'fn let mut pub use mod impl trait struct enum match if else while for in loop return async await Result Option Some None Ok Err self Self crate',
    sql: 'SELECT FROM WHERE JOIN LEFT RIGHT INNER OUTER GROUP BY ORDER HAVING LIMIT INSERT INTO VALUES UPDATE DELETE CREATE TABLE ALTER DROP DISTINCT AS AND OR NOT NULL',
    c: 'int void char float double long short unsigned signed const static struct typedef return if else while for switch case break continue sizeof',
    cpp: 'auto class struct template typename using namespace std public private protected virtual override const constexpr new delete return if else for while try catch',
    java: 'public private protected class static final void int String boolean return if else for while try catch new interface extends implements',
    shell: 'if then else elif fi for in do done function export local echo read case esac while until return source'
  };
  for (const lang of Object.keys(keywords)) {
    monaco.languages.registerCompletionItemProvider(lang, {
      triggerCharacters: ['.'],
      async provideCompletionItems(model, position) {
        const word = model.getWordUntilPosition(position);
        const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn };
        const seen = new Set();
        const suggestions = [];
        const add = (label, kind, insertText = label, insertTextRules = undefined) => {
          if (seen.has(label)) return;
          seen.add(label);
          suggestions.push({ label, kind, insertText, insertTextRules, range, sortText: kind === monaco.languages.CompletionItemKind.Snippet ? '0' + label : '1' + label });
        };
        for (const [label, body] of snippets[lang] || []) add(label, monaco.languages.CompletionItemKind.Snippet, body, monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet);
        for (const keyword of keywords[lang].split(' ')) add(keyword, monaco.languages.CompletionItemKind.Keyword);
        const tokens = model.getValue().match(/[A-Za-z_$][\w$]{2,}/g) || [];
        for (const token of tokens.slice(-12000)) if (seen.size < 500) add(token, monaco.languages.CompletionItemKind.Text);
        const doc = state.tabs.find(d => d.model === model);
        if (doc?.path) {
          const lspItems = await api.complete({
            root: state.root, file: doc.path, lang, content: model.getValue(),
            line: position.lineNumber, column: position.column
          }).catch(() => []);
          for (const item of lspItems) {
            if (!item.label) continue;
            const label = typeof item.label === 'string' ? item.label : item.label.label;
            const edit = item.textEdit;
            const text = edit?.newText || item.insertText || label;
            const editRange = edit?.range ? {
              startLineNumber: edit.range.start.line + 1,
              startColumn: edit.range.start.character + 1,
              endLineNumber: edit.range.end.line + 1,
              endColumn: edit.range.end.character + 1
            } : range;
            suggestions.push({
              label, insertText: text, range: editRange,
              kind: (item.kind === 3 ? monaco.languages.CompletionItemKind.Function :
                item.kind === 7 ? monaco.languages.CompletionItemKind.Class :
                item.kind === 6 ? monaco.languages.CompletionItemKind.Variable :
                monaco.languages.CompletionItemKind.Text),
              detail: item.detail || '',
              documentation: typeof item.documentation === 'string' ? item.documentation : (item.documentation?.value || ''),
              sortText: item.sortText || `0${label}`,
              insertTextRules: item.insertTextFormat === 2 ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined
            });
          }
        }
        return { suggestions };
      }
    });
  }
}
function setupKeyboard() {
  window.addEventListener('keydown', event => {
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (isModalOpen()) { if (event.key === 'Escape') { event.preventDefault(); closeModals(); } return; }
    if (state.palette) {
      if (event.key === 'Escape') { event.preventDefault(); hidePalette(); }
      if (event.key === 'ArrowDown') { event.preventDefault(); state.paletteIndex = (state.paletteIndex + 1) % Math.max(1, state.paletteItems.length); updatePaletteSelection(); }
      if (event.key === 'ArrowUp') { event.preventDefault(); state.paletteIndex = (state.paletteIndex + Math.max(1, state.paletteItems.length) - 1) % Math.max(1, state.paletteItems.length); updatePaletteSelection(); }
      if (event.key === 'Enter') { event.preventDefault(); activatePalette(); }
      return;
    }
    if (mod && key === ',') { event.preventDefault(); openSettings(); }
    else if (mod && key === '0') { event.preventDefault(); if (explorerZoomTarget(event)) { state.explorerFontSize = 14; applyExplorerTypography(); } else { state.fontSize = 14; applyTypography(); } }
    else if (mod && key === 'p') { event.preventDefault(); showPalette(event.shiftKey ? 'commands' : 'files'); }
    else if (mod && key === 'n') { event.preventDefault(); addDocument(null); }
    else if (mod && key === 'o') { event.preventDefault(); event.shiftKey ? openFolder() : chooseFile(); }
    else if (mod && key === 's') { event.preventDefault(); save(activeDocument(), event.shiftKey); }
    else if (mod && event.shiftKey && key === 'v' && activeDocument()?.model.getLanguageId()==='markdown') { event.preventDefault();event.stopPropagation();markdownPanel.toggle(); }
    else if (mod && key === 'w') { event.preventDefault(); if (state.active) closeDocument(state.active); }
    else if (mod && key === '\\') { event.preventDefault(); editorLayout.toggleSplit(); }
    else if (mod && key === 'b') { event.preventDefault(); toggleSidebar(); }
    else if (mod && key === 'g') { event.preventDefault(); showPalette('line'); }
    else if (mod && key === 'f' && event.shiftKey) { event.preventDefault(); projectSearch.show(); }
    else if (mod && key === 'h' && event.shiftKey) { event.preventDefault(); projectSearch.show(true); }
    else if (mod && key === 'tab') {
      event.preventDefault();
      if (state.tabs.length > 1) {
        const i = state.tabs.findIndex(d => d.id === state.active);
        selectDocument(state.tabs[(i + (event.shiftKey ? state.tabs.length - 1 : 1)) % state.tabs.length].id);
      }
    }
    else if (event.altKey && key === 'z') { event.preventDefault(); toggleWrap(); }
    else if (mod && (key === '=' || key === '+' || event.code === 'NumpadAdd')) { event.preventDefault(); explorerZoomTarget(event) ? adjustExplorerFont(1) : adjustFont(1); }
    else if (mod && (key === '-' || event.code === 'NumpadSubtract')) { event.preventDefault(); explorerZoomTarget(event) ? adjustExplorerFont(-1) : adjustFont(-1); }
  }, true);
}
function showModal(id) {
  closeCustomMenu();
  closeModals();
  const modal = $(id);
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}
function closeModals() {
  localHistoryPanel?.hide();
  remoteFoldersPanel?.hide();
  folderPicker?.hide();
  for (const id of ['settings-overlay', 'about-overlay', 'history-overlay', 'recent-workspaces-overlay', 'favourites-overlay', 'remote-overlay', 'folder-picker-overlay']) {
    $(id).classList.add('hidden'); $(id).setAttribute('aria-hidden', 'true');
  }
}
function isModalOpen() {
  return ['settings-overlay','about-overlay','history-overlay','recent-workspaces-overlay','favourites-overlay','remote-overlay','folder-picker-overlay'].some(id=>!$(id).classList.contains('hidden'));
}
function updateRestartNotice() {
  const changed = ($('setting-frame').value === 'native') !== state.nativeFrame;
  $('settings-restart').classList.toggle('hidden', !changed);
  $('frame-note').classList.toggle('hidden', !changed);
}
function openSettings() {
  updateProjectSettingsControls();
  $('setting-preview-browser').value = state.previewBrowser;
  updatePreviewBrowserIcon();
  $('setting-font').value = state.fontFamily;
  $('setting-ui-font').value = state.uiFontFamily;
  $('setting-size').value = String(state.fontSize);
  $('setting-ui-size').value = String(state.uiFontSize);
  $('setting-leading').value = String(state.lineHeightRatio);
  $('setting-indent').value = state.indentMode;
  $('setting-tab-size').value = String(state.tabSize);
  $('setting-frame').value = state.savedFramePreference ? 'native' : 'custom';
  $('setting-format-save').checked = state.formatOnSave;
  $('setting-word-wrap').checked = state.wordWrap;
  $('setting-color-display').value = state.colorDisplayMode;
  $('setting-plaintext-highlights').value = state.plainTextHighlights;
  $('setting-format-width').value = state.formatWidth;
  $('setting-hidden-files').checked = state.showHidden;
  $('setting-syntax-theme').value = state.syntaxTheme;
  refreshCustomThemeEditor();
  $('setting-icon-palette').value = state.explorerIconPalette;
  updateIconColourPreview();
  updateSyntaxThemePreview();
  $('setting-language').value = state.languagePreference;
  showModal('settings-overlay');
  settingsDrag?.reset();
  updateRestartNotice();
  document.querySelector('#settings-overlay .settings-dialog').focus({ preventScroll: true });
}
function openAbout() { showModal('about-overlay'); $('about-close').focus(); }
async function safelyRestart() {
  try { await flushSession(); await api.restartConfirmed(); }
  catch (error) { showStatus(`Cannot restart: session backup failed: ${error.message}`, 0); }
}

const menuSpecs = {
  File: [
    { label: 'New File', command: 'new', accelerator: 'Ctrl+N' },
    { label: 'New Markdown file', command: 'new-markdown' },
    { label: 'Open File…', command: 'open-file', accelerator: 'Ctrl+O' },
    { label: 'Open Folder…', command: 'open-folder', accelerator: 'Ctrl+Shift+O' },
    ...(api.connectRemoteFolder ? [{label:'Open Remote Folder…',command:'open-remote-folder'}] : []),
    { label: 'Favourites…', command: 'favourites' },
    { label: 'Recent Workspaces…', command: 'recent-workspaces' },
    { separator: true },
    { label: 'Save', command: 'save', accelerator: 'Ctrl+S' },
    { label: 'Save As…', command: 'save-as', accelerator: 'Ctrl+Shift+S' },
    { label: 'Local History…', command: 'local-history' },
    { label: 'Export Markdown as HTML', command: 'markdown-export-html', disabled:()=>activeDocument()?.model.getLanguageId()!=='markdown' },
    { label: 'Export Markdown as PDF', command: 'markdown-export-pdf', disabled:()=>activeDocument()?.model.getLanguageId()!=='markdown' },
    ...(api.downloadFile ? [{ label: 'Download file', command: 'download-file', disabled:() => !activeDocument() }] : []),
    { separator: true },
    { label: 'Close File', command: 'close-file', accelerator: 'Ctrl+W' },
    { label: 'Quit Jotta Edit', command: 'quit', accelerator: 'Ctrl+Q' }
  ],
  Edit: [
    { label: 'Undo', command: 'undo', accelerator: 'Ctrl+Z' },
    { label: 'Redo', command: 'redo', accelerator: 'Ctrl+Shift+Z' },
    { separator: true },
    { label: 'Cut', command: 'cut', accelerator: 'Ctrl+X' },
    { label: 'Copy', command: 'copy', accelerator: 'Ctrl+C' },
    { label: 'Paste', command: 'paste', accelerator: 'Ctrl+V' },
    { label: 'Select All', command: 'select-all', accelerator: 'Ctrl+A' },
    { separator: true },
    { label: 'Find', command: 'find', accelerator: 'Ctrl+F' },
    { label: 'Replace', command: 'replace', accelerator: 'Ctrl+H' },
    { label: 'Replace in Project…', command: 'replace-project', accelerator: 'Ctrl+Shift+H' },
    { separator: true },
    { label: 'Preferences…', command: 'settings', accelerator: 'Ctrl+,' }
  ],
  Selection: [
    { label: 'Select All', command: 'select-all', accelerator: 'Ctrl+A' },
    { label: 'Add Cursor Above', command: 'cursor-up', accelerator: 'Ctrl+Alt+↑' },
    { label: 'Add Cursor Below', command: 'cursor-down', accelerator: 'Ctrl+Alt+↓' }
  ],
  View: [
    {label:'Document outline',command:'document-outline'},
    ...(api.getRemoteActivity?[{label:'Remote connections',command:'remote-connections'}]:[]),
    { label:'Markdown preview',command:'markdown-preview',accelerator:'Ctrl+Shift+V',disabled:()=>activeDocument()?.model.getLanguageId()!=='markdown' },
    { label: 'Split Editor', command: 'split-editor', accelerator: 'Ctrl+\\' },
    { label: 'Compare with Saved Version', command: 'compare-saved' },
    { label: 'Close Comparison', command: 'close-comparison' },
    { label: 'Toggle Sidebar', command: 'sidebar', accelerator: 'Ctrl+B' },
    { label: 'Toggle Minimap', command: 'minimap', check: () => state.minimap },
    { label: 'Toggle Word Wrap', command: 'wrap', accelerator: 'Alt+Z', check: () => state.wordWrap },
    { label: 'Show Hidden Files', command: 'show-hidden', check: () => state.showHidden },
    { separator: true },
    { label: 'Increase Font Size', command: 'font-plus', accelerator: 'Ctrl++' },
    { label: 'Decrease Font Size', command: 'font-minus', accelerator: 'Ctrl+-' },
    { label: 'Reset Font Size', command: 'font-reset', accelerator: 'Ctrl+0' },
    { separator: true },
    { label: 'Toggle Dark/Light Theme', command: 'theme' }
  ],
  Go: [
    { label: 'Quick Open…', command: 'quick-open', accelerator: 'Ctrl+P' },
    { label: 'Go to Line…', command: 'goto-line', accelerator: 'Ctrl+G' },
    { label: 'Search in Project…', command: 'search-project', accelerator: 'Ctrl+Shift+F' }
  ],
  Tools: [
    { label: 'Open Live Preview', command: 'preview', disabled:() => !api.startPreview },
    { label: 'Stop Live Preview', command: 'preview-stop', disabled:() => !api.stopPreview },
    { label: 'Format Document', command: 'format', accelerator: 'Shift+Alt+F' },
    { label: 'Emmet: Expand Abbreviation', command: 'emmet', accelerator: 'Ctrl+Alt+E' },
    { label: 'Edit Colour at Cursor', command: 'edit-colour', accelerator: 'Ctrl+Alt+C' },
    { label: 'Toggle Format on Save', command: 'format-save', check: () => state.formatOnSave }
  ],
  Help: [
    { label: 'About Jotta Edit', command: 'about' }
  ]
};
let currentMenuLabel = null;
let menuCloseTimer;
function closeCustomMenu() {
  clearTimeout(menuCloseTimer); menuCloseTimer = null;
  const layer = $('menu-layer');
  layer.classList.add('hidden'); layer.setAttribute('aria-hidden', 'true'); layer.replaceChildren();
  document.querySelectorAll('#custom-menubar button').forEach(btn => btn.classList.remove('active-menu'));
  currentMenuLabel = null;
}
function openCustomMenu(label, anchor) {
  const layer = $('menu-layer');
  if (currentMenuLabel === label && !layer.classList.contains('hidden')) { closeCustomMenu(); return; }
  currentMenuLabel = label;
  document.querySelectorAll('#custom-menubar button').forEach(btn => btn.classList.toggle('active-menu', btn.dataset.menu === label));
  layer.replaceChildren();
  const panel = document.createElement('div'); panel.className = 'menu-panel';
  for (const item of (menuSpecs[label] || []).filter(item => !(api.platform === 'web' && item.command === 'quit'))) {
    if (item.separator) { const sep = document.createElement('div'); sep.className = 'menu-sep'; panel.append(sep); continue; }
    const button = document.createElement('button'); button.type = 'button'; button.className = 'menu-item';
    button.disabled = Boolean(item.disabled?.());
    const check = document.createElement('span'); check.className = 'menu-check'; check.textContent = item.check?.() ? '✓' : '';
    const text = document.createElement('span'); text.className = 'menu-label'; text.textContent = tr(item.label);
    const accel = document.createElement('span'); accel.className = 'menu-accel'; accel.textContent = item.accelerator || '';
    button.append(check, text, accel);
    button.addEventListener('click', () => { closeCustomMenu(); handleMenuCommand(item.command); });
    panel.append(button);
  }
  layer.append(panel); layer.classList.remove('hidden'); layer.setAttribute('aria-hidden', 'false');
  const rect = anchor.getBoundingClientRect();
  panel.style.left = `${Math.max(6, Math.min(innerWidth - panel.offsetWidth - 6, Math.round(rect.left)))}px`;
  panel.style.top = `${Math.round(rect.bottom + 2)}px`;
}
function setupCustomMenus() {
  document.querySelectorAll('#custom-menubar [data-menu]').forEach(item => {
    item.onclick = (event) => { event.stopPropagation(); openCustomMenu(item.dataset.menu, item); };
    item.addEventListener('pointerenter', () => {
      clearTimeout(menuCloseTimer); menuCloseTimer = null;
      if (currentMenuLabel && currentMenuLabel !== item.dataset.menu) openCustomMenu(item.dataset.menu, item);
    });
  });
  document.addEventListener('pointermove', event => {
    if (!currentMenuLabel) return;
    if (event.target.closest('#custom-menubar, .menu-panel')) { clearTimeout(menuCloseTimer); menuCloseTimer = null; }
    else if (!menuCloseTimer) menuCloseTimer = setTimeout(closeCustomMenu, 160);
  });
  document.addEventListener('pointerdown', event => {
    if (currentMenuLabel && !event.target.closest('#custom-menubar, .menu-panel')) closeCustomMenu();
  });
  document.addEventListener('pointerout', event => { if (!event.relatedTarget) closeCustomMenu(); });
  window.addEventListener('keydown', event => { if (event.key === 'Escape') closeCustomMenu(); });
  window.addEventListener('blur', closeCustomMenu);
}

// Interface palette overrides are independent for dark and light UI modes.
function refreshInterfaceColourEditor() {
  const grid = $('theme-ui-colours');
  grid.replaceChildren();
  $('theme-ui-mode-note').textContent = tr('Editing interface mode:') + ' ' + tr(state.theme === 'dark' ? 'Dark' : 'Light');
  for (const [key, label] of interfaceColourFields) {
    const current = state.interfaceColours[state.theme]?.[key] ||
      getComputedStyle(document.documentElement).getPropertyValue(`--${key}`).trim();
    const row = document.createElement('div'); row.className = 'theme-colour-row';
    const caption = document.createElement('label'); caption.textContent = tr(label);
    const input = document.createElement('input'); input.type = 'text'; input.maxLength=7;
    input.value = current; input.spellcheck=false;
    input.id = `theme-ui-colour-${key}`; input.setAttribute('aria-label', tr(label));
    caption.htmlFor = input.id;
    const swatch = document.createElement('button'); swatch.type='button';
    swatch.className='theme-colour-swatch'; swatch.style.backgroundColor=current;
    swatch.title = tr('Choose colour…') + ': ' + tr(label);
    swatch.setAttribute('aria-label', swatch.title);
    const update = (colour, mode = state.theme) => {
      if (!setInterfaceColour(state.interfaceColours, mode, key, colour)) {
        themeStatus('Enter a valid HEX colour'); return false;
      }
      remember('interfaceColours', JSON.stringify(state.interfaceColours));
      applyInterfaceColours(document.documentElement, state.interfaceColours, state.theme);
      refreshInterfaceColourEditor();
      themeStatus('Interface colours saved');
      return true;
    };
    swatch.onclick = () => {
      const rect=swatch.getBoundingClientRect(), mode=state.theme;
      colorEditor.openForChoice(current,{x:rect.right+10,y:rect.top}, colour => update(colour.slice(0,7),mode));
    };
    input.addEventListener('change', () => {
      if (!update(input.value.trim())) input.value=current;
    });
    row.append(caption,swatch,input); grid.append(row);
  }
}
function installInterfaceThemeEditor() {
  $('theme-ui-reset').onclick = () => {
    state.interfaceColours[state.theme] = {};
    remember('interfaceColours', JSON.stringify(state.interfaceColours));
    applyInterfaceColours(document.documentElement, state.interfaceColours, state.theme);
    refreshInterfaceColourEditor();
    themeStatus('Interface colours reset');
  };
  document.addEventListener('jotta:locale-changed', refreshInterfaceColourEditor);
  refreshInterfaceColourEditor();
}

// Custom theme editing uses the same colour popup as Explorer icon overrides.
function saveCustomThemes() {
  remember('customThemes', JSON.stringify(state.customThemes));
  setCustomSyntaxPalettes(state.customThemes);
  registerCustomSyntaxThemes(monaco);
  applySyntaxTheme();
}
function themeStatus(message) { $('theme-editor-status').textContent = tr(message); }
function refreshSyntaxThemeOptions() {
  const select = $('setting-syntax-theme');
  const selected = state.syntaxTheme;
  select.replaceChildren();
  for (const {id, label} of syntaxThemeChoices) {
    const option = new Option(tr(label), id);
    select.add(option);
  }
  for (const [id, theme] of Object.entries(state.customThemes)) {
    select.add(new Option(theme.name, id));
  }
  select.value = selected;
}
function updateCustomThemeField(key, value) {
  const id = state.syntaxTheme, entry = state.customThemes[id];
  if (!entry) return;
  const candidate = {...entry, palette:{...entry.palette, [key]:value}};
  const validated = validateCustomTheme(candidate);
  if (!validated) { themeStatus('Enter a valid HEX colour'); return; }
  state.customThemes[id] = validated;
  saveCustomThemes();
  refreshCustomThemeEditor();
  themeStatus('Theme saved');
}
function refreshCustomThemeEditor() {
  const id = state.syntaxTheme, entry = state.customThemes[id];
  $('theme-editor-fields').hidden = !entry;
  $('theme-delete-confirm').hidden = true;
  if (!entry) return;
  $('theme-custom-name').value = entry.name;
  $('theme-custom-mode').value = entry.palette.mode;
  const grid = $('theme-colour-grid');
  grid.replaceChildren();
  for (const [key, label] of CUSTOM_THEME_FIELDS) {
    const row = document.createElement('div'); row.className = 'theme-colour-row';
    const caption = document.createElement('label'); caption.textContent = tr(label);
    const input = document.createElement('input'); input.type = 'text'; input.maxLength = 7;
    input.value = entry.palette[key]; input.spellcheck = false;
    input.setAttribute('aria-label', tr(label));
    input.id = `theme-colour-${key}`;
    caption.htmlFor = input.id;
    const swatch = document.createElement('button');
    swatch.type = 'button'; swatch.className = 'theme-colour-swatch';
    swatch.style.backgroundColor = entry.palette[key];
    swatch.title = `${tr('Choose colour…')}: ${tr(label)}`;
    swatch.setAttribute('aria-label', swatch.title);
    swatch.addEventListener('click', () => {
      const rect = swatch.getBoundingClientRect();
      colorEditor.openForChoice(entry.palette[key], {x:rect.right + 12,y:rect.top},
        colour => updateCustomThemeField(key, colour.slice(0,7)));
    });
    input.addEventListener('change', () => {
      if (!/^#[0-9a-fA-F]{6}$/.test(input.value.trim())) {
        input.value = state.customThemes[id]?.palette[key] || entry.palette[key];
        themeStatus('Enter a valid HEX colour'); return;
      }
      updateCustomThemeField(key, input.value.trim());
    });
    row.append(caption, swatch, input);
    grid.append(row);
  }
}
function installCustomThemeEditor() {
  const select = $('setting-syntax-theme');
  refreshSyntaxThemeOptions();
  $('theme-duplicate').onclick = () => {
    const source = resolveSyntaxTheme(state.syntaxTheme, state.theme);
    const generated = createCustomTheme(state.customThemes, source, `${state.customThemes[source]?.name ||
      syntaxThemeChoices.find(item => item.id === source)?.label || 'Jotta'} copy`);
    if (!generated) { themeStatus('Maximum number of custom themes reached'); return; }
    state.customThemes[generated.id] = generated.theme;
    saveCustomThemes();
    state.syntaxTheme = generated.id;
    remember('syntaxTheme', state.syntaxTheme);
    refreshSyntaxThemeOptions();
    applySyntaxTheme(); refreshCustomThemeEditor();
    themeStatus('Custom theme created');
  };
  $('theme-custom-name').addEventListener('change', event => {
    const entry = state.customThemes[state.syntaxTheme];
    if (!entry) return;
    const checked = validateCustomTheme({...entry, name:event.target.value});
    if (!checked) { event.target.value = entry.name; themeStatus('Invalid theme name'); return; }
    state.customThemes[state.syntaxTheme] = checked;
    saveCustomThemes(); refreshSyntaxThemeOptions();
    themeStatus('Theme saved');
  });
  $('theme-custom-mode').addEventListener('change', event => updateCustomThemeField('mode', event.target.value));
  $('theme-reset').onclick = () => {
    const entry = state.customThemes[state.syntaxTheme];
    if (!entry) return;
    state.customThemes[state.syntaxTheme] = {...entry, palette:{...syntaxPalettes[entry.base],inheritSyntax:false}};
    saveCustomThemes(); refreshCustomThemeEditor(); themeStatus('Theme colours reset');
  };
  $('theme-delete').onclick = () => { $('theme-delete-confirm').hidden = false; };
  $('theme-delete-no').onclick = () => { $('theme-delete-confirm').hidden = true; };
  $('theme-delete-yes').onclick = () => {
    if (!state.customThemes[state.syntaxTheme]) return;
    const base = state.customThemes[state.syntaxTheme].base;
    delete state.customThemes[state.syntaxTheme];
    setCustomSyntaxPalettes(state.customThemes);
    state.syntaxTheme = base;
    remember('syntaxTheme', base);
    saveCustomThemes(); refreshSyntaxThemeOptions(); refreshCustomThemeEditor();
    themeStatus('Custom theme deleted');
  };
  $('theme-export').onclick = () => {
    const entry = state.customThemes[state.syntaxTheme];
    if (!entry) return;
    const blob = new Blob([exportCustomTheme(entry)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `${entry.name.replace(/[^a-z0-9_-]/gi,'-').slice(0,55) || 'jotta-theme'}.json`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    themeStatus('Theme exported');
  };
  $('theme-import').onclick = () => $('theme-import-file').click();
  $('theme-import-file').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 25000) throw new Error('Theme file too large');
      const incoming = importCustomTheme(await file.text());
      const source = createCustomTheme(state.customThemes, incoming.base, incoming.name);
      if (!source) throw new Error('Maximum number of custom themes reached');
      state.customThemes[source.id] = incoming;
      saveCustomThemes(); state.syntaxTheme = source.id;
      remember('syntaxTheme', state.syntaxTheme);
      refreshSyntaxThemeOptions(); applySyntaxTheme(); refreshCustomThemeEditor();
      themeStatus('Theme imported');
    } catch (error) { themeStatus(error.message); }
  });
  document.addEventListener('jotta:locale-changed', () => {
    refreshSyntaxThemeOptions(); refreshCustomThemeEditor();
  });
  refreshCustomThemeEditor();
}

function updatePreviewBrowserIcon() {
  const source = `${api.platform === 'web' ? '.' : ''}/ui-icons/${state.previewBrowser === 'default' ? 'default-browser' : state.previewBrowser}.svg`;
  $('preview-browser-icon').src = source;
  $('preview-toolbar-icon').src = source;
}
function selectPreviewBrowser(browser) {
  state.previewBrowser = browser;
  remember('previewBrowser', browser);
  $('setting-preview-browser').value = browser;
  updatePreviewBrowserIcon();
}
function setupPreviewBrowserMenu() {
  if (!api.startPreview) return;
  const menu = document.createElement('div');
  menu.className = 'preview-browser-menu explorer-context hidden';
  menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', tr('Live preview browser'));
  document.body.append(menu);
  const hide = () => { menu.classList.add('hidden'); $('btn-preview').setAttribute('aria-expanded', 'false'); };
  const show = event => {
    event.preventDefault(); closeCustomMenu(); hideExplorerContext();
    menu.replaceChildren();
    for (const [id, label] of [['default', 'System default'], ['firefox', 'Firefox'], ['chrome', 'Chrome']]) {
      const button = document.createElement('button'); button.type = 'button';
      button.setAttribute('role', 'menuitemradio'); button.setAttribute('aria-checked', String(state.previewBrowser === id));
      const icon = makeIcon(`/ui-icons/${id === 'default' ? 'default-browser' : id}.svg`);
      icon.className = 'button-icon';
      const caption = document.createElement('span'); caption.textContent = tr(label);
      const check = document.createElement('span'); check.textContent = state.previewBrowser === id ? '✓' : '';
      button.append(icon, caption, check);
      button.onclick = () => { selectPreviewBrowser(id); hide(); $('btn-preview').focus(); };
      menu.append(button);
    }
    menu.classList.remove('hidden'); $('btn-preview').setAttribute('aria-expanded', 'true');
    const anchor = $('btn-preview').getBoundingClientRect(), rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(5, Math.min(innerWidth - rect.width - 5, anchor.right - rect.width))}px`;
    menu.style.top = `${Math.max(5, Math.min(innerHeight - rect.height - 5, anchor.bottom + 3))}px`;
    menu.querySelector('[aria-checked="true"]').focus();
  };
  $('btn-preview').setAttribute('aria-haspopup', 'menu');
  $('btn-preview').setAttribute('aria-expanded', 'false');
  $('btn-preview').addEventListener('contextmenu', show);
  $('btn-preview').addEventListener('click', hide);
  $('btn-preview').addEventListener('keydown', event => { if (event.key === 'ArrowDown') show(event); });
  menu.addEventListener('keydown', event => {
    const buttons = [...menu.querySelectorAll('button')];
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); const i = buttons.indexOf(document.activeElement);
      buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (i + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length].focus();
    }
  });
  document.addEventListener('pointerdown', event => { if (!menu.contains(event.target) && !event.target.closest('#btn-preview')) hide(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !menu.classList.contains('hidden')) { hide(); $('btn-preview').focus(); } });
  window.addEventListener('blur', hide);
}
function setupDialogs() {
  updatePreviewBrowserIcon();
  setupPreviewBrowserMenu();
  $('setting-preview-browser').disabled = !api.startPreview;
  $('btn-preview').disabled = !api.startPreview;
  $('setting-preview-browser').addEventListener('change', event => {
    selectPreviewBrowser(event.target.value);
  });
  setupCustomMenus();
  installSettingsTabs(document.querySelector('#settings-overlay .settings-dialog'), $('settings-tabs'), {
    initial: stored('settingsTab', 'editor'),
    onChange: tab => remember('settingsTab', tab)
  });
  settingsDrag = installSettingsDragging(document.querySelector('#settings-overlay .settings-dialog'), $('settings-drag-handle'));
  for (const id of ['settings-close', 'settings-done', 'about-close', 'about-done']) $(id).onclick = closeModals;
  for (const id of ['settings-overlay', 'about-overlay', 'history-overlay', 'recent-workspaces-overlay', 'favourites-overlay']) $(id).addEventListener('mousedown', e => {
    if (e.target === $(id)) closeModals();
  });
  const fontMenu = installFontMenu($('setting-font'), $('font-toggle'), name => {
    state.fontFamily = name.trim() || 'Monospace';
    applyTypography();
  });
  const uiFontMenu = installFontMenu($('setting-ui-font'), $('ui-font-toggle'), name => {
    state.uiFontFamily = name.trim() || 'Rubik'; applyUiTypography();
  }, { fallback: 'Rubik', previewFamily: 'sans-serif' });
  // A floating system-font menu should not remain visible after switching tabs.
  $('settings-tabs').addEventListener('click', event => {
    if (event.target.closest('[data-settings-tab]')) { fontMenu.hide(); uiFontMenu.hide(); }
  });
  $('settings-tabs').addEventListener('keydown', event => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { fontMenu.hide(); uiFontMenu.hide(); }
  });
  const syntaxSelect = $('setting-syntax-theme');
  installCustomThemeEditor();
  installInterfaceThemeEditor();
  syntaxSelect.addEventListener('change', event => setSyntaxTheme(event.target.value));
  syntaxSelect.addEventListener('change', refreshCustomThemeEditor);
  const iconPaletteChoice = $('setting-icon-palette');
  for (const { id, label } of explorerIconPaletteChoices) {
    const option = document.createElement('option'); option.value = id; option.textContent = tr(label);
    iconPaletteChoice.append(option);
  }
  document.addEventListener('jotta:locale-changed', () => {
    for (const { id, label } of explorerIconPaletteChoices) {
      const option = [...iconPaletteChoice.options].find(item => item.value === id);
      if (option) option.textContent = tr(label);
    }
  });
  iconPaletteChoice.addEventListener('change', event => {
    state.explorerIconPalette = normalizeExplorerIconPalette(event.target.value);
    remember('explorerIconPalette', state.explorerIconPalette);
    renderTree(); renderTabs(); updateIconColourPreview();
  });
  const iconChoice = $('setting-icon-type');
  for (const [value,label] of iconTypes) {
    const option = document.createElement('option'); option.value = value; option.textContent = tr(label);
    iconChoice.append(option);
  }
  iconChoice.addEventListener('change', updateIconColourPreview);
  $('setting-icon-colour').addEventListener('click', () => {
    const key = iconChoice.value;
    if (!iconTypeNames.has(key)) return;
    const rect = $('setting-icon-colour').getBoundingClientRect();
    const starting = iconColourFor(`/file-icons/${key}`) || '#808080';
    colorEditor.openForChoice(starting, {x:rect.right+10,y:rect.top}, colour => saveIconColour(key, colour));
  });
  $('setting-icon-reset').onclick = () => saveIconColour(iconChoice.value, null);
  updateIconColourPreview();
  $('setting-ui-size').addEventListener('change', e => {
    state.uiFontSize = boundedUiSize(e.target.value);
    e.target.value = String(state.uiFontSize);
    applyUiTypography();
  });
  $('setting-size').addEventListener('change', e => {
    state.fontSize = boundedSize(e.target.value); e.target.value = String(state.fontSize); applyTypography();
  });
  $('setting-leading').addEventListener('change', e => {
    state.lineHeightRatio = Number(e.target.value); applyTypography();
  });
  $('setting-project-settings').addEventListener('change', event => {
    try { workspacePrefs.enable(state.root, event.target.checked, projectEditorSettings()); applyWorkspaceSettings(); }
    catch (error) { updateProjectSettingsControls(); showStatus(error.message, 6500); }
  });
  $('setting-indent').addEventListener('change', e => { state.indentMode = e.target.value; applyIndentation(); });
  $('setting-tab-size').addEventListener('change', e => { state.tabSize = Number(e.target.value); applyIndentation(); });
  $('setting-color-display').addEventListener('change', event => {
    state.colorDisplayMode = event.target.value === 'background' ? 'background' : 'swatch';
    remember('colorDisplayMode', state.colorDisplayMode);
    for (const picker of colorEditors.values()) picker.setDisplayMode(state.colorDisplayMode);
  });
  $('setting-word-wrap').addEventListener('change', e => setWordWrap(e.target.checked));
  $('setting-plaintext-highlights').addEventListener('change', e => {
    state.plainTextHighlights = normalizePlainTextHighlight(e.target.value);
    remember('plainTextHighlights', state.plainTextHighlights);
    applyPlainTextHighlights();
  });
  $('setting-format-width').addEventListener('change', e => {
    state.formatWidth = normalizeFormatterWidth(e.target.value);
    remember('formatWidth', state.formatWidth);
  });
  $('setting-format-save').addEventListener('change', e => { state.formatOnSave = e.target.checked; remember('formatOnSave', state.formatOnSave); updateStatus(); });
  $('setting-hidden-files').addEventListener('change', async e => { state.showHidden = e.target.checked; remember('showHidden', state.showHidden); if (state.root) await refreshFolder().catch(err => showStatus(err.message)); });
  $('setting-language').addEventListener('change', async e => {
    state.languagePreference = e.target.value; remember('languagePreference', state.languagePreference);
    configureLanguage(state.languagePreference, await api.systemLocale().catch(() => navigator.language || 'en'));
    updateSidebarToggle();
    api.menuLocale(locale()).catch(() => {});
    updateStatus(); renderTabs();
    $('status-message').textContent = tr('Ready');
  });
  $('setting-frame').addEventListener('change', async e => {
    try { const prefs = await api.setWindowPrefs({ nativeFrame: e.target.value === 'native' }); state.savedFramePreference = prefs.nativeFrame; updateRestartNotice(); }
    catch (err) { showStatus(`Window setting: ${err.message}`); }
  });
  $('settings-restart').onclick = safelyRestart;
  api.listFonts().then(fonts => { fontMenu.setFonts(fonts); uiFontMenu.setFonts(fonts); }).catch(() => {});
  $('settings-close').addEventListener('click', fontMenu.hide);
  $('settings-close').addEventListener('click', uiFontMenu.hide);
  $('settings-done').addEventListener('click', fontMenu.hide);
  $('settings-done').addEventListener('click', uiFontMenu.hide);
}
function handleMenuCommand(name) {
  const run = {
    'new': () => addDocument(null), 'open-file': chooseFile, 'open-folder': () => openFolder(),
    'document-outline':()=>outlinePanel?.show(),'remote-connections':()=>remoteConnectionPanel?.show(),
    'new-markdown':newMarkdown,'markdown-preview':()=>markdownPanel.toggle(),
    'markdown-export-html':()=>markdownPanel.export('html'),'markdown-export-pdf':()=>markdownPanel.export('pdf'),
    'open-remote-folder':()=>remoteFoldersPanel?.open(),
    'favourites': () => favouritesPanel.open(),
    'recent-workspaces': () => recentWorkspaces.open(),
    'download-file': downloadActiveFile, 'local-history': () => localHistoryPanel.open(),
    'save': () => save(), 'save-as': () => save(activeDocument(), true),
    'close-file': () => state.active && closeDocument(state.active), 'quit': closeApp,
    'undo': () => activeDocument()?.model.undo(), 'redo': () => activeDocument()?.model.redo(),
    'cut': () => document.execCommand?.('cut'), 'copy': () => document.execCommand?.('copy'), 'paste': async () => { try { const text = await navigator.clipboard.readText(); editor.trigger('keyboard','type',{text}); } catch {} },
    'select-all': () => editor.trigger('menu', 'editor.action.selectAll', null),
    'cursor-up': () => editor.trigger('menu', 'editor.action.insertCursorAbove', null),
    'cursor-down': () => editor.trigger('menu', 'editor.action.insertCursorBelow', null),
    'find': () => editor.getAction('actions.find')?.run(),
    'replace': () => editor.getAction('editor.action.startFindReplaceAction')?.run(),
    'preview': startLivePreview, 'preview-stop': stopLivePreview,
    'split-editor': () => editorLayout.toggleSplit(), 'compare-saved': () => editorLayout.compareSaved(activeDocument()),
    'close-comparison': () => editorLayout.closeComparison(),
    'settings': openSettings, 'about': openAbout, 'sidebar': toggleSidebar,
    'minimap': toggleMinimap, 'wrap': toggleWrap, 'font-plus': () => adjustFont(1),
    'font-minus': () => adjustFont(-1), 'font-reset': () => { state.fontSize = 14; applyTypography(); },
    'theme': () => setTheme(state.theme === 'dark' ? 'light' : 'dark'),
    'show-hidden': async () => { state.showHidden = !state.showHidden; remember('showHidden', state.showHidden); const box = document.getElementById('setting-hidden-files'); if (box) box.checked = state.showHidden; if (state.root) await refreshFolder().catch(err => showStatus(err.message)); },
    'quick-open': () => showPalette('files'), 'goto-line': () => showPalette('line'),
    'search-project': () => projectSearch.show(), 'replace-project': () => projectSearch.show(true), 'format': () => formatDocument(),
    'emmet': () => expandEmmetAbbreviation(true), 'format-save': toggleFormatOnSave,
    'edit-colour': () => editor.getAction('jotta.edit.colour')?.run()
  };
  if (isModalOpen() && !['about','settings','quit'].includes(name)) closeModals();
  if (name in run) run[name]();
}
async function applyProjectChanges(plans, root) {
  const changed = () => new Error(tr('Files changed. Search again before replacing.'));
  if (state.root !== root || plans.some(plan => !projectPathContains(root, plan.path))) throw changed();
  const existing = new Map(state.tabs.filter(doc => doc.path).map(doc => [doc.path, doc]));
  if (state.tabs.length + plans.filter(plan => !existing.has(plan.path)).length > 50) {
    throw new Error(tr('Too many open tabs. Close some tabs or select fewer files (maximum 50).'));
  }
  const prepared = [];
  for (const plan of plans) {
    const doc = existing.get(plan.path);
    const data = doc ? null : await api.readFile(plan.path);
    if ((doc ? doc.model.getValue() : data.content) !== plan.before) throw changed();
    prepared.push({plan, doc, data});
  }
  if (state.root !== root) throw changed();
  for (const {plan, doc} of prepared) {
    const current = state.tabs.find(tab => tab.path === plan.path);
    if ((doc && current !== doc) || (current && current.model.getValue() !== plan.before)) throw changed();
  }
  const snapshot = sessionSnapshot();
  for (const {plan} of prepared) {
    const tab = snapshot.tabs.find(tab => tab.path === plan.path);
    if (tab) { tab.text = plan.after; tab.dirty = true; }
    else snapshot.tabs.push({path:plan.path, name:basename(plan.path), text:plan.after, dirty:true});
  }
  snapshot.files = snapshot.tabs.filter(tab => tab.path).map(tab => tab.path);
  if (snapshot.tabs.length > 50) throw new Error(tr('Too many open tabs. Close some tabs or select fewer files (maximum 50).'));
  if (new TextEncoder().encode(JSON.stringify(snapshot)).length > 40 * 1024 * 1024 - 65536) {
    throw new Error(tr('Replacement is too large for session recovery. Select fewer files.'));
  }
  const active = state.active, batch = [];
  for (const {plan, data} of prepared) {
    const doc = state.tabs.find(tab => tab.path === plan.path) || addDocument(plan.path, plan.before, data.mtimeMs);
    doc.model.pushStackElement();
    doc.model.pushEditOperations([], [{range:doc.model.getFullModelRange(), text:plan.after}], () => null);
    doc.model.pushStackElement();
    batch.push({id:doc.id, model:doc.model, version:doc.model.getAlternativeVersionId()});
  }
  setActive(batch.some(item => item.id === active) ? active : batch[0].id);
  return batch;
}
async function undoProjectChanges(batch) {
  if (batch.some(item => !state.tabs.some(doc => doc.id === item.id && doc.model === item.model) || item.model.getAlternativeVersionId() !== item.version)) {
    throw new Error(tr('Files changed after replacement. Use Undo in each edited file.'));
  }
  await Promise.all(batch.map(item => item.model.undo()));
}
async function saveProjectChanges(batch) {
  let failed = false;
  for (const item of batch) {
    const doc = state.tabs.find(doc => doc.id === item.id);
    if (doc?.dirty && !await save(doc)) failed = true;
  }
  if (failed) throw new Error(tr('Some changed files could not be saved. Review the remaining unsaved tabs.'));
}
function setupProjectSearch() {
  projectSearch = installProjectSearch({api, getRoot:() => state.root,
    getDocuments:() => state.tabs.map(doc => ({path:doc.path, text:doc.model.getValue()})),
    openMatch:(path, match) => openFile(path, {line:match.line, column:match.column, length:match.end - match.start}),
    applyChanges:applyProjectChanges, undoChanges:undoProjectChanges, saveChanges:saveProjectChanges,
    revealSidebar:() => { if (!state.sidebarOpen) toggleSidebar(); }, focusEditor:() => editor.focus(),showView:view=>sidebarViews.show(view)});
}
function wireButtons() {
  const rootContext = event => { if (state.root) showExplorerContext(event, {path:state.root, dir:true}); };
  $('project-name').addEventListener('contextmenu', rootContext);
  $('file-tree').addEventListener('contextmenu', event => { if (!event.target.closest('.file-row')) rootContext(event); });
  $('btn-preview').onclick = startLivePreview;
  document.getElementById('web-download-file')?.addEventListener('click', downloadActiveFile);
  $('btn-minimize').onclick = () => api.windowAction('minimize');
  $('btn-maximize').onclick = () => api.windowAction('maximize');
  $('btn-close').onclick = closeApp;
  $('btn-add-folder').onclick = () => openFolder();
  $('btn-folder').onclick = () => openFolder();
  $('btn-open-file').onclick = chooseFile;
  $('btn-reload').onclick = () => refreshFolder({restoreFolders:true}).catch(e => showStatus(e.message));
  $('btn-close-project').onclick = () => state.root && removeFolderFromView(state.root);
  $('tabs').addEventListener('dblclick', event => {
    if (!event.target.closest('.tab')) addDocument(null);
  });
  $('btn-quick').onclick = () => showPalette('files');
  $('btn-palette').onclick = () => showPalette('commands');
  $('btn-split').onclick = () => editorLayout.toggleSplit();
  $('btn-compare').onclick = () => editorLayout.compareSaved(activeDocument());
  document.getElementById('web-save-file')?.addEventListener('click', () => save());
  document.getElementById('web-save-as')?.addEventListener('click', () => save(activeDocument(), true));
  $('btn-format').onclick = () => formatDocument();
  $('btn-sidebar').onclick = toggleSidebar;
  $('status-position').onclick = () => showPalette('line');
  $('status-language').onclick = () => showPalette('language');
  $('status-theme').onclick = () => setTheme(state.theme === 'dark' ? 'light' : 'dark');
  $('status-format').onclick = toggleFormatOnSave;
  $('status-indent').onclick = openSettings;
  $('palette-input').addEventListener('input', () => fillPalette());
  $('overlay').addEventListener('mousedown', e => { if (e.target === $('overlay')) hidePalette(); });
  const splitter = $('splitter'); let resizing = false;
  splitter.addEventListener('pointerdown', e => { resizing = true; splitter.setPointerCapture(e.pointerId); });
  splitter.addEventListener('pointermove', e => {
    if (!resizing) return;
    state.sidebarWidth = Math.max(140, Math.min(Math.floor(innerWidth * .55), e.clientX));
    $('sidebar').style.width = `${state.sidebarWidth}px`;
    editorLayout?.layout();
  });
  splitter.addEventListener('pointerup', () => { resizing = false; remember('sidebar-width', String(state.sidebarWidth)); });
  window.addEventListener('resize', () => editorLayout.layout());
}
function editorOptions() { return {
    model: null, automaticLayout: true, theme: resolveSyntaxTheme(state.syntaxTheme, state.theme),
    fontFamily: fontCss(state.fontFamily),
    fontSize: state.fontSize, lineHeight: Math.round(state.fontSize * state.lineHeightRatio), fontLigatures: true, smoothScrolling: true,
    minimap: { enabled: state.minimap, showSlider: 'mouseover', maxColumn: 90 },
    wordWrap: state.wordWrap ? 'on' : 'off', scrollBeyondLastLine: false, overviewRulerBorder: false,
    renderLineHighlight: 'line', lineNumbersMinChars: 3, glyphMargin: false, folding: true,
    stickyScroll: { enabled: false }, bracketPairColorization: { enabled: true },
    guides: { indentation: true, bracketPairs: false },
    cursorBlinking: 'smooth', cursorSmoothCaretAnimation: 'on', mouseWheelZoom: false,
    suggestOnTriggerCharacters: true, quickSuggestions: { other: true, comments: false, strings: true },
    acceptSuggestionOnEnter: 'on', inlineSuggest: { enabled: true },
    find: { addExtraSpaceOnTop: false, autoFindInSelection: 'never', seedSearchStringFromSelection: 'always' },
    fixedOverflowWidgets: true, colorDecorators: false, // Jotta Edit themed colour editor
    tabSize: state.tabSize, insertSpaces: state.indentMode === 'spaces', padding: { top: 14, bottom: 15 }
  }; }
function configureEditor(editor, host) {
  // Ctrl+wheel matches Ctrl++ / Ctrl+- without zooming Chromium's whole UI.
  let wheelAccum = 0;
  let lastZoomWheel = 0;
  const inputTarget = editorInputTarget(editor, host);
  // The Monaco view may not have a DOM node when created without a model.
  // Attach to the editor container instead of aborting app initialization.
  inputTarget.addEventListener('wheel', (event) => {
    if (!event.ctrlKey || event.altKey || event.shiftKey) return;
    event.preventDefault();
    event.stopPropagation();
    // Trackpads emit small events, while mouse wheels emit larger deltas.
    if (Date.now() - lastZoomWheel > 240) wheelAccum = 0;
    lastZoomWheel = Date.now();
    const delta = event.deltaY * (event.deltaMode === 1 ? 36 : event.deltaMode === 2 ? 600 : 1);
    wheelAccum += delta;
    const threshold = 45;
    if (Math.abs(wheelAccum) >= threshold) {
      const steps = Math.min(3, Math.floor(Math.abs(wheelAccum) / threshold));
      adjustFont((wheelAccum < 0 ? 1 : -1) * steps);
      wheelAccum -= Math.sign(wheelAccum) * steps * threshold;
    }
  }, { passive: false, capture: true });
  editor.onDidChangeCursorPosition(updateStatus);
  setupEmmet(editor);
  colorEditors.set(editor, installColorEditor(editor, monaco, message => showStatus(message, 4500), {displayMode:state.colorDisplayMode, host}));
  installTagUnderlining(editor, monaco);
}
async function initialize() {
  try {
    const prefs = await api.getWindowPrefs();
    state.nativeFrame = prefs.nativeFrame !== false;
    state.savedFramePreference = state.nativeFrame;
  } catch { state.nativeFrame = true; state.savedFramePreference = true; }
  document.body.classList.toggle('custom-frame', !state.nativeFrame);
  setTheme(state.theme);
  configureLanguage(state.languagePreference, await api.systemLocale().catch(() => navigator.language || 'en'));
  api.menuLocale(locale()).catch(() => {});
  applyUiTypography();
  applyExplorerTypography();
  setupExplorerZoom();
  $('sidebar').style.width = `${Math.max(140, Math.min(state.sidebarWidth, innerWidth * .55))}px`;
  $('sidebar').classList.toggle('hidden-sidebar', !state.sidebarOpen);
  $('splitter').classList.toggle('hidden-sidebar', !state.sidebarOpen);
  updateSidebarToggle();
  setupCompletion();
  registerFormatting();
  editor = monaco.editor.create($('editor'), editorOptions());
  configureEditor(editor, $('editor'));
  colorEditor = colorEditors.get(editor);
  editorLayout = installEditorLayout({monaco, primary:editor, host:$('editor'),
    getDocuments:() => state.tabs, options:editorOptions, configure:configureEditor, activate:activateEditor, tr, displayPath});
  sidebarViews=installSidebarViews({reveal:()=>{if(!state.sidebarOpen)toggleSidebar();}});
  outlinePanel=installDocumentOutline({monaco,sidebar:sidebarViews});outlinePanel.activate(activeDocument(),editor);
  markdownPanel=installMarkdownPanel({monaco,api,getRoot:()=>state.root,getEditor:()=>editor,getDocument:activeDocument,getDocuments:()=>state.tabs,
    openFile,layout:()=>editorLayout.layout(),format:formatDocument,notify:message=>showStatus(message,6500)});
  // Dynamic root: set its destination at drop time, because projects can change.
  const projectName = $('project-name');
  projectName.addEventListener('dragover', event => {
    if (draggingExplorerEntry && state.root && draggingExplorerEntry !== state.root) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }
  });
  projectName.addEventListener('drop', event => {
    if (!draggingExplorerEntry || !state.root) return;
    event.preventDefault(); const source = draggingExplorerEntry; draggingExplorerEntry=null;
    explorerOperation('move', source, state.root);
  });
  document.addEventListener('pointerdown', event => { if (!$('explorer-menu').contains(event.target)) hideExplorerContext(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hideExplorerContext(); });
  localHistoryPanel = installLocalHistory({api, getDocument:activeDocument, show:showModal, close:closeModals, displayPath,
    compare:(doc, revision) => editorLayout.compareSaved(doc, {text:revision.text,
      label:`${tr('Local History')} · ${new Date(revision.time).toLocaleString(locale())}`}),
    restore:(doc, text) => {
      setActive(doc.id);
      doc.model.pushStackElement();
      doc.model.pushEditOperations([], [{range:doc.model.getFullModelRange(), text}], () => null);
      doc.model.pushStackElement();
      showStatus(tr('Version restored into the editor. Save to keep it, or Undo to go back.'));
    }, notify:message => showStatus(message, 6500)});
  recentWorkspaces = installRecentWorkspaces({preferences:workspacePrefs, open:openFolder, show:showModal, close:closeModals});
  if(api.browseFolders){folderPicker=installFolderPicker({api,show:showModal,close:closeModals});api.chooseFolder=()=>folderPicker.choose();}
  remoteFoldersPanel=installRemoteFolders({api,show:showModal,close:closeModals,open:(root,isCurrent)=>openFolder(root,{isCurrent}),changed:()=>favouritesPanel?.refresh(),report:message=>showStatus(message,8000)});
  remoteConnectionPanel=installRemoteConnectionPanel({api,sidebar:sidebarViews,retry:retryRemoteOperation,notify:message=>showStatus(message,8000),reconnect:entry=>!entry?remoteFoldersPanel.open():entry.canReconnect?remoteFoldersPanel.reconnect(entry):remoteFoldersPanel.open({location:entry.uri})});
  favouritesPanel=installFavourites({api:api.listFavourites?api:{...api,...browserFavourites(localStorage)},show:showModal,close:closeModals,open:openFolder,choose:()=>api.chooseFolder(),current:()=>state.root,remote:entry=>remoteFoldersPanel.open(entry),report:message=>showStatus(message,6500)});
  $('btn-favourites').onclick=()=>favouritesPanel.open();
  $('btn-remote-folder').hidden=!api.connectRemoteFolder;
  $('btn-remote-folder').onclick=()=>remoteFoldersPanel.open();
  setupProjectSearch(); wireButtons(); setupKeyboard(); setupDialogs();
  if (api.platform === 'web') {
    window.addEventListener('beforeunload', event => {
      if (state.tabs.some(doc => doc.dirty)) { event.preventDefault(); event.returnValue = ''; }
    });
  }
  applyTypography();
  api.onMenuCommand(handleMenuCommand);
  api.onBeforeClose(closeApp);
  api.onOpenFile(file => openFile(file));
  try {
    const saved = await api.getSession();
    await restoreSavedSession(saved);
  } catch (err) { showStatus(`Session restore: ${err.message}`, 5500); }
  finally { sessionRestoreInProgress = false; }
  // Preserve any recovered buffers before processing new IPC file-open requests.
  await flushSession().catch(error => showStatus(`Session backup failed: ${error.message}`, 7500));
  updateStatus();
  if (api.platform === 'web') {
    window.addEventListener('jotta:web-open-folder', event => openFolder(event.detail.root));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSession().catch(console.warn); });
    window.addEventListener('pagehide', () => { flushSession().catch(console.warn); });
  }
  api.rendererReady();
}
initialize().catch(err => {
  // Always surface the original exception and stack in developer tools/terminal.
  console.error('Jotta Edit startup failed:', err?.stack || err);
  const message = `Startup error: ${err?.message || String(err)}`;
  const status = document.getElementById('status-message');
  if (status) { status.textContent = message; status.title = err?.stack || message; }
  else { const problem = document.createElement('pre'); problem.textContent = message; document.body.prepend(problem); }
});
