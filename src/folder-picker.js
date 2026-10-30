import {tr} from './i18n.js';

const MAX_SELECTION=50;
export function installFolderPicker({api,show,close,documentRef=document,storage=globalThis.localStorage}){
  const $=id=>documentRef.getElementById(id);
  let resolveSelection=null,generation=0,current=null,previousFocus=null,fileMode=false,multiple=false,busy=false,selected=new Set(),lastSelected=null,lastFileClick=null;
  const storageKey=()=>fileMode?'jotta.filePickerLastFolder':'jotta.folderPickerLastFolder';
  const remembered=()=>{try{return storage?.getItem(storageKey())||undefined;}catch{return undefined;}};
  const remember=path=>{try{storage?.setItem(storageKey(),path);}catch{/* Browsing remains usable without local storage. */}};
  const status=message=>{$('folder-picker-status').textContent=tr(message);};
  const errorMessage=error=>error.message.replace(/^Error invoking remote method '[^']+': Error: /,'');
  const query=()=>($('folder-picker-filter')?.value||'').trim().toLocaleLowerCase();
  const matches=item=>item.name.toLocaleLowerCase().includes(query());
  function updateSelection(){
    $('folder-picker-open').disabled=busy||!current||(fileMode&&multiple&&!selected.size);
    if($('folder-picker-selection'))$('folder-picker-selection').textContent=multiple?`${tr('Selected files')}: ${selected.size}`:'';
  }
  function hide(){
    ++generation;const resolve=resolveSelection;resolveSelection=null;current=null;busy=false;selected.clear();
    resolve?.(null);const focus=previousFocus;previousFocus=null;focus?.focus?.();
  }
  async function pickFiles(paths){
    if(!resolveSelection||busy||!paths.length)return;
    const run=++generation;busy=true;updateSelection();
    try{
      // Validate the complete selection before resolving any file.
      const files=await Promise.all(paths.map(path=>api.selectFile(path)));
      if(run!==generation||!resolveSelection)return;
      const resolve=resolveSelection;resolveSelection=null;close();resolve(multiple?files:files[0]);
    }catch(error){if(run===generation&&resolveSelection)status(errorMessage(error));}
    finally{if(run===generation){busy=false;updateSelection();}}
  }
  function fileSelection(path,event={}){
    if(busy)return;
    if(event.detail>0){
      const time=Date.now();
      if(lastFileClick?.path===path&&time-lastFileClick.time<450){void pickFiles([path]);return;}
      lastFileClick={path,time};
    }
    const visible=(current?.files||[]).filter(matches).map(item=>item.path);
    if(event.shiftKey&&lastSelected&&visible.includes(lastSelected)){
      const a=visible.indexOf(lastSelected),b=visible.indexOf(path);
      for(const item of visible.slice(Math.min(a,b),Math.max(a,b)+1))if(selected.size<MAX_SELECTION)selected.add(item);
    }else if(selected.has(path))selected.delete(path);
    else if(selected.size<MAX_SELECTION)selected.add(path);
    else{status('Select up to 50 files at a time.');return;}
    lastSelected=path;render();
  }
  function render(){
    const focusPath=documentRef.activeElement?.getAttribute?.('data-path');
    const list=$('folder-picker-list');list.replaceChildren();
    if(!current){updateSelection();return;}
    const row=(item,folder)=>{
      const button=documentRef.createElement('button');button.type='button';button.className='folder-picker-entry'+(folder?'':' folder-picker-file');
      button.setAttribute('data-path',item.path);
      const icon=documentRef.createElement('img');icon.src=folder?'/ui-icons/folder.svg':'/ui-icons/file.svg';icon.alt='';icon.setAttribute('aria-hidden','true');
      const label=documentRef.createElement('span');label.textContent=item.name;button.append(icon,label);
      if(!folder&&multiple){
        button.setAttribute('aria-pressed',String(selected.has(item.path)));
        const check=documentRef.createElement('span');check.className='folder-picker-check';check.textContent=selected.has(item.path)?'✓':'';check.setAttribute('aria-hidden','true');button.append(check);
        button.onclick=event=>fileSelection(item.path,event);
        button.ondblclick=()=>pickFiles([item.path]);
      }else button.onclick=()=>folder?browse(item.path):pickFiles([item.path]);
      list.append(button);
    };
    const folders=current.folders.filter(matches),files=fileMode?(current.files||[]).filter(matches):[];
    for(const item of folders)row(item,true);for(const item of files)row(item,false);
    status(current.truncated?'Showing the first 2,000 folders and files. Enter a path to browse another folder.':!folders.length&&!files.length?(query()?'No matching files or folders.':fileMode?'No folders or files here.':'No subfolders. You can open this folder.'):'');
    updateSelection();
    if(focusPath)[...list.children].find(item=>item.getAttribute?.('data-path')===focusPath)?.focus();
  }
  async function browse(location,{fallback=false}={}){
    if(busy)return;
    const run=++generation,previous=current?.path;
    current=null;selected.clear();lastSelected=null;lastFileClick=null;updateSelection();status('Loading folders…');$('folder-picker-list').replaceChildren();
    try{
      const result=await api.browseFolders(location,{showHidden:$('folder-picker-hidden').checked});
      if(run!==generation||!resolveSelection)return;
      current=result;remember(result.path);$('folder-picker-location').value=result.path;
      if(previous!==result.path&&$('folder-picker-filter'))$('folder-picker-filter').value='';
      $('folder-picker-up').disabled=result.parent===result.path;render();
    }catch(error){
      if(run!==generation||!resolveSelection)return;
      if(fallback&&location){await browse();if(resolveSelection&&current)status('Last folder unavailable. Showing the home folder.');}
      else status(errorMessage(error));
    }
  }
  $('folder-picker-form').onsubmit=event=>{event.preventDefault();void browse($('folder-picker-location').value);};
  $('folder-picker-home').onclick=()=>browse();
  $('folder-picker-up').onclick=()=>{if(current)void browse(current.parent);};
  $('folder-picker-hidden').onchange=()=>browse($('folder-picker-location').value);
  $('folder-picker-filter')?.addEventListener('input',render);
  if($('folder-picker-select-all'))$('folder-picker-select-all').onclick=()=>{
    if(busy||!current)return;const visible=(current.files||[]).filter(matches);
    for(const item of visible)if(selected.size<MAX_SELECTION)selected.add(item.path);render();
    if(visible.some(item=>!selected.has(item.path)))status('Select up to 50 files at a time.');
  };
  if($('folder-picker-select-none'))$('folder-picker-select-none').onclick=()=>{if(!busy){selected.clear();render();}};
  $('folder-picker-cancel').onclick=close;$('folder-picker-close').onclick=close;
  $('folder-picker-open').onclick=async()=>{
    if(!current||!resolveSelection||busy)return;
    if(fileMode){await pickFiles([...selected]);return;}
    const run=++generation;busy=true;updateSelection();
    try{
      const result=await api.selectFolder($('folder-picker-location').value);
      if(run!==generation||!resolveSelection)return;
      remember(result);const resolve=resolveSelection;resolveSelection=null;close();resolve(result);
    }catch(error){if(run===generation&&resolveSelection)status(errorMessage(error));}
    finally{if(run===generation){busy=false;updateSelection();}}
  };
  $('folder-picker-overlay').addEventListener('keydown',event=>{
    if(event.key==='Tab'){
      const controls=[...$('folder-picker-overlay').querySelectorAll('button:not(:disabled),input')].filter(item=>!item.hidden&&!item.closest?.('[hidden]'));
      const first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&documentRef.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&documentRef.activeElement===last){event.preventDefault();first?.focus();}
    }
  });
  return {hide,choose({allowFiles=false,multiple:allowMultiple=false}={}){
    if(resolveSelection)return Promise.resolve(null);
    fileMode=allowFiles;multiple=fileMode&&allowMultiple;busy=false;selected.clear();lastSelected=null;
    $('folder-picker-title').textContent=tr(fileMode?(multiple?'Open Files':'Open File'):'Open Folder');
    $('folder-picker-open').hidden=fileMode&&!multiple;
    $('folder-picker-open').textContent=tr(multiple?'Open selected files':'Open folder');
    if($('folder-picker-multiple'))$('folder-picker-multiple').hidden=!multiple;
    if($('folder-picker-filter'))$('folder-picker-filter').value='';
    $('folder-picker-list').setAttribute('aria-label',tr(fileMode?'Folders and files':'Subfolders'));
    previousFocus=documentRef.activeElement;show('folder-picker-overlay');
    const pending=new Promise(resolve=>{resolveSelection=resolve;});
    void browse(remembered(),{fallback:true});$('folder-picker-location').focus();return pending;
  }};
}
