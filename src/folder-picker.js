import {tr} from './i18n.js';
export function installFolderPicker({api,show,close,documentRef=document}){
  const $=id=>documentRef.getElementById(id);
  let resolveSelection=null,generation=0,current=null,previousFocus=null;
  function status(message){$('folder-picker-status').textContent=tr(message);}
  function hide(){
    ++generation;const resolve=resolveSelection;resolveSelection=null;current=null;
    resolve?.(null);const focus=previousFocus;previousFocus=null;focus?.focus?.();
  }
  async function browse(location){
    const run=++generation;
    current=null;$('folder-picker-open').disabled=true;status('Loading folders…');
    $('folder-picker-list').replaceChildren();
    try{
      const result=await api.browseFolders(location,{showHidden:$('folder-picker-hidden').checked});
      if(run!==generation||!resolveSelection)return;
      current=result;$('folder-picker-location').value=result.path;$('folder-picker-open').disabled=false;
      $('folder-picker-up').disabled=result.parent===result.path;
      for(const item of result.folders){
        const button=documentRef.createElement('button');button.type='button';button.className='folder-picker-entry';
        const icon=documentRef.createElement('img');icon.src='/ui-icons/folder.svg';icon.alt='';icon.setAttribute('aria-hidden','true');
        const label=documentRef.createElement('span');label.textContent=item.name;button.append(icon,label);
        button.onclick=()=>browse(item.path);$('folder-picker-list').append(button);
      }
      status(result.truncated?'Showing the first 2,000 folders. Enter a path to open another folder.':result.folders.length?'':'No subfolders. You can open this folder.');
    }catch(error){if(run===generation&&resolveSelection)status(error.message.replace(/^Error invoking remote method '[^']+': Error: /,''));}
  }
  $('folder-picker-form').onsubmit=event=>{event.preventDefault();void browse($('folder-picker-location').value);};
  $('folder-picker-home').onclick=()=>browse();
  $('folder-picker-up').onclick=()=>{if(current)void browse(current.parent);};
  $('folder-picker-hidden').onchange=()=>browse($('folder-picker-location').value);
  $('folder-picker-cancel').onclick=close;$('folder-picker-close').onclick=close;
  $('folder-picker-open').onclick=async()=>{
    if(!current||!resolveSelection)return;const run=++generation;
    $('folder-picker-open').disabled=true;
    try{
      // An edited location must be validated too, even without pressing Go.
      const selected=await api.selectFolder($('folder-picker-location').value);
      if(run!==generation||!resolveSelection)return;
      const resolve=resolveSelection;resolveSelection=null;close();resolve(selected);
    }catch(error){if(run===generation&&resolveSelection){status(error.message.replace(/^Error invoking remote method '[^']+': Error: /,''));$('folder-picker-open').disabled=false;}}
  };
  $('folder-picker-overlay').addEventListener('keydown',event=>{
    if(event.key==='Tab'){
      const controls=[...$('folder-picker-overlay').querySelectorAll('button:not(:disabled),input')],first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&documentRef.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&documentRef.activeElement===last){event.preventDefault();first.focus();}
    }
  });
  return {hide,choose(){
    if(resolveSelection)return Promise.resolve(null);
    previousFocus=documentRef.activeElement;show('folder-picker-overlay');
    const pending=new Promise(resolve=>{resolveSelection=resolve;});
    void browse();$('folder-picker-location').focus();return pending;
  }};
}
