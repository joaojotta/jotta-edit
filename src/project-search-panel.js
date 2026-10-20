import {tr} from './i18n.js';
import {projectPathContains, searchProjectFiles, replacementPlans, replaceProjectMatches} from './project-search.js';

export function installProjectSearch({api, getRoot, getDocuments, openMatch, applyChanges, undoChanges, saveChanges, revealSidebar, focusEditor}) {
  const $ = id => document.getElementById(id);
  const panel = $('project-search'), input = $('project-search-query'), replacement = $('project-search-replace');
  let results = [], selected = new Set(), valid = false, busy = false, request = 0, timer, searchedRoot = null, batch = null;
  const status = text => { $('project-search-status').textContent = text; };
  function controls() {
    const count = results.filter(file => selected.has(file.path)).reduce((sum, file) => sum + file.matches.length, 0);
    $('project-search-apply').disabled = busy || !valid || !count;
    $('project-search-apply').textContent = tr('Replace selected') + (count ? ` (${count})` : '');
    $('project-search-save').disabled = busy || !batch;
    $('project-search-undo').disabled = busy || !batch;
    for (const id of ['project-search-query','project-search-replace','project-search-case','project-search-word','project-search-run','project-search-all','project-search-none']) $(id).disabled = busy;
  }
  const previewLine = (text, column) => {
    if (text.length <= 240) return text;
    const start = Math.max(0, column - 61), end = Math.min(text.length, start + 240);
    return (start ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
  };
  function render() {
    const container = $('project-search-results'); container.replaceChildren();
    for (const file of results) {
      const group = document.createElement('section'); group.className = 'project-search-file';
      const label = document.createElement('label'); label.className = 'project-search-file-label';
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = selected.has(file.path); checkbox.disabled = busy;
      checkbox.addEventListener('change', () => { checkbox.checked ? selected.add(file.path) : selected.delete(file.path); controls(); });
      const name = document.createElement('span'); name.textContent = file.path.replace(/\\/g,'/').slice(searchedRoot.replace(/\\/g,'/').replace(/\/+$/,'').length + 1); name.title = file.path;
      const count = document.createElement('small'); count.textContent = String(file.matches.length);
      label.append(checkbox, name, count); group.append(label);
      const lines = file.text.split('\n'), lineGroups = new Map();
      for (const match of file.matches) {
        if (!lineGroups.has(match.line)) lineGroups.set(match.line, []);
        lineGroups.get(match.line).push(match);
      }
      for (const [number, matches] of [...lineGroups].slice(0,20)) {
        const row = document.createElement('button'); row.type = 'button'; row.className = 'project-search-match'; row.disabled = busy;
        row.addEventListener('click', () => openMatch(file.path, matches[0]));
        const before = lines[number - 1].replace(/\r$/, '');
        const lineOffset = matches[0].start - matches[0].column + 1;
        const local = matches.map(match => ({start:match.start - lineOffset, end:match.end - lineOffset}));
        const oldLine = document.createElement('del'); oldLine.textContent = `− ${number}: ${previewLine(before, matches[0].column)}`;
        const newLine = document.createElement('ins'); newLine.textContent = `+ ${number}: ${previewLine(replaceProjectMatches(before, local, replacement.value), matches[0].column)}`;
        row.append(oldLine, newLine); row.title = oldLine.textContent + '\n' + newLine.textContent; group.append(row);
      }
      if (lineGroups.size > 20) {
        const more = document.createElement('p'); more.className = 'project-search-more'; more.textContent = tr('Additional matching lines') + ': ' + (lineGroups.size - 20); group.append(more);
      }
      container.append(group);
    }
    controls();
  }
  function invalidate() {
    request++; clearTimeout(timer); valid = false;
    if (!panel.hidden && !busy) status(tr('Files changed. Search again before replacing.'));
    controls();
  }
  function reset() { invalidate(); results = []; selected.clear(); searchedRoot = null; batch = null; render(); status(tr('Open a project folder to search.')); }
  async function search() {
    if (busy) return;
    clearTimeout(timer);
    const id = ++request, root = getRoot(), query = input.value;
    valid = false; results = []; selected.clear(); render();
    if (!root) { status(tr('Open a project folder to search.')); return; }
    if (!query) { status(tr('Enter text to search.')); return; }
    status(tr('Searching…'));
    try {
      const listing = await api.scanFolder(root, {showHidden:false});
      if (id !== request || getRoot() !== root) return;
      const paths = [];
      const walk = nodes => { for (const node of nodes) node.dir ? walk(node.children || []) : paths.push(node.path); };
      walk(listing.nodes);
      const buffers = new Map();
      for (const doc of getDocuments()) if (doc.path && projectPathContains(root, doc.path)) {
        const parts = doc.path.replace(/\\/g,'/').slice(root.replace(/\\/g,'/').replace(/\/+$/,'').length + 1).split('/');
        if (parts.some(part => part.startsWith('.') || ['node_modules','vendor','dist','build'].includes(part))) continue;
        buffers.set(doc.path, doc.text); paths.push(doc.path);
      }
      const outcome = await searchProjectFiles({root, paths, buffers, readFile:api.readFile, query,
        options:{matchCase:$('project-search-case').checked, wholeWord:$('project-search-word').checked}, cancelled:() => id !== request || getRoot() !== root});
      if (!outcome || id !== request || getRoot() !== root) return;
      searchedRoot = root; results = outcome.results; selected = new Set(results.map(file => file.path)); valid = true;
      const matches = results.reduce((sum, file) => sum + file.matches.length, 0);
      status(`${tr('Files')}: ${results.length} · ${tr('Matches')}: ${matches}` + (outcome.skipped ? ` · ${tr('Skipped files')}: ${outcome.skipped}` : '') + (outcome.limited || listing.truncated ? ' · ' + tr('Search limit reached; results are partial.') : ''));
      render();
    } catch (error) { if (id === request) { status(tr(error.message)); controls(); } }
  }
  function schedule() { invalidate(); timer = setTimeout(search, 300); }
  input.addEventListener('input', schedule);
  replacement.addEventListener('input', () => { if (!busy) render(); });
  for (const id of ['project-search-case','project-search-word']) $(id).addEventListener('change', schedule);
  for (const element of [input,replacement]) element.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); search(); } });
  $('project-search-run').addEventListener('click', search);
  $('project-search-all').addEventListener('click', () => { selected = new Set(results.map(file => file.path)); render(); });
  $('project-search-none').addEventListener('click', () => { selected.clear(); render(); });
  $('project-search-apply').addEventListener('click', async () => {
    if (busy || !valid || getRoot() !== searchedRoot) return;
    let plans;
    try { plans = replacementPlans(results, selected, replacement.value); }
    catch (error) { status(tr(error.message)); return; }
    if (!plans.length) { status(tr('No changes to apply.')); return; }
    busy = true; render();
    try {
      batch = await applyChanges(plans, searchedRoot);
      valid = false; results = []; selected.clear();
      status(tr('Replacements are unsaved. Review the tabs, then save changed files.'));
    } catch (error) { valid = false; status(tr(error.message)); }
    finally { busy = false; render(); }
  });
  $('project-search-undo').addEventListener('click', async () => {
    if (!batch || busy) return;
    busy = true; controls();
    try { await undoChanges(batch); batch = null; invalidate(); status(tr('Project replacements undone.')); }
    catch (error) { status(tr(error.message)); }
    finally { busy = false; controls(); }
  });
  $('project-search-save').addEventListener('click', async () => {
    if (!batch || busy) return;
    busy = true; controls();
    try { await saveChanges(batch); batch = null; status(tr('Changed files saved.')); }
    catch (error) { status(tr(error.message)); }
    finally { busy = false; controls(); }
  });
  function showSearch(replace = false) {
    const github=document.getElementById('github-panel');if(github)github.hidden=true;document.getElementById('btn-github')?.setAttribute('aria-pressed','false');
    revealSidebar(); panel.hidden = false; $('explorer-view').hidden = true;
    $('btn-project-search').setAttribute('aria-pressed','true'); $('btn-explorer').setAttribute('aria-pressed','false');
    (replace ? replacement : input).focus(); (replace ? replacement : input).select();
    if (!results.length) status(tr(getRoot() ? 'Enter text to search.' : 'Open a project folder to search.'));
  }
  function showExplorer() { panel.hidden = true; $('explorer-view').hidden = false; $('btn-project-search').setAttribute('aria-pressed','false'); $('btn-explorer').setAttribute('aria-pressed','true'); }
  $('btn-project-search').addEventListener('click', () => showSearch());
  $('btn-explorer').addEventListener('click', showExplorer);
  panel.addEventListener('keydown', event => { if (event.key === 'Escape') { showExplorer(); focusEditor(); } });
  document.addEventListener('jotta:locale-changed', () => render());
  controls();
  return {show:showSearch, invalidate, reset};
}
