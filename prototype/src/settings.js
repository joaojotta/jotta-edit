// Preferences panel. Currently holds one setting — the UI font — stored in
// localStorage so it survives restarts without needing a settings file on
// disk. Rubik ships bundled as the default; anything else in the dropdown is
// a font this machine already has installed, read from the main process.
const STORAGE_KEY = 'prototype.uiFont';

function applyFont(fontName) {
  const stack = fontName
    ? `'${fontName}', 'Rubik', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif`
    : `'Rubik', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif`;
  document.documentElement.style.setProperty('--ui-font', stack);
}

// Applied immediately on module load, before the font list even arrives,
// so there's no flash of the wrong font on startup.
const saved = localStorage.getItem(STORAGE_KEY) || '';
applyFont(saved);

export function setupSettings() {
  const overlay = document.getElementById('settings-overlay');
  const select = document.getElementById('setting-ui-font');
  const closeButton = document.getElementById('settings-close');
  select.value = saved;

  window.api.listSystemFonts().then(fonts => {
    for (const font of fonts) {
      const option = document.createElement('option');
      option.value = font;
      option.textContent = font;
      select.append(option);
    }
    select.value = saved;
  }).catch(() => {});

  select.addEventListener('change', () => {
    localStorage.setItem(STORAGE_KEY, select.value);
    applyFont(select.value);
  });

  function close() {
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
  }
  function open() {
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
  }
  closeButton.addEventListener('click', close);
  overlay.addEventListener('mousedown', event => { if (event.target === overlay) close(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !overlay.classList.contains('hidden')) close();
  });

  return { open, close };
}
