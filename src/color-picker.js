import { findCssColors, colorTextContrast, parseCssColor, formatCssColor, rgbToHsl, hslToRgb, rgbToCmyk, cmykToRgb } from './color-utils.js';
import './color-picker.css';
import { translateDom, tr } from './i18n.js';
import { createColourLibrary, favouriteColour, colourRecord, colourKey, COLOUR_FAVOURITES_KEY, RECENT_COLOURS_KEY } from './colour-library.js';

const presets = ['#ffc107','#ff9800','#f44336','#ec4899','#9333ea','#6366f1','#2196f3','#06b6d4','#10b981','#84cc16','#ffffff','#d1d5db','#9ca3af','#6b7280','#4b5563','#374151','#1f2937','#111827','#60a5fa','#fca5a5'];
const cap = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
const colourFormats = ['hex','rgba','hsl','cmyk'];
const outputCss = (colour, format) => {
  if (format === 'rgba') {
    const rgb = formatCssColor(colour, 'rgb');
    return rgb.startsWith('rgba(') ? rgb : rgb.replace(/^rgb\((.*)\)$/, 'rgba($1, 1)');
  }
  return formatCssColor(colour, format === 'cmyk' ? 'hex' : format);
};

let nextColorScope = 0;

export function installColorEditor(editor, monaco, notify = () => {}, {displayMode = 'swatch', host} = {}) {
  const root = document.createElement('section');
  root.className = 'jotta-color-editor hidden';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Edit CSS colour');
  root.innerHTML = `
    <header class="jc-header" title="Drag to move"><strong>Edit Color</strong><button class="jc-close" aria-label="Close colour editor" type="button">×</button></header>
    <div class="jc-preview" aria-label="Original and selected colours">
      <div class="jc-preview-large"><span class="jc-original" title="Original colour"></span><span class="jc-current" title="Selected colour"></span></div>
      <div class="jc-preview-caption"><span>Original</span><span>Selected</span><code class="jc-output"></code></div>
    </div>
    <div class="jc-tabs" role="tablist" aria-label="Colour format">
      <button type="button" role="tab" data-format="hex" aria-selected="true">HEX</button>
      <button type="button" role="tab" data-format="rgba" aria-selected="false">RGBA</button>
      <button type="button" role="tab" data-format="hsl" aria-selected="false">HSL</button>
      <button type="button" role="tab" data-format="cmyk" aria-selected="false">CMYK</button>
    </div>
    <div class="jc-main">
      <div class="jc-format-fields" role="tabpanel" data-panel="hex"><label class="jc-text-label">HEX<input class="jc-hex" type="text" maxlength="9" spellcheck="false" aria-label="Hex colour"></label></div>
      <div class="jc-format-fields hidden" role="tabpanel" data-panel="rgba"><div class="jc-numbers jc-rgb">
        <label>R <input data-rgb="r" aria-label="Red" type="number" min="0" max="255"></label>
        <label>G <input data-rgb="g" aria-label="Green" type="number" min="0" max="255"></label>
        <label>B <input data-rgb="b" aria-label="Blue" type="number" min="0" max="255"></label>
        <label>A <input data-rgb="a" aria-label="Alpha" type="number" min="0" max="1" step="0.01"></label>
      </div></div>
      <div class="jc-format-fields hidden" role="tabpanel" data-panel="hsl"><div class="jc-numbers jc-hsl">
        <label>H <input data-hsl="h" aria-label="Hue degrees" type="number" min="0" max="360"></label>
        <label>S <input data-hsl="s" aria-label="Saturation percent" type="number" min="0" max="100"></label>
        <label>L <input data-hsl="l" aria-label="Lightness percent" type="number" min="0" max="100"></label>
        <label>A <input data-hsl="a" aria-label="Alpha" type="number" min="0" max="1" step="0.01"></label>
      </div></div>
      <div class="jc-format-fields hidden" role="tabpanel" data-panel="cmyk"><div class="jc-numbers jc-cmyk">
        <label>C % <input data-cmyk="c" aria-label="Cyan percent" type="number" min="0" max="100"></label>
        <label>M % <input data-cmyk="m" aria-label="Magenta percent" type="number" min="0" max="100"></label>
        <label>Y % <input data-cmyk="y" aria-label="Yellow percent" type="number" min="0" max="100"></label>
        <label>K % <input data-cmyk="k" aria-label="Black percent" type="number" min="0" max="100"></label>
      </div><p class="jc-format-note">CMYK is an approximate screen conversion. Applied CSS uses HEX for browser compatibility.</p></div>
      <div class="jc-sliders">
        <label><span>Hue</span><input type="range" data-slider="h" min="0" max="360" aria-label="Hue"><output class="jc-hue-value">0°</output></label>
        <label><span>Saturation</span><input type="range" data-slider="s" min="0" max="100" aria-label="Saturation"><output class="jc-saturation-value">100%</output></label>
        <label><span>Lightness</span><input type="range" data-slider="l" min="0" max="100" aria-label="Lightness"><output class="jc-lightness-value">50%</output></label>
        <label><span>Opacity</span><input type="range" data-slider="a" min="0" max="100" aria-label="Opacity"><output class="jc-opacity-value">100%</output></label>
      </div>
      <div class="jc-section-title">Preset Colors</div><div class="jc-presets"></div>
      <div class="jc-section-title">Favourites</div>
      <div class="jc-favourite-save"><input class="jc-favourite-new-name" type="text" maxlength="64" placeholder="Name (optional)" aria-label="New favourite colour name"><button type="button" class="jc-fav-add" title="Save current colour to favourites">★ Save current</button></div>
      <div class="jc-favourites"></div>
      <div class="jc-section-title jc-favourites-title"><span>Recent colours</span><button type="button" class="jc-recent-clear">Clear recent colours</button></div>
      <div class="jc-recents" aria-label="Recent colours"></div>
    </div><footer class="jc-actions"><button class="jc-apply" type="button">Apply</button><button class="jc-cancel" type="button">Cancel</button></footer>`;
  document.body.appendChild(root);
  translateDom(root);
  const localeChanged = () => { translateDom(root); renderFavourites(); };
  document.addEventListener('jotta:locale-changed', localeChanged);
  const q = sel => root.querySelector(sel);
  // Monaco draws injected text in its own text layer. Unlike floating DOM overlays
  // it stays aligned with glyphs when scrolling, zooming, or using proportional fonts.
  const decorations = editor.createDecorationsCollection();
  const triggerDecorations = editor.createDecorationsCollection();
  const editorHost = host || editor.getContainerDomNode?.() || editor.getDomNode() || document.getElementById('editor');
  const scope = `jotta-color-scope-${++nextColorScope}`;
  editorHost.classList.add(scope);
  const sheet = document.createElement('style');
  document.head.appendChild(sheet);
  displayMode = displayMode === 'background' ? 'background' : 'swatch';
  let items = [], editing = null, current = null, activeFormat = 'hex';
  const library = createColourLibrary(localStorage, () => document.dispatchEvent(new Event('jotta:colours-changed')));
  const changeLibrary = operation => {
    try { operation(); return true; }
    catch (error) { notify(error.name === 'QuotaExceededError' ? 'Could not save colours.' : error.message); return false; }
  };
  const coloursChanged = () => renderFavourites();
  const storageChanged = event => { if (event.key === null || [COLOUR_FAVOURITES_KEY, RECENT_COLOURS_KEY].includes(event.key)) renderFavourites(); };
  document.addEventListener('jotta:colours-changed', coloursChanged);
  window.addEventListener('storage', storageChanged);
  function close() { root.classList.add('hidden'); editing = null; }
  function refresh() {
    close(); decorations.clear(); triggerDecorations.clear();
    const model = editor.getModel();
    if (!model || !['css','scss','less','html','php','javascript','typescript','json','jsonc'].includes(model.getLanguageId()) && model.uri.scheme !== 'inmemory') {
      items = []; sheet.textContent = ''; return;
    }
    items = findCssColors(model.getValue());
    // Distinct class and colour for each occurrence, avoiding inline HTML or
    // editable source changes. Content is a non-breaking space, never an overlay.
    const canvas = editorHost.querySelector('.monaco-editor-background') || editorHost;
    const background = parseCssColor(getComputedStyle(canvas).backgroundColor) || {r:30, g:30, b:30};
    sheet.textContent = items.map((hit, index) => displayMode === 'background'
      ? `.${scope} .jotta-color-value.jotta-color-token-${index}{background-color:${formatCssColor(hit.color,'rgb')}!important;color:${colorTextContrast(hit.color,background)}!important}`
      : `.${scope} .jotta-color-token-${index}{color:${formatCssColor(hit.color,'rgb')}!important}`
    ).join('\n');
    decorations.set(items.map((hit, index) => {
      const start = model.getPositionAt(hit.start), end = model.getPositionAt(hit.end);
      return { range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
        options: displayMode === 'background'
          ? {inlineClassName:`jotta-color-value jotta-color-token-${index}`}
          : { before: { content: '■ ',
          inlineClassName: `jotta-inline-swatch jotta-color-token-${index}`,
          inlineClassNameAffectsLetterSpacing: true,
          cursorStops: monaco.editor.InjectedTextCursorStops.None } } };
    }));
    if (displayMode === 'background') {
      triggerDecorations.set(items.map((hit, index) => {
        const start = model.getPositionAt(hit.start);
        const prefixLength = hit.text.startsWith('#') ? 1 : hit.text.indexOf('(');
        const end = model.getPositionAt(hit.start + prefixLength);
        return {range:new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
          options:{inlineClassName:`jotta-color-trigger jotta-color-token-${index}`}};
      }));
    }
  }
  // Event delegation works on Monaco's recreated injected-text spans as the
  // viewport scrolls, without any auxiliary positioned buttons.
  editorHost.addEventListener('pointerdown', event => {
    const target = event.target instanceof Element ? (event.target.closest('.jotta-inline-swatch') || event.target.closest('.jotta-color-trigger')) : null;
    if (!target) return;
    const cls = [...target.classList].find(c => /^jotta-color-token-\d+$/.test(c));
    const index = cls ? Number(cls.slice('jotta-color-token-'.length)) : -1;
    if (!items[index]) return;
    event.preventDefault(); event.stopPropagation();
    const bounds = target.getBoundingClientRect();
    openAt(items[index], { x: bounds.right + 12, y: bounds.top - 20 });
  }, true);
  function setFormat(format, focus = false) {
    if (!colourFormats.includes(format)) return;
    activeFormat = format;
    for (const tab of root.querySelectorAll('[data-format]')) {
      const active = tab.dataset.format === format;
      tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
    }
    for (const panel of root.querySelectorAll('[data-panel]')) panel.classList.toggle('hidden', panel.dataset.panel !== format);
    if (editing) sync();
    if (focus) q(`[data-panel="${format}"] input`)?.focus();
  }
  function sync() {
    if (!editing) return;
    const rgba = current;
    const hsl = rgbToHsl(rgba);
    const cmyk = rgbToCmyk(rgba);
    q('.jc-hex').value = formatCssColor(rgba, 'hex');
    for (const name of ['r','g','b','a']) q(`[data-rgb="${name}"]`).value = rgba[name];
    for (const name of ['h','s','l','a']) q(`[data-hsl="${name}"]`).value = name === 'a' ? rgba.a : hsl[name];
    for (const name of ['c','m','y','k']) q(`[data-cmyk="${name}"]`).value = cmyk[name];
    q('[data-slider="h"]').value = hsl.h;
    q('[data-slider="s"]').value = hsl.s;
    q('[data-slider="l"]').value = hsl.l;
    q('[data-slider="a"]').value = Math.round(rgba.a * 100);
    q('.jc-hue-value').textContent = `${hsl.h}°`;
    q('.jc-saturation-value').textContent = `${hsl.s}%`;
    q('.jc-lightness-value').textContent = `${hsl.l}%`;
    q('.jc-opacity-value').textContent = `${Math.round(rgba.a * 100)}%`;
    q('.jc-original').style.backgroundColor = formatCssColor(editing.color,'rgb');
    q('.jc-current').style.backgroundColor = formatCssColor(rgba,'rgb');
    q('.jc-output').textContent = outputCss(rgba, activeFormat);
    for (const swatch of root.querySelectorAll('.jc-preset')) {
      const selected = formatCssColor(rgba, 'hex').toLowerCase().slice(0, 7) === swatch.dataset.hex;
      swatch.setAttribute('aria-pressed', String(selected));
    }
    const selectedRecord = colourRecord(rgba);
    for (const swatch of root.querySelectorAll('.jc-saved-swatch')) swatch.setAttribute('aria-pressed', String(selectedRecord && swatch.dataset.colourKey === colourKey(selectedRecord)));
    q('[data-slider="s"]').style.background = `linear-gradient(to right,${formatCssColor({...hslToRgb(hsl.h,0,hsl.l),a:1},'hex')},${formatCssColor({...hslToRgb(hsl.h,100,hsl.l),a:1},'hex')})`;
    q('[data-slider="l"]').style.background = `linear-gradient(to right,#000,${formatCssColor({...hslToRgb(hsl.h,hsl.s,50),a:1},'hex')},#fff)`;
    q('[data-slider="a"]').style.background = `linear-gradient(to right,transparent,${formatCssColor({...rgba,a:1},'hex')})`;
  }
  function openForChoice(initial, point, onApply) {
    const color = parseCssColor(initial) || parseCssColor('#ffc107');
    if (!color || typeof onApply !== 'function') return;
    editing = { color, external: true, onApply };
    current = {...color};
    q('.jc-favourite-new-name').value = '';
    setFormat('hex');
    root.classList.remove('hidden'); sync(); renderFavourites();
    placePopup(point);
  }
  function placePopup(point) {
    const width = Math.min(480, innerWidth - 24); root.style.width = width + 'px';
    const height = root.getBoundingClientRect().height;
    root.style.left = Math.max(12, Math.min(innerWidth-width-12, point?.x ?? (innerWidth-width)/2)) + 'px';
    root.style.top = Math.max(12, Math.min(innerHeight-height-12, point?.y ?? 70)) + 'px';
    q(`[data-panel="${activeFormat}"] input`)?.focus();
  }
  function openAt(hit, point) {
    if (!hit || !editor.getModel()) return;
    editing = { ...hit, model: editor.getModel() };
    current = { ...hit.color };
    q('.jc-favourite-new-name').value = '';
    setFormat(hit.color.kind === 'rgb' ? 'rgba' : hit.color.kind === 'hsl' ? 'hsl' : 'hex');
    root.classList.remove('hidden'); sync(); renderFavourites();
    placePopup(point);
  }
  function apply() {
    if (!editing) return;
    if (editing.external) {
      const callback = editing.onApply;
      // Persist CSS-compatible colour, including transparency if selected.
      const colour = formatCssColor(current, 'hex');
      const selected = {...current};
      close();
      if (callback(colour) !== false) changeLibrary(() => library.remember(selected));
      return;
    }
    const { model, start, end, text } = editing;
    const a = model.getPositionAt(start), b = model.getPositionAt(end);
    const targetRange = new monaco.Range(a.lineNumber,a.column,b.lineNumber,b.column);
    if (model !== editor.getModel() || model.getValueInRange(targetRange) !== text) {
      close(); notify('Colour could not be applied: source changed'); return;
    }
    const updated = outputCss(current, activeFormat);
    const selected = {...current};
    close(); editor.pushUndoStop();
    editor.executeEdits('jotta.colour', [{ range: targetRange, text: updated }]);
    editor.pushUndoStop(); editor.focus();
    changeLibrary(() => library.remember(selected));
  }
  for (const tab of root.querySelectorAll('[data-format]')) {
    tab.addEventListener('click', () => setFormat(tab.dataset.format, true));
    tab.addEventListener('keydown', e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const index = colourFormats.indexOf(activeFormat);
      setFormat(colourFormats[(index + (e.key === 'ArrowRight' ? 1 : -1) + colourFormats.length) % colourFormats.length]);
      q(`[data-format="${activeFormat}"]`).focus();
    });
  }
  for (const hex of presets) {
    const btn = document.createElement('button'); btn.type='button'; btn.className='jc-preset';
    btn.style.backgroundColor = hex; btn.dataset.hex=hex; btn.title=hex; btn.setAttribute('aria-label', `${tr('Select')} ${hex}`); btn.setAttribute('aria-pressed', 'false');
    btn.onclick = () => { if (!current) return; current = { ...parseCssColor(hex), a: current.a }; sync(); };
    q('.jc-presets').appendChild(btn);
  }
  function renderFavourites() {
    const grid = q('.jc-favourites'); grid.replaceChildren();
    for (const entry of library.favourites()) {
      // Keep removal beside the swatch so the colour remains a full square.
      const item = document.createElement('div'); item.className = 'jc-favourite';
      const swatch = savedSwatch(entry, 'jc-favourite-swatch');
      const name = document.createElement('input'); name.type='text'; name.className='jc-favourite-name'; name.maxLength=64;
      name.value=entry.name; name.placeholder=tr('Name (optional)'); name.setAttribute('aria-label', tr('Favourite colour name'));
      name.onchange=() => { if (!changeLibrary(() => library.rename(colourKey(entry), name.value))) name.value=entry.name; };
      const remove = document.createElement('button'); remove.type='button'; remove.className='jc-favourite-remove';
      remove.textContent = '×'; remove.title = tr('Remove from favourites'); remove.setAttribute('aria-label', remove.title);
      remove.onclick = () => changeLibrary(() => library.remove(colourKey(entry)));
      item.append(swatch, name, remove);
      grid.appendChild(item);
    }
    if (!grid.children.length) { const empty=document.createElement('p'); empty.className='jc-empty'; empty.textContent=tr('No favourite colours yet.'); grid.append(empty); }
    const recents = q('.jc-recents'); recents.replaceChildren();
    for (const entry of library.recents()) recents.append(savedSwatch(entry, 'jc-recent-swatch'));
    q('.jc-recent-clear').disabled = !recents.children.length;
    if (!recents.children.length) { const empty=document.createElement('p'); empty.className='jc-empty'; empty.textContent=tr('Applied colours appear here.'); recents.append(empty); }
    sync();
  }
  function savedSwatch(entry, className) {
    const swatch = document.createElement('button'); swatch.type='button'; swatch.className=`${className} jc-saved-swatch`;
    const colour = favouriteColour(entry);
    const css = `rgba(${colour.r}, ${colour.g}, ${colour.b}, ${colour.a})`;
    swatch.style.setProperty('--swatch-colour', css); swatch.dataset.colourKey=colourKey(entry);
    swatch.title = `${entry.name ? entry.name + ' · ' : ''}${entry.colour} · ${Math.round(entry.alpha*100)}%`;
    swatch.setAttribute('aria-label', `${tr('Select')} ${swatch.title}`);
    swatch.onclick = () => { if (!current) return; current={...colour}; sync(); };
    return swatch;
  }
  renderFavourites();
  q('.jc-fav-add').onclick = () => {
    if (!current) return;
    if (changeLibrary(() => library.save(current, q('.jc-favourite-new-name').value))) q('.jc-favourite-new-name').value='';
  };
  q('.jc-recent-clear').onclick = () => changeLibrary(() => library.clearRecents());
  const header = q('.jc-header');
  let dragging = null;
  header.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('button') || root.classList.contains('hidden')) return;
    const rect = root.getBoundingClientRect();
    dragging = {pointerId:event.pointerId, dx:event.clientX-rect.left, dy:event.clientY-rect.top};
    header.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  header.addEventListener('pointermove', event => {
    if (!dragging || event.pointerId !== dragging.pointerId) return;
    const rect = root.getBoundingClientRect();
    root.style.left = `${Math.max(0,Math.min(innerWidth-rect.width,event.clientX-dragging.dx))}px`;
    root.style.top = `${Math.max(0,Math.min(innerHeight-rect.height,event.clientY-dragging.dy))}px`;
  });
  const stopDragging = () => { dragging = null; };
  header.addEventListener('pointerup', stopDragging);
  header.addEventListener('pointercancel', stopDragging);
  q('.jc-close').onclick = close; q('.jc-cancel').onclick = close; q('.jc-apply').onclick = apply;
  q('.jc-hex').addEventListener('change', e => {
    const color = parseCssColor(e.target.value);
    if (color) { current = color; sync(); } else { notify('Enter a valid HEX colour'); sync(); }
  });
  for (const input of root.querySelectorAll('[data-rgb]')) input.addEventListener('change', e => {
    const key=e.target.dataset.rgb;
    current[key] = cap(e.target.value,0,key==='a'?1:255); sync();
  });
  for (const input of root.querySelectorAll('[data-hsl]')) input.addEventListener('change', e => {
    const key=e.target.dataset.hsl;
    if (key === 'a') current.a=cap(e.target.value,0,1);
    else { const hsl = rgbToHsl(current); hsl[key] = cap(e.target.value,0,key==='h'?360:100);
      current = { ...current, ...hslToRgb(hsl.h,hsl.s,hsl.l) }; }
    sync();
  });
  for (const input of root.querySelectorAll('[data-cmyk]')) input.addEventListener('change', e => {
    const cmyk=rgbToCmyk(current); cmyk[e.target.dataset.cmyk]=cap(e.target.value,0,100);
    current={...current,...cmykToRgb(cmyk.c,cmyk.m,cmyk.y,cmyk.k)}; sync();
  });
  for (const input of root.querySelectorAll('[data-slider]')) input.addEventListener('input', e => {
    if (e.target.dataset.slider === 'a') current.a = cap(e.target.value,0,100)/100;
    else { const hsl=rgbToHsl(current); hsl[e.target.dataset.slider]=cap(e.target.value,0,e.target.dataset.slider==='h'?360:100); current={...current,...hslToRgb(hsl.h,hsl.s,hsl.l)}; }
    sync();
  });
  root.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); editor.focus(); }
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type === 'text') {
      e.preventDefault();
      if (e.target.classList.contains('jc-favourite-new-name')) q('.jc-fav-add').click();
      else if (e.target.classList.contains('jc-favourite-name')) e.target.dispatchEvent(new Event('change'));
      else { e.target.dispatchEvent(new Event('change')); apply(); }
    }
  });
  document.addEventListener('pointerdown', e => {
    if (editing && !root.contains(e.target) && !e.target.closest?.('.jotta-inline-swatch, .jotta-color-trigger')) close();
  }, true);
  editor.addAction({ id:'jotta.edit.colour', label:'Edit Colour at Cursor',
    keybindings:[monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyC],
    precondition:'editorTextFocus', run: () => {
      const model=editor.getModel(), position=editor.getPosition();
      if (!model || !position) return;
      const offset=model.getOffsetAt(position);
      const hit=items.find(x => offset>=x.start && offset<=x.end);
      if (!hit) { notify('Place the cursor inside a CSS colour'); return; }
      const p=editor.getScrolledVisiblePosition(position), r=editorHost.getBoundingClientRect();
      openAt(hit,{ x:r.left+(p?.left||0)+24,y:r.top+(p?.top||0)+20 });
    }
  });
  editor.onDidChangeModel(refresh);
  editor.onDidChangeModelContent(refresh);
    refresh();
  const setDisplayMode = mode => { displayMode = mode === 'background' ? 'background' : 'swatch'; refresh(); };
  return { refresh, close, openForChoice, setDisplayMode, dispose: () => {
    close(); decorations.clear(); triggerDecorations.clear(); sheet.remove(); root.remove();
    document.removeEventListener('jotta:locale-changed', localeChanged);
    document.removeEventListener('jotta:colours-changed', coloursChanged);
    window.removeEventListener('storage', storageChanged);
  } };
}
