// Status-bar language switcher. Same fuzzy-filtered popup pattern as Goto
// Anything, but anchored over the status bar and scoped to one fixed list.
import { fuzzyScore } from './fuzzy.js';

const LANGUAGES = [
  ['plaintext', 'Plain Text'], ['javascript', 'JavaScript'], ['typescript', 'TypeScript'],
  ['json', 'JSON'], ['html', 'HTML'], ['css', 'CSS'], ['scss', 'SCSS'], ['less', 'LESS'],
  ['php', 'PHP'], ['python', 'Python'], ['markdown', 'Markdown'], ['xml', 'XML'],
  ['yaml', 'YAML'], ['shell', 'Shell Script'], ['sql', 'SQL'], ['go', 'Go'], ['rust', 'Rust'],
  ['c', 'C'], ['cpp', 'C++'], ['java', 'Java']
];

export function languageLabel(id) {
  return LANGUAGES.find(([langId]) => langId === id)?.[1] || id;
}

export function createLanguagePicker({ monaco, getActiveModel, onChange }) {
  const overlay = document.getElementById('language-overlay');
  const input = document.getElementById('language-input');
  const list = document.getElementById('language-list');
  let items = [];
  let index = 0;

  function close() {
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
  }
  function open() {
    if (!getActiveModel()) return;
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    input.value = '';
    input.focus();
    refresh();
  }
  function render() {
    list.replaceChildren();
    items.forEach((item, i) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `goto-item${i === index ? ' active' : ''}`;
      row.textContent = item.label;
      row.addEventListener('mouseenter', () => { index = i; updateSelection(); });
      row.addEventListener('click', () => activate());
      list.append(row);
    });
  }
  function updateSelection() {
    [...list.children].forEach((row, i) => row.classList.toggle('active', i === index));
    list.children[index]?.scrollIntoView({ block: 'nearest' });
  }
  function refresh() {
    const query = input.value;
    items = LANGUAGES.map(([id, label]) => ({ id, label, score: fuzzyScore(`${label} ${id}`, query) }))
      .filter(({ score }) => score !== -Infinity)
      .sort((a, b) => b.score - a.score);
    index = 0;
    render();
  }
  function activate() {
    const item = items[index];
    const model = getActiveModel();
    if (!item || !model) return;
    monaco.editor.setModelLanguage(model, item.id);
    close();
    onChange?.(item);
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
