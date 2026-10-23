import {marked} from 'marked';
import createDOMPurify from 'dompurify';

export function markdownHTML(source){return marked.parse(source,{gfm:true,breaks:false,async:false});}
export function markdownFragment(source,documentRef=document){
  const purifier=createDOMPurify(documentRef.defaultView);
  const fragment=purifier.sanitize(markdownHTML(source),{
    RETURN_DOM_FRAGMENT:true,
    ALLOWED_TAGS:['h1','h2','h3','h4','h5','h6','p','br','hr','blockquote','pre','code','strong','b','em','i','del','s','u','sub','sup','ul','ol','li','table','thead','tbody','tfoot','tr','th','td','a','img','input','details','summary','div','span','kbd'],
    ALLOWED_ATTR:['href','src','alt','title','start','align','colspan','rowspan','type','checked','disabled','open'],
    ALLOW_DATA_ATTR:false,ALLOW_ARIA_ATTR:false
  });
  const links=new WeakMap(),images=[],headings=new Map(),counts=new Map();
  for(const image of fragment.querySelectorAll('img')){
    const reference=image.getAttribute('src');image.removeAttribute('src');
    image.loading='lazy';image.decoding='async';image.referrerPolicy='no-referrer';
    if(reference)images.push({node:image,reference});
  }
  for(const link of fragment.querySelectorAll('a')){
    const reference=link.getAttribute('href');link.removeAttribute('href');
    if(reference){links.set(link,reference);link.setAttribute('href','#');if(!link.title)link.title=reference;}
  }
  for(const input of fragment.querySelectorAll('input')){
    if(input.type!=='checkbox')input.remove();else{input.disabled=true;input.tabIndex=-1;}
  }
  for(const heading of fragment.querySelectorAll('h1,h2,h3,h4,h5,h6')){
    const base=heading.textContent.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu,'').replace(/\s+/g,'-')||'section';
    const number=counts.get(base)||0,slug=base+(number?'-'+number:'');counts.set(base,number+1);
    heading.id='markdown-preview-'+slug;headings.set(slug,heading);
  }
  return {fragment,links,images,headings};
}
