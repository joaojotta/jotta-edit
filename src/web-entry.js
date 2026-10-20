import {browserApi} from '../web/browser-api.js';
// Load the complete interface stylesheet from the INITIAL web entrypoint.
// main.js is loaded dynamically; relying on its CSS imports alone could
// leave the HTML unstyled until that chunk is fetched and evaluated.
import 'monaco-editor/min/vs/editor/editor.main.css';
import './style.css';
import './color-picker.css';
import './font-menu.css';
import '../web/web.css';
window.slate = browserApi;
document.body.classList.add('jotta-web');
const $=id=>document.getElementById(id);
const report=(message)=>{const el=$('status-message');if(el)el.textContent=message;};
window.addEventListener('jotta:web-ready',()=>{document.querySelectorAll('.web-workspace-actions button:not(#web-download-file):not(#web-save-file):not(#web-save-as)').forEach(button=>button.disabled=false);});
const action=(id,fn)=>$(id).addEventListener('click',async()=>{
  const button=$(id);button.disabled=true;
  try {await fn();} catch(error){report(error.message||String(error));console.error(error);}
  finally{button.disabled=false;}
});
const announce=root=>window.dispatchEvent(new CustomEvent('jotta:web-open-folder',{detail:{root}}));
// Folder handles require a user gesture; the browser API opens the picker directly in click handlers.
action('web-new-project',async()=>{
  const name=prompt('New offline workspace name:', 'My Project');if(name===null)return;
  announce(await browserApi.newWorkspace(name));
});
action('web-open-folder',async()=>{const folder=await browserApi.chooseFolder();if(folder)announce(folder);});
action('web-import-folder',async()=>{const folder=await browserApi.importDirectory();if(folder)announce(folder);});
action('web-import-zip',async()=>{const folder=await browserApi.importZip();if(folder)announce(folder);});
action('web-export-zip',async()=>{
  const root=await (await import('../web/storage.js')).getMeta('workspace-root');
  const count=await browserApi.exportProject(root);report(`Exported ${count} files to ZIP`);
});
window.addEventListener('jotta:workspace-opened',event=>{
  const root=event.detail.root;const tag=document.querySelector('.web-identity small');
  if(tag)tag.textContent='Workspace · '+root.split('/').pop();
});
if(!('showDirectoryPicker' in window))$('web-open-folder').title='Import a browser-managed copy of a folder';
if('serviceWorker' in navigator && (location.protocol==='https:'||location.hostname==='localhost')) {
  window.addEventListener('load',()=>navigator.serviceWorker.register(new URL('./sw.js',location.href)).catch(error=>console.warn('Offline cache unavailable:',error)));
}
await import('./main.js');
