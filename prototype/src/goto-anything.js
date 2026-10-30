// Sublime's "Goto Anything": one input, three modes selected by a leading
// character — ':line' jumps in the current file, '@query' fuzzy-searches
// symbols in the current file, anything else fuzzy-searches project files
// (optionally suffixed with ':line' to open-and-jump in one step). Unlike
// VS Code/jotta-edit's separate palettes per shortcut, this is a single box.
import { fuzzyScore } from './fuzzy.js';
import { documentOutline } from './document-outline.js';

const MAX_RESULTS = 80;

export function createGotoAnything({ monaco, getActiveModel, listFiles, openFile, revealLine }) {
  const overlay = document.getElementById('goto-overlay');
  const input = document.getElementById('goto-input');
  const list = document.getElementById('goto-list');
  let items = [];
  let index = 0;
  let queryId = 0;

  function close() {
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
  }
  function open() {
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    input.value = '';
    input.focus();
    refresh();
  }
  function render() {
    list.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'goto-empty';
      empty.textContent = 'No matches';
      list.append(empty);
      return;
    }
    items.forEach((item, i) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `goto-item${i === index ? ' active' : ''}`;
      const title = document.createElement('span');
      title.className = 'goto-item-title';
      title.textContent = item.title;
      row.append(title);
      if (item.detail) {
        const detail = document.createElement('span');
        detail.className = 'goto-item-detail';
        detail.textContent = item.detail;
        row.append(detail);
      }
      row.addEventListener('mouseenter', () => { index = i; updateSelection(); });
      row.addEventListener('click', () => activate());
      list.append(row);
    });
  }
  function updateSelection() {
    [...list.children].forEach((row, i) => row.classList.toggle('active', i === index));
    list.children[index]?.scrollIntoView({ block: 'nearest' });
  }

  function lineModeResults(query) {
    const number = Number.parseInt(query, 10);
    const model = getActiveModel();
    if (!model || !Number.isInteger(number) || number <= 0) return [];
    const line = Math.min(number, model.getLineCount());
    return [{ title: `Go to line ${line}`, detail: '', action: () => revealLine(line) }];
  }

  async function symbolModeResults(query) {
    const model = getActiveModel();
    if (!model) return [{ title: 'Open a file first', detail: '', action: null }];
    const { entries } = await documentOutline(model, monaco);
    return entries
      .map(entry => ({ entry, score: fuzzyScore(entry.name, query) }))
      .filter(({ score }) => score !== -Infinity)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS)
      .map(({ entry }) => ({
        title: entry.name,
        detail: `${entry.kind} · Ln ${entry.line}`,
        action: () => revealLine(entry.line, entry.column)
      }));
  }

  function fileModeResults(query) {
    // "path/to/file.js:42" opens the file and jumps to line 42.
    const lineSuffix = /^(.*):(\d+)$/.exec(query);
    const namePart = lineSuffix ? lineSuffix[1] : query;
    const targetLine = lineSuffix ? Number.parseInt(lineSuffix[2], 10) : null;
    return listFiles()
      .map(path => ({ path, score: fuzzyScore(path, namePart) }))
      .filter(({ score }) => score !== -Infinity)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS)
      .map(({ path }) => ({
        title: path.split('/').pop(),
        detail: path,
        action: () => openFile(path, targetLine)
      }));
  }

  async function refresh() {
    const request = ++queryId;
    const query = input.value;
    let results;
    if (query.startsWith(':')) results = lineModeResults(query.slice(1));
    else if (query.startsWith('@')) results = await symbolModeResults(query.slice(1));
    else results = fileModeResults(query);
    if (request !== queryId) return; // a newer keystroke superseded this lookup
    items = results;
    index = 0;
    render();
  }
  function activate() {
    const item = items[index];
    if (!item?.action) return;
    close();
    item.action();
  }

  input.addEventListener('input', refresh);
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); index = (index + 1) % Math.max(1, items.length); updateSelection(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); index = (index - 1 + Math.max(1, items.length)) % Math.max(1, items.length); updateSelection(); }
    else if (event.key === 'Enter') { event.preventDefault(); activate(); }
  });
  overlay.addEventListener('mousedown', event => { if (event.target === overlay) close(); });

  return { open, close };
}
