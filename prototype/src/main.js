import * as monaco from 'monaco-editor';
import EditorWorker from '../node_modules/monaco-editor/esm/vs/editor/editor.worker.js?worker';
import JsonWorker from '../node_modules/monaco-editor/esm/vs/language/json/json.worker.js?worker';
import CssWorker from '../node_modules/monaco-editor/esm/vs/language/css/css.worker.js?worker';
import HtmlWorker from '../node_modules/monaco-editor/esm/vs/language/html/html.worker.js?worker';
import TsWorker from '../node_modules/monaco-editor/esm/vs/language/typescript/ts.worker.js?worker';
import 'monaco-editor/min/vs/editor/editor.main.css';
import '@fontsource/rubik/400.css';
import '@fontsource/rubik/500.css';
import '@fontsource/rubik/600.css';

import { installColorProvider } from './colors-provider.js';
import { createGotoAnything } from './goto-anything.js';
import { setupEmmet } from './emmet-integration.js';
import { createLanguagePicker, languageLabel } from './language-picker.js';
import { setupSettings } from './settings.js';

self.MonacoEnvironment = {
  getWorker(_workerId, label) {
    if (label === 'json') return new JsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker();
    if (label === 'typescript' || label === 'javascript') return new TsWorker();
    return new EditorWorker();
  }
};

const LARGE_FILE_BYTES = 2 * 1024 * 1024;
const LANGUAGE_BY_EXT = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript', json: 'json', html: 'html', htm: 'html',
  css: 'css', scss: 'scss', less: 'less', php: 'php', py: 'python', md: 'markdown',
  xml: 'xml', yml: 'yaml', yaml: 'yaml', sh: 'shell', sql: 'sql', go: 'go',
  rs: 'rust', c: 'c', h: 'c', cpp: 'cpp', java: 'java'
};
function languageFor(name) {
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  return LANGUAGE_BY_EXT[ext] || 'plaintext';
}

const $ = id => document.getElementById(id);

const state = { root: null, fileIndex: [], tabs: [], activePath: null, untitledCount: 0 };

const editor = monaco.editor.create($('editor'), {
  automaticLayout: true,
  fontSize: 13,
  fontFamily: "'SF Mono', Menlo, Consolas, monospace",
  // Sublime's convention: Ctrl/Cmd+click adds a cursor. Monaco defaults that
  // gesture to "go to definition", which this prototype has no use for since
  // there is no language server here.
  multiCursorModifier: 'ctrlCmd',
  theme: 'vs-dark',
  minimap: { enabled: true },
  renderWhitespace: 'selection'
});
installColorProvider(monaco);
setupEmmet(editor, monaco);

function showStatus(message) {
  $('status-message').textContent = message;
  if (message) setTimeout(() => { if ($('status-message').textContent === message) $('status-message').textContent = ''; }, 4000);
}

function updateStatusBar() {
  const position = editor.getPosition();
  $('status-position').textContent = position ? `Ln ${position.lineNumber}, Col ${position.column}` : '';
  const model = editor.getModel();
  $('status-language').textContent = model ? languageLabel(model.getLanguageId()) : '';
}
editor.onDidChangeCursorPosition(updateStatusBar);
editor.onDidChangeModel(updateStatusBar);

function revealLine(line, column = 1) {
  editor.setPosition({ lineNumber: line, column });
  editor.revealLineInCenter(line);
  editor.focus();
}

function newTab({ path, name, content, large }) {
  const uri = path ? monaco.Uri.file(path) : monaco.Uri.parse(`untitled:Untitled-${++state.untitledCount}`);
  const model = monaco.editor.createModel(content, languageFor(name), uri);
  const tab = { path, name, model, large: Boolean(large), viewState: null };
  state.tabs.push(tab);
  return tab;
}

function renderTabs() {
  const strip = $('tab-strip');
  strip.replaceChildren();
  for (const tab of state.tabs) {
    const button = document.createElement('button');
    button.className = `tab${tab.path === state.activePath ? ' active' : ''}`;
    const title = document.createElement('span');
    title.textContent = tab.name;
    button.append(title);
    const close = document.createElement('span');
    close.className = 'tab-close';
    close.textContent = '×';
    close.addEventListener('click', event => { event.stopPropagation(); closeTab(tab.path); });
    button.append(close);
    button.addEventListener('click', () => activate(tab));
    strip.append(button);
  }
}

function activate(tab) {
  const previous = state.tabs.find(t => t.path === state.activePath);
  if (previous) previous.viewState = editor.saveViewState();
  state.activePath = tab.path;
  editor.setModel(tab.model);
  // Large files skip the expensive-to-compute decorations; everything else
  // about the editor (multi-cursor, search, Emmet, colour swatches) still works.
  editor.updateOptions({
    minimap: { enabled: !tab.large },
    folding: !tab.large,
    bracketPairColorization: { enabled: !tab.large }
  });
  if (tab.viewState) editor.restoreViewState(tab.viewState);
  editor.focus();
  renderTabs();
  updateStatusBar();
}

