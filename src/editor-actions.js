/** Keep the tab strip compact while retaining the original action buttons and handlers. */
export function installEditorActions({documentRef=document,windowRef=window,beforeOpen=()=>{},focusEditor=()=>{}}={}){
  const trigger=documentRef.getElementById('btn-editor-actions');
  const menu=documentRef.getElementById('editor-actions-menu');
  const items=()=>[...menu.querySelectorAll('button')].filter(button=>!button.hidden&&!button.disabled);
  function close(restoreFocus=false){
    if(menu.hidden)return;
    menu.hidden=true;
    trigger.setAttribute('aria-expanded','false');
    if(restoreFocus)trigger.focus();
  }
  function open(last=false){
    beforeOpen();
    menu.hidden=false;
    trigger.setAttribute('aria-expanded','true');
    const anchor=trigger.getBoundingClientRect(),bounds=menu.getBoundingClientRect();
    menu.style.left=Math.max(8,Math.min(windowRef.innerWidth-bounds.width-8,anchor.right-bounds.width))+'px';
    menu.style.top=Math.max(8,Math.min(windowRef.innerHeight-bounds.height-8,anchor.bottom+4))+'px';
    (last?items().at(-1):items()[0])?.focus();
  }
  trigger.addEventListener('click',()=>menu.hidden?open():close(true));
  trigger.addEventListener('keydown',event=>{
    if(!['ArrowDown','ArrowUp'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();open(event.key==='ArrowUp');
  });
  menu.addEventListener('keydown',event=>{
    if(event.key==='Escape'){
      event.preventDefault();event.stopPropagation();close(true);
    }else if(event.key==='Tab'){
      // Resume the normal tab sequence from the trigger, never from a hidden item.
      close(true);
    }else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      event.preventDefault();event.stopPropagation();
      const buttons=items(),index=buttons.indexOf(documentRef.activeElement);
      const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:
        (index+(event.key==='ArrowDown'?1:buttons.length-1))%buttons.length;
      buttons[next]?.focus();
    }
  });
  // Close before the original click handlers run, so commands may focus their own UI.
  menu.addEventListener('click',event=>{
    const button=event.target.closest('button');
    if(!button||!menu.contains(button)||button.disabled)return;
    close();focusEditor();
  },true);
  const outside=event=>{if(!menu.hidden&&!menu.contains(event.target)&&!trigger.contains(event.target))close();};
  documentRef.addEventListener('pointerdown',outside);
  documentRef.addEventListener('focusin',outside);
  documentRef.addEventListener('jotta:locale-changed',()=>close());
  windowRef.addEventListener('resize',()=>close());
  windowRef.addEventListener('blur',()=>close());
  return {close};
}
