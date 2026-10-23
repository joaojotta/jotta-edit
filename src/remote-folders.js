import {tr} from './i18n.js';
export function installRemoteFolders({api,show,close,open,changed=()=>{},report=()=>{},documentRef=document}) {
  const $=id=>documentRef.getElementById(id);let busy=false,generation=0,hostKeyRequest=null,favourite=null;
  function controls(){
    for(const id of ['remote-connect','remote-location','remote-username','remote-password','remote-save-favourite'])$(id).disabled=busy;
    $('remote-save-credentials').disabled=busy||!$('remote-save-favourite').checked||!secureStorage;
    $('remote-form').setAttribute('aria-busy',String(busy));
  }
  let secureStorage=false;
  function clearTrust(){hostKeyRequest=null;$('remote-trust').hidden=true;$('remote-host-key').textContent='';}
  function hide(){++generation;if(busy)api.cancelRemoteConnection?.().catch(()=>{});$('remote-password').value='';clearTrust();busy=false;controls();}
  api.onRemoteHostKey?.(details=>{
    if(!busy){void api.answerRemoteHostKey(details.id,false);return;}
    hostKeyRequest=details.id;
    $('remote-host-key').textContent=tr(details.changed?'The server key has changed. Verify this fingerprint before trusting it:':'Verify the server fingerprint before trusting it:')+'\n'+details.server+'\n'+details.fingerprint;
    $('remote-trust').hidden=false;$('remote-trust').focus();
  });
  $('remote-trust').onclick=()=>{if(hostKeyRequest!=null){void api.answerRemoteHostKey(hostKeyRequest,true);clearTrust();}};
  $('remote-save-favourite').onchange=()=>{if(!$('remote-save-favourite').checked)$('remote-save-credentials').checked=false;controls();};
  function edited(){favourite=null;$('remote-saved-credentials').hidden=true;}
  $('remote-location').addEventListener('input',edited);$('remote-username').addEventListener('input',edited);
  async function attempt(task){
    if(busy)return;
    busy=true;controls();clearTrust();const run=++generation;
    $('remote-status').textContent=tr('Connecting to server…');
    try{
      const pending=task();
      $('remote-password').value='';
      const result=await pending;
      if(run!==generation)return;
      if(result?.root){
        try{await changed();}catch(error){report(error.message);}if(run!==generation)return;
        $('remote-status').textContent=tr('Loading remote folder…');
        if(await open(result.root,()=>run===generation)){close();if(result.warning)report(result.warning);return;}
        if(run!==generation)return;
        $('remote-status').textContent=tr('Could not open the remote folder. Check the connection and try again.');
      }else $('remote-status').textContent=tr('Connection cancelled.');
    }catch(error){if(run===generation)$('remote-status').textContent=tr(error.message.replace(/^Error invoking remote method '[^']+': Error: /,''));}
    finally{if(run===generation){$('remote-password').value='';clearTrust();busy=false;controls();}}
  }
  $('remote-form').addEventListener('submit',event=>{
    event.preventDefault();
    const credentials={username:$('remote-username').value,password:$('remote-password').value};
    const options={favouriteId:favourite?.id,saveFavourite:$('remote-save-favourite').checked,saveCredentials:$('remote-save-credentials').checked};
    return attempt(()=>api.connectRemoteFolder($('remote-location').value,credentials,options));
  });
  $('remote-close').onclick=close;$('remote-cancel').onclick=close;
  controls();return {hide,reconnect(entry){
    show('remote-overlay');favourite=null;$('remote-password').value='';$('remote-location').value=entry.uri;
    $('remote-username').value=decodeURIComponent(new URL(entry.uri).username);$('remote-saved-credentials').hidden=true;
    $('remote-save-favourite').checked=false;$('remote-save-credentials').checked=false;secureStorage=false;$('remote-storage-help').textContent='';
    return attempt(()=>api.reconnectRemoteFolder(entry.root));
  },async open(entry){
    if(!api.connectRemoteFolder)return;
    show('remote-overlay');const run=++generation;favourite=entry?.id?entry:null;
    $('remote-status').textContent='';$('remote-password').value='';
    $('remote-save-favourite').checked=!!entry?.id;
    $('remote-save-credentials').checked=false;
    $('remote-saved-credentials').hidden=!entry?.hasCredentials;
    if(entry?.location){$('remote-location').value=entry.location;$('remote-username').value=decodeURIComponent(new URL(entry.location).username);}
    $('remote-location').focus();secureStorage=false;$('remote-storage-help').textContent='';controls();
    try{
      const result=await api.listFavourites();if(run!==generation)return;
      secureStorage=result.credentialsAvailable;
      $('remote-storage-help').textContent=tr(secureStorage?'Saved credentials are encrypted using your system credential store.':'Secure credential storage is unavailable. You can still save favourites without credentials.');controls();
    }catch(error){if(run===generation)$('remote-status').textContent=tr(error.message.replace(/^Error invoking remote method '[^']+': Error: /,''));}
  }};
}