async function openFile(relativeOrAbsolute, line) {
  const absolute = state.root && !relativeOrAbsolute.startsWith('/') ? `${state.root}/${relativeOrAbsolute}` : relativeOrAbsolute;
  let tab = state.tabs.find(t => t.path === absolute);
  if (!tab) {
    let file;
    try { file = await window.api.readFile(absolute); }
    catch (error) { showStatus(`Could not open file: ${error.message}`); return; }
    tab = newTab(file);
    if (file.large) showStatus('Large file: minimap, folding and bracket colourisation are disabled for performance');
  }
  activate(tab);
  if (line) revealLine(line);
}

function closeTab(path) {
  const index = state.tabs.findIndex(t => t.path === path);
  if (index === -1) return;
  state.tabs[index].model.dispose();
  state.tabs.splice(index, 1);
  if (state.activePath !== path) { renderTabs(); return; }
  const next = state.tabs[Math.min(index, state.tabs.length - 1)];
  if (next) activate(next);
  else {
    state.activePath = null;
    editor.setModel(monaco.editor.createModel('', 'plaintext'));
    renderTabs();
    updateStatusBar();
  }
}

async function save() {
  const tab = state.tabs.find(t => t.path === state.activePath);
  if (!tab) return;
  let path = tab.path;
  if (!path) {
    path = await window.api.saveDialog(tab.name);
    if (!path) return;
    tab.path = path;
    tab.name = path.split('/').pop();
    monaco.editor.setModelLanguage(tab.model, languageFor(tab.name));
  }
  try { await window.api.writeFile(path, tab.model.getValue()); showStatus('Saved'); }
  catch (error) { showStatus(`Save failed: ${error.message}`); }
  renderTabs();
}

function buildTree(files) {
  const root = { dirs: new Map(), files: [] };
  for (const file of files) {
    const parts = file.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node.dirs.has(parts[i])) node.dirs.set(parts[i], { dirs: new Map(), files: [] });
      node = node.dirs.get(parts[i]);
    }
    node.files.push({ name: parts.at(-1), path: file });
  }
  return root;
}
function renderNode(node, container, depth) {
  for (const [name, child] of [...node.dirs].sort(([a], [b]) => a.localeCompare(b))) {
    const row = document.createElement('div');
    row.className = 'tree-dir';
    row.style.paddingLeft = `${depth * 14}px`;
    row.textContent = `📁 ${name}`;
    const children = document.createElement('div');
    children.className = 'tree-children';
    row.addEventListener('click', () => children.classList.toggle('hidden'));
    container.append(row, children);
    renderNode(child, children, depth + 1);
  }
  for (const file of [...node.files].sort((a, b) => a.name.localeCompare(b.name))) {
    const row = document.createElement('div');
    row.className = 'tree-file';
    row.style.paddingLeft = `${depth * 14}px`;
    row.textContent = file.name;
    row.addEventListener('click', () => openFile(file.path));
    container.append(row);
  }
}
function renderSidebar() {
  const tree = $('file-tree');
  tree.replaceChildren();
  renderNode(buildTree(state.fileIndex), tree, 0);
}

async function openFolder() {
  const folder = await window.api.chooseFolder();
  if (!folder) return;
  state.root = folder;
  $('sidebar-title').textContent = folder.split('/').pop();
  const { files, truncated } = await window.api.listTree(folder);
  state.fileIndex = files;
  renderSidebar();
  if (truncated) showStatus('Folder has more than 20,000 files; the index was truncated');
}

function toggleDistractionFree() {
  document.body.classList.toggle('distraction-free');
}
function toggleSidebar() {
  $('sidebar').classList.toggle('hidden');
}

const gotoAnything = createGotoAnything({
  monaco,
  getActiveModel: () => state.tabs.find(t => t.path === state.activePath)?.model || null,
  listFiles: () => state.fileIndex,
  openFile: (relativePath, line) => openFile(relativePath, line),
  revealLine
});

const languagePicker = createLanguagePicker({
  monaco,
  getActiveModel: () => state.tabs.find(t => t.path === state.activePath)?.model || null,
  onChange: () => { updateStatusBar(); renderTabs(); }
});

const settings = setupSettings();

$('btn-open-folder').addEventListener('click', openFolder);
$('btn-settings').addEventListener('click', settings.open);
$('status-language').addEventListener('click', languagePicker.open);

window.addEventListener('keydown', event => {
  const mod = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (mod && key === 'p') { event.preventDefault(); gotoAnything.open(); }
  else if (event.shiftKey && event.key === 'F11') { event.preventDefault(); toggleDistractionFree(); }
  else if (mod && key === 's') { event.preventDefault(); save(); }
  else if (mod && event.shiftKey && key === 'o') { event.preventDefault(); openFolder(); }
  else if (mod && key === 'w') { event.preventDefault(); if (state.activePath !== null || state.tabs.length) closeTab(state.activePath); }
  else if (mod && key === 'n') { event.preventDefault(); activate(newTab({ path: null, name: `Untitled-${state.untitledCount + 1}`, content: '' })); renderTabs(); }
  else if (mod && key === 'b') { event.preventDefault(); toggleSidebar(); }
  else if (mod && key === ',') { event.preventDefault(); settings.open(); }
});

// Start with one empty buffer, same as Sublime's default launch state.
activate(newTab({ path: null, name: 'Untitled-1', content: '' }));
renderTabs();
