import {tr} from './i18n.js';

// Browser favourites contain workspace identifiers only; credentials stay in the
// desktop process and are never sent to this store or to localStorage.
export function browserFavourites(storage){
  function read(){
    const value=JSON.parse(storage.getItem('jotta.favourites')||'[]');
    return Array.isArray(value)?value.filter(x=>x&&x.kind==='local'&&typeof x.id==='string'&&typeof x.location==='string'&&typeof x.name==='string').slice(0,200):[];
  }
  return {
    async listFavourites(){return {entries:read(),credentialsAvailable:false};},
    async saveFavourite(value){
      if(value?.kind!=='local'||typeof value.location!=='string'||!value.location)throw new Error('Invalid favourite.');
      const entries=read();let entry=entries.find(x=>x.location===value.location);
      if(!entry){if(entries.length>=200)throw new Error('Favourites limit reached. Remove an unused favourite first.');entry={id:crypto.randomUUID(),kind:'local',location:value.location,name:value.location.replace(/\\/g,'/').split('/').filter(Boolean).pop()||value.location};entries.push(entry);}
      storage.setItem('jotta.favourites',JSON.stringify(entries));return entry;
    },
    async removeFavourite(id){storage.setItem('jotta.favourites',JSON.stringify(read().filter(x=>x.id!==id)));}
  };
}

export function installFavourites({api,show,close,open,choose,current,remote,report,documentRef=document}){
  const $=id=>documentRef.getElementById(id);
  let busy=false,generation=0;
  const status=message=>{$('favourites-status').textContent=tr(message);};
  const message=error=>error.message.replace(/^Error invoking remote method '[^']+': Error: /,'');
  async function action(run){
    if(busy)return;busy=true;status('');
    try{await run();}catch(error){status(message(error));}finally{busy=false;}
  }
  function row(entry,compact=false){
    const row=documentRef.createElement('div');row.className='recent-workspace favourite-row';
    const button=documentRef.createElement('button');button.type='button';button.className='recent-open';button.title=entry.location;
    const name=documentRef.createElement('strong');name.textContent=entry.name;
    const location=documentRef.createElement('span');location.textContent=entry.location;
    button.append(name,location);
    button.onclick=()=>action(async()=>{
      if(entry.kind==='remote'){remote(entry);return;}
      if(await open(entry.location))close();
      else status('Could not open this workspace. It may have moved or require folder access.');
    });row.append(button);
    if(!compact){
      if(entry.hasCredentials){
        const credentials=documentRef.createElement('button');credentials.type='button';credentials.textContent=tr('Delete credentials');
        credentials.setAttribute('aria-label',`${tr('Delete credentials')}: ${entry.name}`);
        credentials.onclick=()=>action(async()=>{await api.deleteFavouriteCredentials(entry.id);await refresh();status('Saved credentials deleted.');});row.append(credentials);
      }
      const remove=documentRef.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label',`${tr('Remove favourite')}: ${entry.name}`);
      remove.onclick=()=>action(async()=>{await api.removeFavourite(entry.id);await refresh();});row.append(remove);
    }
    return row;
  }
  async function refresh(){
    const run=++generation,result=await api.listFavourites();if(run!==generation)return;
    const entries=result.entries;
    $('favourites-list').replaceChildren(...entries.map(entry=>row(entry)));
    $('welcome-favourites-list').replaceChildren(...entries.slice(0,4).map(entry=>row(entry,true)));
    $('welcome-favourites').hidden=entries.length===0;
    $('favourites-empty').hidden=entries.length!==0;
    $('favourites-current').disabled=!current();
  }
  async function display(){show('favourites-overlay');status('');$('favourites-close').focus();try{await refresh();}catch(error){status(message(error));}}
  $('favourites-close').onclick=close;
  $('favourites-current').onclick=()=>action(async()=>{
    const value=current();if(!value)return;
    const info=await api.remoteInfo?.(value);
    await api.saveFavourite(info?{kind:'remote',location:info.uri}:{kind:'local',location:value});await refresh();status('Favourite saved.');
  });
  $('favourites-local').onclick=()=>action(async()=>{
    const previous=current(),location=await choose();
    if(api.platform==='web'&&previous)await api.reopenWorkspace(previous,false);
    // The folder picker closes this dialog; restore it after a selection or cancel.
    show('favourites-overlay');
    if(location){await api.saveFavourite({kind:'local',location});status('Favourite saved.');}
    await refresh();
  });
  $('favourites-remote').hidden=!api.connectRemoteFolder;
  $('favourites-remote').onclick=()=>remote({saveFavourite:true});
  documentRef.addEventListener('jotta:locale-changed',()=>{void refresh().catch(()=>{});});
  void refresh().catch(error=>report?.(message(error)));
  return {open:display,refresh};
}
