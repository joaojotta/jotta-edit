'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {panelDom}=require('./fixtures/panel-dom.cjs');
async function fixture(){
  const {installEditorActions}=await import('../src/editor-actions.js');
  const {documentRef,elements}=panelDom(['btn-editor-actions','editor-actions-menu']);
  const trigger=elements['btn-editor-actions'],menu=elements['editor-actions-menu'];
  const handlers={},windowHandlers={};let editorFocus=0,beforeOpen=0;
  documentRef.addEventListener=(type,fn)=>{handlers[type]=fn;};
  const windowRef={innerWidth:800,innerHeight:600,addEventListener(type,fn){windowHandlers[type]=fn;}};
  trigger.getBoundingClientRect=()=>({right:798,bottom:40});
  menu.getBoundingClientRect=()=>({width:320,height:290});menu.hidden=true;
  menu.contains=target=>menu===target||menu.children.includes(target);
  trigger.contains=target=>target===trigger;
  const buttons=Array.from({length:7},()=>documentRef.createElement('button'));
  buttons.forEach(button=>{button.closest=selector=>selector==='button'?button:null;});
  menu.append(...buttons);buttons[2].hidden=true;buttons[3].disabled=true;
  const controller=installEditorActions({documentRef,windowRef,focusEditor(){editorFocus++;},beforeOpen(){beforeOpen++;}});
  function key(node,key){
    const event={key,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};
    node.dispatch('keydown',event);return event;
  }
  return {trigger,menu,buttons,documentRef,controller,key,handlers,windowHandlers,
    get editorFocus(){return editorFocus;},get beforeOpen(){return beforeOpen;}};
}
test('actions menu opens from the trigger, stays inside the viewport and skips hidden or disabled actions',async()=>{
  const f=await fixture();f.trigger.dispatch('click');
  assert.equal(f.menu.hidden,false);assert.equal(f.trigger.getAttribute('aria-expanded'),'true');
  assert.equal(f.beforeOpen,1);assert.equal(f.documentRef.activeElement,f.buttons[0]);
  assert.equal(f.menu.style.left,'472px');assert.equal(f.menu.style.top,'44px');
  f.key(f.menu,'ArrowDown');assert.equal(f.documentRef.activeElement,f.buttons[1]);
  f.key(f.menu,'ArrowDown');assert.equal(f.documentRef.activeElement,f.buttons[4]);
  f.key(f.menu,'End');assert.equal(f.documentRef.activeElement,f.buttons[6]);
  f.key(f.menu,'ArrowDown');assert.equal(f.documentRef.activeElement,f.buttons[0]);
  f.key(f.menu,'ArrowUp');assert.equal(f.documentRef.activeElement,f.buttons[6]);
  f.key(f.menu,'Home');assert.equal(f.documentRef.activeElement,f.buttons[0]);
});
test('Escape and Tab close the popup and restore its trigger; ArrowUp opens at the last action',async()=>{
  const f=await fixture();f.key(f.trigger,'ArrowUp');
  assert.equal(f.documentRef.activeElement,f.buttons[6]);
  const escape=f.key(f.menu,'Escape');assert.equal(escape.prevented,true);assert.equal(escape.stopped,true);
  assert.equal(f.menu.hidden,true);assert.equal(f.trigger.getAttribute('aria-expanded'),'false');
  assert.equal(f.documentRef.activeElement,f.trigger);
  f.key(f.trigger,'ArrowDown');const tab=f.key(f.menu,'Tab');
  assert.equal(f.menu.hidden,true);assert.equal(f.documentRef.activeElement,f.trigger);assert.equal(tab.prevented,undefined);
});
test('choosing an action closes before its handler and restores editor focus; disabled actions stay inactive',async()=>{
  const f=await fixture();f.trigger.dispatch('click');
  f.menu.dispatch('click',{target:f.buttons[3]});assert.equal(f.menu.hidden,false);assert.equal(f.editorFocus,0);
  f.menu.dispatch('click',{target:f.buttons[4]});assert.equal(f.menu.hidden,true);assert.equal(f.editorFocus,1);
});
test('outside focus or clicks, resize, blur and locale changes dismiss without stealing focus',async()=>{
  const f=await fixture();
  for(const [registry,type] of [[f.handlers,'pointerdown'],[f.handlers,'focusin'],[f.handlers,'jotta:locale-changed'],[f.windowHandlers,'resize'],[f.windowHandlers,'blur']]){
    f.trigger.dispatch('click');
    f.handlers.pointerdown({target:f.buttons[1]});assert.equal(f.menu.hidden,false);
    registry[type]({target:{}});assert.equal(f.menu.hidden,true);
    assert.equal(f.trigger.getAttribute('aria-expanded'),'false');
  }
  assert.equal(f.editorFocus,0);
});
