import {tr} from './i18n.js';

export function webFilePresentation(doc,location){
  if(!doc)return {label:'Save',icon:'save',status:'No file open',hint:'No file open'};
  if(doc.readOnly)return {label:'Download file',icon:'download',status:doc.font?'Fonts are read-only.':'Images are read-only.',hint:'Download file'};
  const download=location==='Download copy',choose=!doc.path||doc.missing;
  return {
    label:choose?'Save as…':download?'Download file':'Save',icon:download&&!choose?'download':'save',
    status:doc.saving?'Saving…':doc.missing?'File missing':doc.dirty?'Unsaved edits':!doc.path?'Unsaved draft':download?'Ready to download':location==='Browser storage'?'Saved in browser':location==='Local file'||location==='Local folder'?'Saved':'Ready to save',
    hint:choose?'Choose a local file or download a copy (Ctrl+Shift+S)':download?'Download the current file, including unsaved edits':location==='Browser storage'?'Save in this browser. Download a copy or export ZIP for a backup.':'Save the current file (Ctrl+S)'
  };
}

export function installWebToolbar({api,documentRef=document,windowRef=window}){
  const $=id=>documentRef.getElementById(id),toolbar=documentRef.querySelector('.web-toolbar');
  const setIcon=(node,name)=>node.style.setProperty('--web-icon',`url("${new URL('./ui-icons/'+name+'.svg',documentRef.baseURI).href}")`);
  for(const node of toolbar.querySelectorAll('[data-web-icon]'))setIcon(node,node.dataset.webIcon);
  const triggers=[...toolbar.querySelectorAll('[data-web-menu]')];
  const workspaceControls=['web-workspace-toggle','web-new-project','web-open-file','web-recent-workspaces','web-open-folder','web-import-toggle','web-import-folder','web-import-zip'];
  let ready=false,workspaceBusy=false,root=null,doc=null,location=null,locationKey='',generation=0,opened=null,shortcuts=null;
  function closeMenu(focus=false){
    if(!opened)return;const trigger=opened;opened=null;$(trigger.dataset.webMenu).hidden=true;trigger.setAttribute('aria-expanded','false');if(focus)trigger.focus();
  }
  const items=menu=>[...menu.querySelectorAll('button:not(:disabled)')].filter(button=>!button.hidden);
  function openMenu(trigger,last=false){
    if(trigger.disabled)return;closeMenu();opened=trigger;
    const menu=$(trigger.dataset.webMenu);menu.hidden=false;trigger.setAttribute('aria-expanded','true');
    const bounds=trigger.getBoundingClientRect(),rect=menu.getBoundingClientRect();
    menu.style.left=Math.max(8,Math.min(windowRef.innerWidth-rect.width-8,bounds.left))+'px';
    menu.style.top=Math.max(8,Math.min(windowRef.innerHeight-rect.height-8,bounds.bottom+7))+'px';
    const buttons=items(menu);(last?buttons.at(-1):buttons[0])?.focus();
  }
  function render(){
    for(const id of workspaceControls)$(id).disabled=!ready||workspaceBusy;
    const addFolder=$('web-add-folder');if(addFolder)addFolder.disabled=!ready||workspaceBusy;
    $('web-export-zip').disabled=!ready||workspaceBusy||!root;
    const name=root?.replace(/\\/g,'/').split('/').filter(Boolean).pop();
    $('web-workspace-name').textContent=name||tr('Workspace');
    $('web-workspace-toggle').title=tr('Workspace actions')+(name?' · '+name:'');
    const view=webFilePresentation(doc,location),disabled=!ready||!doc||Boolean(doc.saving);
    for(const id of ['web-save-file','web-save-as','web-download-file','web-file-options'])$(id).disabled=disabled;
    $('web-save-as').disabled=disabled||Boolean(doc?.readOnly);
    const hint=value=>shortcuts?tr(value).replace('Ctrl+Shift+S',shortcuts['save-as']).replace('Ctrl+S',shortcuts.save).replace(/ \(\)/g,''):tr(value);
    $('web-save-label').textContent=tr(view.label);$('web-save-file').title=hint(view.hint);
    $('web-save-as').title=hint('Choose a local file or download a copy (Ctrl+Shift+S)');
    const icon=$('web-save-file').querySelector('.web-icon');
    setIcon(icon,view.icon);
    $('web-save-status').textContent=tr(view.status);$('web-save-location').dataset.dirty=String(Boolean(doc?.dirty));
    $('web-save-location').title=tr(location==='Download copy'?'Download to keep your changes':location||view.hint);
    if(opened?.disabled)closeMenu();
  }
  function updateDocument(next){
    doc=next||null;
    const key=doc?JSON.stringify([doc.id,doc.path,root]):'';
    if(key===locationKey){render();return;}
    locationKey=key;location=null;const run=++generation;render();
    const path=doc?.path;
    if(path)Promise.resolve().then(()=>api.saveLocation(path)).then(value=>{
      if(run!==generation)return;location=value;render();
    }).catch(()=>{/* Save reports access errors while the working buffer remains available. */});
  }
  function updateWorkspace(next){root=next||null;updateDocument(doc);}
  toolbar.addEventListener('click',event=>{
    const trigger=event.target.closest('[data-web-menu]');
    if(trigger){if(opened===trigger)closeMenu(true);else openMenu(trigger);return;}
    if(event.target.closest('.web-menu button'))closeMenu();
  });
  toolbar.addEventListener('keydown',event=>{
    const trigger=event.target.closest('[data-web-menu]');
    if(trigger&&['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();event.stopPropagation();openMenu(trigger,event.key==='ArrowUp');return;}
    if(!opened)return;
    const menu=$(opened.dataset.webMenu);
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeMenu(true);}
    else if(event.key==='Tab')closeMenu(true);
    else if(menu.contains(event.target)&&['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      event.preventDefault();event.stopPropagation();const buttons=items(menu),index=buttons.indexOf(documentRef.activeElement);
      const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:buttons.length-1))%buttons.length;
      buttons[next]?.focus();
    }
  });
  documentRef.addEventListener('pointerdown',event=>{if(opened&&!$(opened.dataset.webMenu).contains(event.target)&&!opened.contains(event.target))closeMenu();});
  documentRef.addEventListener('focusin',event=>{if(opened&&!$(opened.dataset.webMenu).contains(event.target)&&!opened.contains(event.target))closeMenu();});
  documentRef.addEventListener('jotta:locale-changed',render);
  windowRef.addEventListener('resize',()=>closeMenu());windowRef.addEventListener('blur',()=>closeMenu());
  windowRef.addEventListener('jotta:web-ready',()=>{ready=true;render();});
  windowRef.addEventListener('jotta:shortcuts-changed',event=>{shortcuts=event.detail;render();});
  windowRef.addEventListener('jotta:workspace-opened',event=>updateWorkspace(event.detail.root));
  windowRef.addEventListener('jotta:web-document-changed',event=>{root=event.detail.root||null;updateDocument(event.detail.document);});
  for(const trigger of triggers)trigger.setAttribute('aria-expanded','false');
  render();
  return {setWorkspaceBusy(value){workspaceBusy=value;render();},get root(){return root;}};
}
