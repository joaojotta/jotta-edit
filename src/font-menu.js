import './font-menu.css';
import { tr, translateDom } from './i18n.js';
const defaults = ['Monospace','JetBrains Mono','Fira Code','Cascadia Code','DejaVu Sans Mono','Liberation Mono','Consolas','Courier New'];
// Explicit combobox because Chromium datalist does not list fonts when the input's arrow is clicked.
export function installFontMenu(input, button, onSelect, { fallback = 'Monospace', previewFamily = 'monospace' } = {}) {
  const panel = document.createElement('div'); panel.id = input.id === 'setting-ui-font' ? 'ui-font-menu' : 'font-menu'; panel.className='jotta-font-menu hidden';
  panel.setAttribute('role','listbox'); panel.setAttribute('aria-label','Available editor fonts');
  document.body.appendChild(panel); translateDom(panel);
  document.addEventListener('jotta:locale-changed', () => translateDom(panel));
  let fonts = defaults.slice(), visible=[], active=0, open=false, showAll=false;
  function layout() {
    const rect=input.getBoundingClientRect();
    panel.style.width=`${Math.max(200,rect.width+button.getBoundingClientRect().width)}px`;
    panel.style.left=`${Math.min(rect.left,innerWidth-panel.getBoundingClientRect().width-12)}px`;
    const availableBelow=innerHeight-rect.bottom-20;
    panel.style.maxHeight=`${Math.max(100,Math.min(310,availableBelow>=170?availableBelow:rect.top-15))}px`;
    panel.style.top= availableBelow>=170 ? `${rect.bottom+4}px` : 'auto';
    panel.style.bottom= availableBelow>=170 ? 'auto' : `${innerHeight-rect.top+4}px`;
  }
  function paint() {
    panel.replaceChildren();
    visible=fonts.filter(font => showAll || font.toLowerCase().includes(input.value.trim().toLowerCase())).slice(0,160);
    active=Math.max(0,Math.min(active,visible.length-1));
    if (!visible.length) { const item=document.createElement('div'); item.className='jotta-font-empty'; item.textContent=tr('No matching installed fonts. You can still type a font name.'); panel.appendChild(item);return; }
    for (const [index,font] of visible.entries()) {
      const item=document.createElement('button'); item.type='button'; item.className='jotta-font-option';
      item.setAttribute('role','option'); item.setAttribute('aria-selected',String(index===active));
      item.textContent=font; item.style.fontFamily=`"${font.replace(/["\\]/g,'')}", ${previewFamily}`;
      item.classList.toggle('active',index===active);
      item.addEventListener('pointerdown', e=> e.preventDefault());
      item.addEventListener('click',()=> choose(font)); panel.appendChild(item);
    }
  }
  function show(filter=false) {
    open=true; panel.classList.remove('hidden');
    // Clicking the arrow must expose ALL fonts, even when a font is already selected.
    showAll = !filter;
    active=0; paint(); layout();
    input.setAttribute('aria-expanded','true');
  }
  function hide() {open=false;panel.classList.add('hidden');input.setAttribute('aria-expanded','false');}
  function choose(value) { input.value=value; onSelect(value); hide(); input.focus(); }
  button.addEventListener('click',()=> { show(false); input.focus(); });
  input.addEventListener('focus',()=>{if (!open) show(true);});
  input.addEventListener('input',()=>{showAll=false; if (!open) show(true); else {active=0;paint();layout();}});
  input.addEventListener('change',()=>{ const value=input.value.trim()||fallback; onSelect(value); });
  input.addEventListener('keydown',e=>{
    if (e.key==='Escape' && open) {e.preventDefault();e.stopPropagation();hide();}
    if (e.key==='ArrowDown' || e.key==='ArrowUp') {if (!open) show(true);e.preventDefault();active=Math.max(0,Math.min(visible.length-1,active+(e.key==='ArrowDown'?1:-1)));paint();panel.children[active]?.scrollIntoView({block:'nearest'});}
    if (e.key==='Enter') {e.preventDefault(); if (open && visible.length) choose(visible[active]);else choose(input.value.trim()||fallback);}
  });
  document.addEventListener('pointerdown', e=>{ if (open && !panel.contains(e.target) && e.target!==input && e.target!==button) hide(); });
  window.addEventListener('resize',()=>{if(open)layout();});
  function setFonts(systemFonts) {
    const all=[fallback,'Rubik',...defaults,...(Array.isArray(systemFonts)?systemFonts:[])];
    fonts=[...new Set(all.map(s=>String(s).trim()).filter(s=>s.length>0&&s.length<=65))].sort((a,b)=>a.localeCompare(b));
    if (open) {paint();layout();}
  }
  return {setFonts,hide};
}
