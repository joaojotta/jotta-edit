import {markdownFragment} from './markdown-renderer.js';
import {markdownTarget} from '../shared/markdown-paths.mjs';

const MAX_SOURCE=1024*1024, MAX_IMAGES=64, MAX_IMAGE_BYTES=20*1024*1024;
const dataImage=/^data:image\/(?:png|jpeg|gif|webp|avif|svg\+xml|bmp|x-icon);base64,[a-z0-9+/=\s]+$/i;
const escapeHTML=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);

// Export uses a fixed light palette so documents remain readable outside the app.
const styles=`
:root{color-scheme:light;font:16px/1.7 system-ui,-apple-system,"Segoe UI",sans-serif;color:#24292f;background:#fff}
body{max-width:860px;margin:0 auto;padding:40px;overflow-wrap:anywhere}
h1,h2,h3,h4,h5,h6{line-height:1.3;margin:1.4em 0 .7em;font-weight:600;break-after:avoid}
h1{font-size:2em}h2{font-size:1.6em}h3{font-size:1.3em}h1,h2{padding-bottom:.3em;border-bottom:1px solid #d0d7de}
main>:first-child{margin-top:0}p,ul,ol,blockquote,pre,table{margin:0 0 1em}ul,ol{padding-left:2em}li>p{margin:.4em 0}
ul:has(>li>input[type=checkbox]){list-style:none;padding-left:1em}input[type=checkbox]{margin-right:.5em}
a{color:#0969da;text-decoration:underline}img{max-width:100%;height:auto}
.markdown-export-missing-image{display:inline-block;padding:8px 12px;border:1px dashed #8c959f;border-radius:4px;background:#f6f8fa;color:#57606a;font-style:italic}
code,kbd{font: .85em/1.6 ui-monospace,monospace;background:#f6f8fa;border-radius:3px;padding:2px 4px}
pre{background:#f6f8fa;padding:14px;border:1px solid #d0d7de;border-radius:5px;overflow:auto}
pre code{padding:0;background:none;white-space:pre-wrap;overflow-wrap:anywhere}
blockquote{border-left:3px solid #0969da;padding:0 1em;color:#57606a}hr{border:0;border-top:1px solid #d0d7de;margin:1.5em 0}
table{border-collapse:collapse;max-width:100%}th,td{border:1px solid #d0d7de;padding:6px 10px}th{background:#f6f8fa}
@page{size:A4;margin:18mm}
@media print{body{max-width:none;margin:0;padding:0;font-size:11pt}pre{overflow:visible}thead{display:table-header-group}tr,img{break-inside:avoid}a{color:inherit}}
@media(max-width:600px){body{padding:20px}}
`;

export function markdownExportName(name,format){
  const stem=String(name||'untitled').replace(/\.(?:md|markdown)$/i,'').replace(/[\\/\x00-\x1f<>:"|?*]/g,'_').replace(/[. ]+$/,'')||'untitled';
  return stem+'.'+format;
}

export async function exportMarkdownDocument({format,source,name,documentPath,root,api,getProtectedPaths=()=>[]},
  {render=markdownExportHTML,onPreparing=()=>{}}={}){
  const filename=markdownExportName(name,format);
  let destination;
  if(api.chooseMarkdownExport){
    const selected=await api.chooseMarkdownExport({format,name:filename,documentPath,protectedPaths:getProtectedPaths()});
    if(selected.canceled)return selected;
    destination=selected.path;
  }
  onPreparing();
  const missingImages=new Set();
  const html=await render({source,name,documentPath,root,readAsset:params=>api.readMarkdownAsset(params),onMissingImage:reference=>missingImages.add(reference)});
  const result=await api.exportMarkdown({format,name:filename,html,...(destination===undefined?{}:{destination}),protectedPaths:getProtectedPaths()});
  return missingImages.size?{...result,missingImages:[...missingImages]}:result;
}

export async function embedMarkdownExportImages({images,documentPath,root,readAsset,documentRef=document}){
  if(images.length>MAX_IMAGES)throw new Error('Markdown export supports up to 64 images.');
  let bytes=0;
  const cache=new Map(),missingImages=new Set();
  function unavailable(node,reference){
    const placeholder=documentRef.createElement('span');placeholder.className='markdown-export-missing-image';
    const portuguese=documentRef.documentElement.lang==='pt-PT',label=portuguese?'Imagem indisponível':'Image unavailable';
    const description=reference.startsWith('data:')?(portuguese?'imagem incorporada':'embedded image'):reference;
    placeholder.textContent=label+': '+description+(node.alt?' ('+node.alt+')':'');
    node.replaceWith(placeholder);missingImages.add(reference);
  }
  for(const {node,reference} of images){
    const target=markdownTarget(reference,documentPath,root);
    if(target?.kind==='external'&&target.url.startsWith('https:'))node.src=target.url;
    else {
      let image=cache.get(reference);
      if(cache.has(reference)&&image===null){unavailable(node,reference);continue;}
      if(!image){
        try{
          image=dataImage.test(reference)?{url:reference,bytes:Math.ceil(reference.split(',')[1].replace(/\s/g,'').length*3/4)}:
            target?.kind==='file'?await readAsset({reference,documentPath,root}):null;
          if(!image||!dataImage.test(image.url)||!Number.isFinite(image.bytes)||image.bytes<0||image.bytes>5*1024*1024)throw new Error();
        }catch{cache.set(reference,null);unavailable(node,reference);continue;}
        bytes+=image.bytes;
        if(bytes>MAX_IMAGE_BYTES)throw new Error('Markdown export images exceed 20 MiB.');
        cache.set(reference,image);
      }
      node.src=image.url;
    }
    node.loading='eager';
  }
  return [...missingImages];
}

export async function markdownExportHTML({source,name,documentPath,root,readAsset,onMissingImage=()=>{},documentRef=document}){
  if(new TextEncoder().encode(source).length>MAX_SOURCE)throw new Error('Markdown export supports files up to 1 MiB.');
  const rendered=markdownFragment(source,documentRef);
  for(const anchor of rendered.fragment.querySelectorAll('a')){
    const reference=rendered.links.get(anchor),target=markdownTarget(reference,documentPath,root);
    if(target?.kind==='external')anchor.href=target.url;
    else if(target?.kind==='anchor')anchor.setAttribute('href','#'+(rendered.headings.get(target.fragment)?.id||target.fragment));
    else if(target?.kind==='file')anchor.setAttribute('href',reference);
    else anchor.removeAttribute('href');
    anchor.setAttribute('rel','noopener noreferrer');
  }
  const missingImages=await embedMarkdownExportImages({images:rendered.images,documentPath,root,readAsset,documentRef});
  for(const reference of missingImages)onMissingImage(reference);
  const container=documentRef.createElement('main');container.appendChild(rendered.fragment);
  return `<!doctype html>
<html lang="${documentRef.documentElement.lang==='pt-PT'?'pt-PT':'en'}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer"><title>${escapeHTML(String(name||'untitled').replace(/\.(?:md|markdown)$/i,''))}</title>
<style>${styles}</style></head><body>${container.outerHTML}</body></html>`;
}
