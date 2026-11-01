import {tr} from './i18n.js';
const labels={list:'List folder',read:'Download',save:'Save',create:'Create',move:'Move',delete:'Move to remote trash'};
const states={connected:'Connected',connecting:'Connecting…',disconnected:'Disconnected',failed:'Failed',queued:'Queued',running:'In progress',completed:'Completed'};
export function transferText(operation){
  const bytes=value=>value<1024?`${value} B`:value>=1048576?`${(value/1048576).toFixed(1)} MiB`:`${(value/1024).toFixed(value<10240?1:0)} KiB`;
  return operation.total===null?bytes(operation.transferred):`${bytes(operation.transferred)} / ${bytes(operation.total)}`;
}
export function installRemoteConnectionPanel({api,sidebar,reconnect,retry,notify=()=>{},documentRef=document}){
  const $=id=>documentRef.getElementById(id),panel=$('remote-connections'),connections=$('remote-connection-list'),operations=$('remote-operation-list'),message=$('remote-panel-status');
  let snapshot={revision:-1,connections:[],operations:[]},pending=new Set(),disposed=false;
  const node=(tag,className,text)=>{const el=documentRef.createElement(tag);el.className=className;if(text!==undefined)el.textContent=text;return el;};
  const action=(text,key,callback)=>{
    const button=node('button','panel-action',tr(text));button.type='button';button.dataset.actionKey=key;button.disabled=pending.has(key);
    button.onclick=async()=>{if(pending.has(key))return;pending.add(key);button.disabled=true;
      try{await callback();}catch(error){message.textContent=tr(error.message.replace(/^Error invoking remote method '[^']+': Error: /,''));notify(message.textContent);}
      finally{pending.delete(key);render();}
    };return button;
  };
  function render(){
    if(panel.hidden||disposed)return;
    const focused=documentRef.activeElement?.dataset?.actionKey,scroll=panel.scrollTop;
    connections.replaceChildren();operations.replaceChildren();
    for(const connection of snapshot.connections){
      const card=node('li','remote-connection-card'),address=node('p','remote-address',connection.uri),state=node('span','remote-state',tr(states[connection.status]||connection.status));state.dataset.state=connection.status;
      const button=action('Reconnect','connect:'+connection.root,()=>reconnect(connection));button.disabled=button.disabled||connection.status==='connecting'||snapshot.operations.some(op=>op.root===connection.root&&['queued','running'].includes(op.status));
      card.append(address,state,button);connections.append(card);
    }
    $('remote-panel-empty').hidden=snapshot.connections.length>0;
    for(const operation of [...snapshot.operations].reverse()){
      const card=node('li','remote-operation');card.dataset.state=operation.status;
      const heading=node('div','remote-operation-heading'),label=node('strong','',tr(labels[operation.kind]||'Operation')),state=node('span','remote-state',tr(states[operation.status]));
      heading.append(label,state);
      const path=operation.file===operation.root?'/':operation.file.slice(operation.root.length+1).replace(/\\/g,'/');
      card.append(heading,node('p','remote-operation-path',path));
      if(['running','queued'].includes(operation.status))card.append(node('p','remote-phase',tr(operation.phase)));
      if(operation.status==='completed'&&operation.total!==null&&['read','save'].includes(operation.kind))card.append(node('small','remote-bytes',transferText(operation)));
      if(operation.status==='running'&&['read','save'].includes(operation.kind)){
        const progress=node('progress','remote-progress');progress.max=operation.total||1;
        progress.setAttribute('aria-label',tr(operation.phase));if(operation.total!==null)progress.value=Math.min(operation.transferred,progress.max);
        card.append(progress,node('small','remote-bytes',transferText(operation)));
      }
      if(operation.status==='failed'){
        card.append(node('p','remote-operation-error',tr(operation.error)));
        const controls=node('div','panel-actions');
        if(operation.retryable)controls.append(action(operation.kind==='save'?'Retry save':'Retry','retry:'+operation.id,async()=>{if(await retry(operation)!==false)await api.dismissRemoteOperation(operation.id);}));
        else card.append(node('p','remote-phase',tr('Review this operation in Explorer before repeating it.')));
        controls.append(action('Dismiss','dismiss:'+operation.id,()=>api.dismissRemoteOperation(operation.id)));card.append(controls);
      }
      operations.append(card);
    }
    $('remote-operation-empty').hidden=snapshot.operations.length>0;
    if(focused)for(const button of panel.querySelectorAll('button'))if(button.dataset.actionKey===focused){button.focus({preventScroll:true});break;}
    panel.scrollTop=scroll;
  }
  function receive(value){if(disposed||value.revision<snapshot.revision)return;snapshot=value;render();}
  const unsubscribe=api.onRemoteActivity?.(receive);
  if(api.getRemoteActivity)api.getRemoteActivity().then(receive).catch(()=>{message.textContent=tr('Could not load connection activity.');});
  sidebar.onShow('connections',render);$('btn-connections').hidden=!api.getRemoteActivity;$('btn-connections').onclick=()=>sidebar.show('connections');
  $('remote-panel-connect').onclick=()=>reconnect(null);
  $('remote-panel-clear').onclick=()=>api.clearRemoteCompleted?.().catch(error=>{message.textContent=error.message;});
  documentRef.addEventListener('jotta:locale-changed',render);
  return {show:()=>sidebar.show('connections'),dispose(){disposed=true;unsubscribe?.();}};
}
