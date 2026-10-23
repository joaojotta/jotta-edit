'use strict';
function panelDom(ids){
  const elements={},documentRef={activeElement:null,addEventListener(){},getElementById:id=>elements[id],createElement:tag=>element(tag)};
  function element(tag='div'){
    const classes=new Set(),attributes={},listeners={};
    return {tag,children:[],style:{},dataset:{},hidden:false,value:'',textContent:'',scrollTop:0,
      classList:{toggle(name,value){if(value===undefined)value=!classes.has(name);value?classes.add(name):classes.delete(name);},contains:name=>classes.has(name)},
      append(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node);}},
      replaceChildren(...nodes){this.children=[];this.append(...nodes);},
      setAttribute:(name,value)=>{attributes[name]=value;},removeAttribute:name=>{delete attributes[name];},getAttribute:name=>attributes[name],
      addEventListener(type,handler){listeners[type]=handler;},dispatch(type,event={}){return listeners[type]?.(event);},
      focus(){documentRef.activeElement=this;},
      querySelectorAll(selector){const out=[];for(const child of this.children){if(child.tag===selector)out.push(child);out.push(...child.querySelectorAll(selector));}return out;}
    };
  }
  for(const id of ids)elements[id]=element();
  return {documentRef,elements};
}
module.exports={panelDom};
