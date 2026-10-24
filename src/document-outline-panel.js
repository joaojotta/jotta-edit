import {tr} from './i18n.js';
import {documentOutline} from './document-outline.js';

export function installDocumentOutline({monaco,sidebar,documentRef=document,load=documentOutline}){
  const $=id=>documentRef.getElementById(id),panel=$('document-outline'),list=$('outline-list'),filter=$('outline-filter'),status=$('outline-status');
  let doc=null,editor=null,trackedModel=null,entries=[],rows=[],generation=0,timer,version=0,subscriptions=[];
  function highlight(){
    const position=editor?.getPosition();let active=-1;
    if(position)for(let i=0;i<rows.length;i++){const item=rows[i].item;if((position.lineNumber>item.line||position.lineNumber===item.line&&position.column>=item.column)&&(position.lineNumber<item.endLine||position.lineNumber===item.endLine&&position.column<=item.endColumn))active=i;}
    rows.forEach(({button},index)=>{button.classList.toggle('current',index===active);if(index===active)button.setAttribute('aria-current','location');else button.removeAttribute('aria-current');});
  }
  function render(){
    list.replaceChildren();rows=[];const query=filter.value.trim().toLocaleLowerCase();
    for(const item of entries){
      if(query&&!item.name.toLocaleLowerCase().includes(query))continue;
      const li=documentRef.createElement('li'),button=documentRef.createElement('button'),name=documentRef.createElement('span'),line=documentRef.createElement('small');
      button.type='button';button.className='outline-entry';button.style.paddingInlineStart=`${10+Math.min(item.depth,8)*12}px`;
      name.textContent=item.name;line.textContent=String(item.line);button.title=`${tr(item.kind)} · ${tr('Line')} ${item.line} · ${item.name}`;
      button.setAttribute('aria-label',button.title);button.append(name,line);li.append(button);list.append(li);rows.push({button,item});
      button.onclick=()=>{if(!doc||doc.model.isDisposed()||doc.model.getVersionId()!==version)return;const position={lineNumber:item.line,column:item.column};editor.setPosition(position);editor.revealPositionInCenter(position);editor.focus();highlight();};
    }
    if(query&&!rows.length)status.textContent=tr('No outline entries match.');
    highlight();
  }
  async function refresh(){
    clearTimeout(timer);const run=++generation;entries=[];list.replaceChildren();rows=[];
    if(panel.hidden)return;
    if(!doc){$('outline-document').textContent='';status.textContent=tr('Open a document to see its outline.');return;}
    const model=doc.model;version=model.getVersionId();const requestedVersion=version;
    $('outline-document').textContent=doc.name;status.textContent=tr('Loading outline…');
    try{
      const result=await load(model,monaco);
      if(run!==generation||model.isDisposed()||model.getVersionId()!==requestedVersion)return;
      entries=result.entries;status.textContent=tr(!result.supported?'Outline supports Markdown, HTML, JavaScript, TypeScript, PHP, Python and CSS.':result.tooLarge?'This document is too large for the outline.':result.limited?'Showing the first 1,000 outline entries.':entries.length?'Select an entry to jump to it.':'No headings, elements, functions or selectors found.');render();
    }catch{if(run===generation)status.textContent=tr('Could not load outline. Try Refresh.');}
  }
  function schedule(){++generation;clearTimeout(timer);entries=[];rows=[];list.replaceChildren();if(!panel.hidden)timer=setTimeout(refresh,220);}
  function activate(next,target){
    if(doc===next&&editor===target&&trackedModel===next?.model){highlight();return;}
    subscriptions.forEach(x=>x.dispose());subscriptions=[];doc=next;editor=target;trackedModel=next?.model;
    if(doc){subscriptions.push(doc.model.onDidChangeContent(schedule));if(editor?.onDidChangeCursorPosition)subscriptions.push(editor.onDidChangeCursorPosition(highlight));}
    schedule();
  }
  const languageListener=monaco.editor.onDidChangeModelLanguage?.(event=>{if(event.model===doc?.model)schedule();});
  sidebar.onShow('outline',refresh);$('btn-outline').onclick=()=>sidebar.show('outline');$('outline-refresh').onclick=refresh;
  filter.addEventListener('input',()=>{status.textContent=tr('Select an entry to jump to it.');render();});
  list.addEventListener('keydown',event=>{if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key)||!rows.length)return;event.preventDefault();const index=rows.findIndex(row=>row.button===documentRef.activeElement);rows[event.key==='Home'?0:event.key==='End'?rows.length-1:Math.max(0,Math.min(rows.length-1,index+(event.key==='ArrowDown'?1:-1)))].button.focus();});
  documentRef.addEventListener('jotta:locale-changed',()=>{if(!panel.hidden)refresh();});
  return {activate,show:()=>sidebar.show('outline'),refresh,dispose(){++generation;clearTimeout(timer);subscriptions.forEach(x=>x.dispose());languageListener?.dispose();}};
}
