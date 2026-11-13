'use strict';
function panelDom(ids){
  const documentListeners=new Map();
  const elements={},documentRef={activeElement:null,fullscreenElement:null,
    addEventListener(type,handler){if(!documentListeners.has(type))documentListeners.set(type,new Set());documentListeners.get(type).add(handler);},
    removeEventListener(type,handler){documentListeners.get(type)?.delete(handler);},
    dispatch(type,event={}){for(const handler of documentListeners.get(type)||[])handler(event);},
    async exitFullscreen(){this.fullscreenElement=null;this.dispatch('fullscreenchange');},
    getElementById:id=>elements[id],createElement:tag=>element(tag)};
  function element(tag='div'){
    const classes=new Set(),attributes={},listeners={},captured=new Set();
    return {tag,children:[],style:{},dataset:{},hidden:false,value:'',textContent:'',scrollTop:0,
      classList:{toggle(name,value){if(value===undefined)value=!classes.has(name);value?classes.add(name):classes.delete(name);},contains:name=>classes.has(name)},
      append(...nodes){for(const node of nodes){if(node.parentElement)node.remove();node.parentElement=this;this.children.push(node);}},
      replaceChildren(...nodes){this.children=[];this.append(...nodes);},
      remove(){if(this.parentElement){const siblings=this.parentElement.children;const index=siblings.indexOf(this);if(index>=0)siblings.splice(index,1);this.parentElement=null;}},
      setAttribute:(name,value)=>{attributes[name]=value;},removeAttribute:name=>{delete attributes[name];},getAttribute:name=>attributes[name],
      addEventListener(type,handler){listeners[type]=handler;},dispatch(type,event={}){return listeners[type]?.(event);},
      focus(){documentRef.activeElement=this;},
      getBoundingClientRect(){return {height:parseFloat(this.style.height)||this.clientHeight||0,width:this.clientWidth||0,top:0,left:0};},
      setPointerCapture(id){captured.add(id);},hasPointerCapture(id){return captured.has(id);},
      releasePointerCapture(id){captured.delete(id);this.dispatch('lostpointercapture',{pointerId:id});},
      contains(node){return this===node||this.children.some(child=>child.contains(node));},
      matches(selector){return selector===':hover'&&this.hovered===true;},
      async requestFullscreen(){documentRef.fullscreenElement=this;documentRef.dispatch('fullscreenchange');},
      querySelectorAll(selector){const out=[];for(const child of this.children){if(child.tag===selector)out.push(child);out.push(...child.querySelectorAll(selector));}return out;}
    };
  }
  for(const id of ids)elements[id]=element();
  return {documentRef,elements};
}
module.exports={panelDom};
