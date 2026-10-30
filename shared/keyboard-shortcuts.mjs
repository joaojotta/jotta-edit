// Command IDs are shared by the renderer, Preferences and the native menus.
const definitions=[
  ['native-build-panel','Build & Run',''],['native-build','Build C/C++','F7'],['native-run','Build and run C/C++','F6'],
  ['native-test','Test C/C++','Ctrl+F6'],['native-stop','Stop build or program','Shift+F6'],
  ['new','New File','Ctrl+N'],['new-markdown','New Markdown file',''],['open-file','Open File…','Ctrl+O'],
  ['open-folder','Open Folder…','Ctrl+Shift+O'],['add-folder','Add Folder to Workspace…',''],
  ['add-remote-folder','Add Remote Folder to Workspace…',''],
  ['save','Save','Ctrl+S'],['save-as','Save As…','Ctrl+Shift+S'],['close-file','Close File','Ctrl+W'],['quit','Quit Jotta Edit','Ctrl+Q'],
  ['quick-open','Quick Open…','Ctrl+P'],['command-palette','Command palette','Ctrl+Shift+P'],['goto-line','Go to Line…','Ctrl+G'],
  ['search-project','Search in Project…','Ctrl+Shift+F'],['replace-project','Replace in Project…','Ctrl+Shift+H'],
  ['settings','Preferences…','Ctrl+Comma'],['keyboard-shortcuts','Keyboard shortcuts',''],
  ['sidebar','Toggle Sidebar','Ctrl+B'],['split-editor','Split Editor','Ctrl+Backslash'],['wrap','Toggle Word Wrap','Alt+Z'],
  ['font-plus','Increase Font Size','Ctrl+Plus'],['font-minus','Decrease Font Size','Ctrl+Minus'],['font-reset','Reset Font Size','Ctrl+0'],
  ['next-tab','Next tab','Ctrl+Tab'],['previous-tab','Previous tab','Ctrl+Shift+Tab'],
  ['markdown-preview','Markdown preview','Ctrl+Shift+V'],['preview','Open Live Preview',''],['preview-stop','Stop Live Preview',''],
  ['format','Format Document','Alt+Shift+F','editor'],['emmet','Emmet: Expand Abbreviation','Ctrl+Alt+E','editor'],
  ['edit-colour','Edit Colour at Cursor','Ctrl+Alt+C','editor'],['format-save','Toggle Format on Save',''],
  ['undo','Undo','Ctrl+Z','editor'],['redo','Redo','Ctrl+Shift+Z','editor'],
  ['cut','Cut','Ctrl+X','editor'],['copy','Copy','Ctrl+C','editor'],['paste','Paste','Ctrl+V','editor'],['select-all','Select All','Ctrl+A','editor'],
  ['find','Find','Ctrl+F','editor'],['replace','Replace','Ctrl+H','editor'],
  ['cursor-up','Add Cursor Above','Ctrl+Alt+Up','editor'],['cursor-down','Add Cursor Below','Ctrl+Alt+Down','editor'],
  ['compare-saved','Compare with saved version',''],['compare-latest','Compare with latest file',''],['close-comparison','Close comparison',''],
  ['document-outline','Document outline',''],['remote-connections','Remote connections',''],['favourites','Favourites…',''],
  ['recent-workspaces','Recent Workspaces…',''],['local-history','Local History…',''],['show-hidden','Show Hidden Files',''],
  ['minimap','Toggle Minimap',''],['theme','Toggle Dark/Light Theme',''],['about','About Jotta Edit','']
];
export const shortcutCommands=definitions.map(([id,label,binding,scope='app'])=>({id,label,binding,scope,aliases:id==='redo'?['Ctrl+Y']:[]}));
const ids=new Set(shortcutCommands.map(command=>command.id));
const aliases={'+':'Plus','=':'Plus','-':'Minus',',':'Comma','\\':'Backslash',ArrowUp:'Up',ArrowDown:'Down',ArrowLeft:'Left',ArrowRight:'Right',Escape:'Esc',' ':'Space'};
export function normalizeShortcut(value) {
  if(value==='')return '';
  if(typeof value!=='string'||value.length>80)throw new Error('Invalid keyboard shortcut.');
  const parts=value.endsWith('++')?[...value.slice(0,-2).split('+'),'Plus']:value.split('+');
  const key=parts.pop(),modifiers=new Set(parts);
  if(parts.length!==modifiers.size||parts.some(part=>!['Ctrl','Alt','Shift'].includes(part)))throw new Error('Invalid keyboard shortcut.');
  const normalized=aliases[key]||(/^[a-z]$/i.test(key)?key.toUpperCase():key);
  if(!/^(?:[A-Z0-9]|F(?:[1-9]|1\d|2[0-4])|Plus|Minus|Comma|Backslash|Up|Down|Left|Right|Home|End|PageUp|PageDown|Tab|Space|Enter|Delete|Insert|Backspace|\[|\]|;|'|\.|\/|`)$/.test(normalized||''))throw new Error('Invalid keyboard shortcut.');
  if(!modifiers.has('Ctrl')&&!modifiers.has('Alt')&&!/^F\d+$/.test(normalized))throw new Error('Use Ctrl, Alt or a function key.');
  return [...['Ctrl','Alt','Shift'].filter(modifier=>modifiers.has(modifier)),normalized].join('+');
}
export function shortcutFromEvent(event) {
  if(event.isComposing||event.getModifierState?.('AltGraph')||['Control','Meta','Alt','Shift','Dead','Process','Unidentified'].includes(event.key))return null;
  let key=aliases[event.key]||event.key;
  const shifted={'?':'/',':':';','"':"'",'>':'.','<':'Comma','_':'Minus','{':'[','}':']','|':'Backslash','~':'`'};
  key=shifted[key]||key;
  if(event.code==='NumpadAdd')key='Plus';if(event.code==='NumpadSubtract')key='Minus';
  const parts=[...(event.ctrlKey||event.metaKey?['Ctrl']:[]),...(event.altKey?['Alt']:[]),...(event.shiftKey&&key!=='Plus'?['Shift']:[]),key];
  try{return normalizeShortcut(parts.join('+'));}catch{return null;}
}
export function shortcutLabel(binding) {return binding.replace(/Plus$/,'+').replace(/Minus$/,'-').replace(/Comma$/,',').replace(/Backslash$/,'\\');}
export function effectiveShortcut(id,overrides={}) {return Object.hasOwn(overrides,id)?overrides[id]:shortcutCommands.find(command=>command.id===id)?.binding||'';}
export function shortcutConflict(id,binding,overrides={}) {
  return binding&&shortcutCommands.find(command=>command.id!==id&&(effectiveShortcut(command.id,overrides)===binding||!Object.hasOwn(overrides,command.id)&&command.aliases.includes(binding)))||null;
}
export function validateShortcutOverrides(value) {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>shortcutCommands.length)throw new Error('Invalid keyboard shortcuts.');
  const result={};
  for(const [id,binding]of Object.entries(value)){
    if(!ids.has(id))throw new Error('Invalid keyboard shortcuts.');
    result[id]=normalizeShortcut(binding);
  }
  for(const [id,binding]of Object.entries(result))if(shortcutConflict(id,binding,result))throw new Error('Keyboard shortcut conflict.');
  return result;
}
export function matchShortcut(event,overrides={}) {
  const binding=shortcutFromEvent(event);
  return binding?shortcutCommands.find(command=>effectiveShortcut(command.id,overrides)===binding||!Object.hasOwn(overrides,command.id)&&command.aliases.includes(binding))||null:null;
}
