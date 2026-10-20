import {tr, locale} from './i18n.js';

export function installLocalHistory({api, getDocument, show, close, compare, restore, notify, displayPath = path => path}) {
  const $ = id => document.getElementById(id);
  let generation = 0, current = null, selected = null;
  function buttons(disabled) {
    $('history-compare').disabled = disabled; $('history-restore').disabled = disabled;
  }
  function hide() { ++generation; current = null; selected = null; buttons(true); }
  async function choose(record, button, token) {
    selected = null; buttons(true);
    for (const node of $('history-list').children) node.setAttribute('aria-pressed', String(node === button));
    $('history-preview').textContent = tr('Loading history…');
    try {
      const revision = await api.getHistory(current.path, record.id);
      if (token !== generation) return;
      selected = revision; $('history-preview').textContent = revision.text; buttons(false);
    } catch (error) { if (token === generation) $('history-preview').textContent = error.message; }
  }
  async function open() {
    const doc = getDocument();
    if (!doc?.path) { notify(tr('Save the file to start local history.')); return; }
    show('history-overlay');
    hide(); current = {id:doc.id, path:doc.path, model:doc.model};
    const token = ++generation;
    $('history-file').textContent = displayPath(doc.path);
    $('history-list').replaceChildren(); $('history-preview').textContent = tr('Loading history…');
    $('history-close').focus();
    try {
      const records = await api.listHistory(doc.path);
      if (token !== generation) return;
      $('history-preview').textContent = tr('No history yet. Save changes to create versions.');
      for (const record of records) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'history-version';
        const date = new Date(record.time).toLocaleString(locale(), {dateStyle:'medium', timeStyle:'medium'});
        const kind = tr(record.kind === 'before-save' ? 'Before save' : record.kind === 'restore-backup' ? 'Before restore' : 'Saved version');
        button.textContent = `${date} · ${kind} · ${Math.ceil(record.bytes / 1024)} KB`;
        button.setAttribute('aria-pressed', 'false');
        button.onclick = () => choose(record, button, ++generation);
        $('history-list').appendChild(button);
      }
      if (records.length) await choose(records[0], $('history-list').firstChild, token);
    } catch (error) { if (token === generation) $('history-preview').textContent = error.message; }
  }
  function documentForSelection() {
    const doc = getDocument();
    if (!selected || !doc || doc.id !== current?.id || doc.path !== current.path || doc.model !== current.model) throw new Error(tr('The document changed. Reopen local history.'));
    return doc;
  }
  $('history-close').onclick = () => { close(); };
  $('history-compare').onclick = () => {
    try {
      const doc = documentForSelection(), revision = selected;
      close(); compare(doc, revision);
    } catch (error) { notify(error.message); }
  };
  $('history-restore').onclick = async () => {
    try {
      const doc = documentForSelection(), revision = selected, token = generation;
      const before = doc.model.getValue(); buttons(true);
      await api.captureHistory(doc.path, before);
      if (token !== generation) return;
      documentForSelection();
      if (doc.model.getValue() !== before) throw new Error(tr('The document changed. Reopen local history.'));
      close(); restore(doc, revision.text);
    } catch (error) { notify(error.message); if (selected) buttons(false); }
  };
  return {open, hide};
}
