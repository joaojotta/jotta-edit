import { exportSettings, parseSettingsImport, SETTINGS_FILE_LIMIT } from './settings-transfer.js';
import { tr } from './i18n.js';

export function installSettingsTransfer({storage, apply, exportOptions = () => ({}), documentRef = document, download} = {}) {
  const $ = id => documentRef.getElementById(id);
  let staged = null, generation = 0, busy = false;
  const status = message => { $('settings-transfer-status').textContent = tr(message); };
  function controls() {
    for (const id of ['settings-export','settings-import','settings-import-apply','settings-import-cancel']) $(id).disabled = busy;
  }
  function cancel() { ++generation; staged = null; $('settings-import-review').hidden = true; }
  $('settings-export').onclick = () => {
    if (busy) return;
    try {
      const json = exportSettings(storage, exportOptions());
      if (download) download(json);
      else {
        const url = URL.createObjectURL(new Blob([json], {type:'application/json'}));
        const link = documentRef.createElement('a'); link.href=url; link.download='Jotta-Edit-settings.json';
        documentRef.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }
      status('Settings exported.');
    } catch { status('Could not export settings.'); }
  };
  $('settings-import').onclick = () => { if (!busy) $('settings-import-file').click(); };
  $('settings-import-file').addEventListener('change', async event => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (busy || !file) return;
    cancel(); const run = generation;
    try {
      if (file.size > SETTINGS_FILE_LIMIT) throw new Error('Settings file too large.');
      const incoming = parseSettingsImport(await file.text());
      if (run !== generation) return;
      staged = incoming;
      const counts = [
        `${tr('Preferences')}: ${Object.keys(incoming).filter(key => !['customThemes','interfaceColours','iconColours','colourFavourites','recentColours'].includes(key)).length}`,
        ...(incoming.customThemes ? [`${tr('Custom themes')}: ${Object.keys(incoming.customThemes).length}`] : []),
        ...(incoming.colourFavourites ? [`${tr('Favourite colours')}: ${incoming.colourFavourites.length}`] : [])
      ];
      $('settings-import-summary').textContent = counts.join(' · ');
      $('settings-import-review').hidden = false;
      status('Settings file ready to import.');
      $('settings-import-apply').focus();
    } catch (error) { if (run === generation) status(error.message === 'Settings file too large.' ? error.message : 'Invalid settings file.'); }
  });
  $('settings-import-cancel').onclick = () => { if (!busy) { cancel(); status('Settings import cancelled.'); } };
  $('settings-import-apply').onclick = async () => {
    if (busy || !staged) return;
    busy = true; controls();
    try {
      await apply(staged); cancel(); status('Settings imported. Open documents were preserved.');
    } catch { status('Could not import settings.'); }
    finally { busy = false; controls(); }
  };
  return {cancel};
}
