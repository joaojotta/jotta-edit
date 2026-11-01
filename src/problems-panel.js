import {tr} from './i18n.js';

export function installProblemsPanel({monaco,sidebar,getDocuments,openFile,documentRef=document}){
  const $=id=>documentRef.getElementById(id),list=$('problems-list'),status=$('problems-status'),filter=$('problems-filter');
  function render(){
    if($('problems-panel').hidden)return;
    list.replaceChildren();const query=filter.value.trim().toLocaleLowerCase();let total=0,shown=0;
    for(const doc of getDocuments()){
      const markers=monaco.editor.getModelMarkers({resource:doc.model.uri}).sort((a,b)=>b.severity-a.severity||a.startLineNumber-b.startLineNumber);
      for(const marker of markers){
        total++;
        if(shown>=1000||query&&!`${doc.name} ${marker.message} ${marker.source||''}`.toLocaleLowerCase().includes(query))continue;
        shown++;
        const item=documentRef.createElement('li'),button=documentRef.createElement('button'),message=documentRef.createElement('span'),location=documentRef.createElement('small');
        const severity=marker.severity===monaco.MarkerSeverity.Error?'Error':marker.severity===monaco.MarkerSeverity.Warning?'Warning':'Information';
        button.type='button';button.className='problem-entry';button.dataset.severity=severity.toLowerCase();
        message.textContent=tr(severity)+': '+marker.message;
        location.textContent=`${doc.name}:${marker.startLineNumber}:${marker.startColumn}${marker.source?' · '+marker.source:''}`;
        button.title=message.textContent+'\n'+(doc.path||doc.name);button.append(message,location);item.append(button);list.append(item);
        button.onclick=()=>openFile(doc.path,{documentId:doc.id,line:marker.startLineNumber,column:marker.startColumn});
      }
    }
    status.textContent=total?`${tr('Problems')}: ${total}${shown!==total?' · '+tr('Showing')+': '+shown:''}`:tr('No problems in open documents.');
  }
  const changed=monaco.editor.onDidChangeMarkers(render);
  filter.addEventListener('input',render);documentRef.addEventListener('jotta:locale-changed',render);
  sidebar.onShow('problems',render);$('btn-problems').onclick=()=>sidebar.show('problems');
  return {refresh:render,show:()=>sidebar.show('problems'),dispose(){changed.dispose();documentRef.removeEventListener('jotta:locale-changed',render);}};
}
