import {shortcutCommands,normalizeShortcut,shortcutFromEvent,shortcutLabel,effectiveShortcut,shortcutConflict,validateShortcutOverrides} from '../shared/keyboard-shortcuts.mjs';
export function createKeyboardShortcuts(storage,changed=()=>{}) {
  let overrides={};
  function reload(){try{overrides=validateShortcutOverrides(JSON.parse(storage.getItem('jotta.keyboardShortcuts')||'{}'));}catch{overrides={};}changed(overrides);}
  function commit(value){const validated=validateShortcutOverrides(value);storage.setItem('jotta.keyboardShortcuts',JSON.stringify(validated));overrides=validated;changed(overrides);}
  reload();
  return {reload,get overrides(){return overrides;},binding:id=>effectiveShortcut(id,overrides),label:id=>shortcutLabel(effectiveShortcut(id,overrides)),
    set(id,value){commit({...overrides,[id]:normalizeShortcut(value)});},reset(id){const next={...overrides};delete next[id];commit(next);},resetAll(){commit({});}};
}
export function installKeyboardShortcutEditor({host,shortcuts,tr=s=>s,documentRef=document}) {
  const make=(tag,cls,parent=host)=>{const node=documentRef.createElement(tag);node.className=cls;parent.appendChild(node);return node;};
  const filter=make('input','shortcut-filter');filter.type='search';filter.placeholder=tr('Find a command…');filter.setAttribute('aria-label',tr('Filter keyboard shortcuts'));
  const note=make('p','settings-note');note.textContent=tr('Select a shortcut field and press a key combination. Ctrl also means ⌘ on macOS.');
  const status=make('p','shortcut-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const resetAll=make('button','shortcut-reset-all');resetAll.type='button';resetAll.textContent=tr('Reset all shortcuts');
  const list=make('div','shortcut-list');
  function attempt(action){try{action();status.textContent=tr('Keyboard shortcuts saved.');render();}catch(error){status.textContent=tr(error.message);}}
  function render(){
    list.replaceChildren();const query=filter.value?.toLocaleLowerCase()||'';
    for(const command of shortcutCommands.filter(command=>tr(command.label).toLocaleLowerCase().includes(query))){
      const row=make('div','shortcut-row',list),label=make('label','',row);label.textContent=tr(command.label);
      const input=make('input','shortcut-recorder',label);input.type='text';input.readOnly=true;input.dataset.shortcutRecorder='true';input.value=shortcuts.label(command.id);input.placeholder=tr('Unassigned');
      input.setAttribute('aria-label',tr(command.label));
      let pending=shortcuts.binding(command.id);
      const save=make('button','',row);save.type='button';save.textContent=tr('Assign');save.disabled=true;
      input.addEventListener('keydown',event=>{
        event.stopPropagation();if(event.key==='Tab'&&!event.ctrlKey&&!event.metaKey&&!event.altKey)return;
        event.preventDefault();
        if(event.key==='Escape'){pending=shortcuts.binding(command.id);input.value=shortcuts.label(command.id);save.disabled=true;return;}
        const binding=shortcutFromEvent(event);if(!binding)return;
        pending=binding;input.value=shortcutLabel(binding);
        const conflict=shortcutConflict(command.id,binding,shortcuts.overrides);save.disabled=Boolean(conflict);
        status.textContent=conflict?tr('Shortcut already used by')+': '+tr(conflict.label):tr('Press Assign to save this shortcut.');
      });
      save.onclick=()=>attempt(()=>shortcuts.set(command.id,pending));
      const clear=make('button','',row);clear.type='button';clear.textContent=tr('Unassign');clear.onclick=()=>attempt(()=>shortcuts.set(command.id,''));
      const reset=make('button','',row);reset.type='button';reset.textContent=tr('Reset');reset.onclick=()=>attempt(()=>shortcuts.reset(command.id));
    }
  }
  filter.addEventListener('input',render);resetAll.onclick=()=>attempt(()=>shortcuts.resetAll());render();
  documentRef.addEventListener('jotta:locale-changed',render);
  return {refresh:render};
}
