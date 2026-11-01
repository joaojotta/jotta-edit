import {tr} from './i18n.js';
import {splitBuildArguments} from '../shared/native-build.mjs';

const labels={python:'Python',php:'PHP',go:'Go',rust:'Rust',c:'C',cpp:'C++',ruby:'Ruby',lua:'Lua'};
export function installLanguageServerSettings({api,host,onApplied=()=>{},documentRef=document}){
  let generation=0,rows=[];
  const make=(tag,parent=host)=>{const node=documentRef.createElement(tag);parent.append(node);return node;};
  const note=make('p');note.className='settings-note';
  note.textContent=tr(api.listLanguageServers?'Uses language servers installed on your computer. Changes restart the servers. Quote arguments that contain spaces.':'External language servers require the desktop app. Built-in web language tools remain available.');
  const status=make('p');status.className='panel-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const controls=make('div');controls.className='language-server-controls';
  const apply=make('button',controls);apply.type='button';apply.textContent=tr('Apply language servers');
  const check=make('button',controls);check.type='button';check.textContent=tr('Check availability');
  const list=make('div');list.className='language-server-list';
  controls.hidden=!api.listLanguageServers;
  function render(servers){
    rows=[];list.replaceChildren();
    for(const server of servers){
      const row=make('fieldset',list);row.className='language-server-row';
      const legend=make('legend',row);legend.textContent=labels[server.lang]||server.lang;
      const state=make('p',row);state.className='language-server-state';
      state.textContent=tr(!server.enabled?'Disabled':server.status==='Running'?'Running':server.status?'Failed':server.available?'Available':'Not found');state.title=server.status||state.textContent;
      const field=(name,type)=>{const label=make('label',row);label.textContent=tr(name);const input=make('input',label);input.type=type;input.setAttribute('aria-label',legend.textContent+' · '+tr(name));return input;};
      const enabled=field('Enabled','checkbox');enabled.checked=server.enabled;enabled.parentElement.className='setting-check';
      const executable=field('Executable','text');executable.value=server.command[0]||'';executable.spellcheck=false;
      const args=field('Arguments','text');args.value=server.command.slice(1).map(argument=>/\s|["'\\]/.test(argument)||!argument?JSON.stringify(argument):argument).join(' ');args.spellcheck=false;
      rows.push({server,enabled,executable,args});
    }
  }
  async function refresh(){
    if(!api.listLanguageServers)return;
    const run=++generation;status.textContent=tr('Checking language servers…');apply.disabled=true;check.disabled=true;
    try{const servers=await api.listLanguageServers();if(run!==generation)return;render(servers);status.textContent='';}
    catch(error){if(run===generation)status.textContent=error.message;}
    finally{if(run===generation){apply.disabled=rows.length===0;check.disabled=false;}}
  }
  check.onclick=refresh;
  apply.onclick=async()=>{
    apply.disabled=true;check.disabled=true;
    try{
      const value={};for(const row of rows){
        if(!row.enabled.checked){value[row.server.lang]=false;continue;}
        const executable=row.executable.value.trim();if(!executable)throw new Error(tr('Choose a language server executable.'));
        value[row.server.lang]=[executable,...splitBuildArguments(row.args.value)];
      }
      render(await api.configureLanguageServers(value));onApplied();status.textContent=tr('Language servers updated.');
    }catch(error){status.textContent=error.message;}
    finally{apply.disabled=false;check.disabled=false;}
  };
  return {refresh};
}
