import {markdownFragment} from './markdown-renderer.js';
import {markdownEdits} from './markdown-formatting.js';
import {markdownTarget} from '../shared/markdown-paths.mjs';
import {tr} from './i18n.js';
import {exportMarkdownDocument} from './markdown-export.js';

const tools=[
  ['bold','Bold','bold.svg'],['italic','Italic','italic.svg'],['underline','Underline','underline.svg'],['strike','Strikethrough','strikethrough.svg'],
  ['subscript','Subscript','subscript.svg'],['superscript','Superscript','superscript.svg'],
  ['link','Insert link','link-m.svg'],['image','Insert image','file-image.svg'],['code','Inline code','code.svg'],['code-block','Code block','code.svg'],
  ['quote','Block quote','double-quotes-r.svg'],['unordered','Bulleted list','list-unordered.svg'],['ordered','Numbered list','list-ordered.svg'],
  ['checklist','Checklist','list-check-3.svg'],['rule','Horizontal rule','horizontal-rule.svg'],['table','Insert table','table-2.svg']
];
export function installMarkdownPanel({monaco,api,getRoot,getEditor,getDocument,getDocuments=()=>[],openFile,layout,format,notify,storage=localStorage}){
  const $=id=>document.getElementById(id),toolbar=$('markdown-tools'),preview=$('markdown-preview'),content=$('markdown-content'),divider=$('markdown-divider'),wrap=$('editor-wrap');
  let doc=null,target=null,subscriptions=[],timer,revision=0,current=null,identity='',cache=new Map(),cacheBytes=0;
  let shown=true,ratio=.5;try{shown=storage.getItem('jotta.markdownPreview')!=='false';ratio=Number(storage.getItem('jotta.markdownRatio'))||.5;}catch{}
  const valid=()=>doc&&doc===getDocument()&&doc.model.getLanguageId()==='markdown';
  function button(parent,action,label,icon){
    const node=document.createElement('button');node.type='button';node.className='markdown-tool';node.dataset.markdownAction=action;
    node.title=tr(label);node.setAttribute('aria-label',tr(label));const image=document.createElement('img');image.className='button-icon';image.src=new URL('./ui-icons/'+icon,document.baseURI).href;image.alt='';image.draggable=false;node.appendChild(image);parent.appendChild(node);return node;
  }
  const headingGroup=document.createElement('div');headingGroup.className='markdown-heading-group';toolbar.appendChild(headingGroup);
  const headingButton=button(headingGroup,'heading-menu','Heading','heading.svg');headingButton.setAttribute('aria-expanded','false');
  const headingMenu=document.createElement('div');headingMenu.id='markdown-headings';headingMenu.className='markdown-heading-menu';headingMenu.hidden=true;headingMenu.setAttribute('role','group');headingMenu.setAttribute('aria-label',tr('Heading level'));headingGroup.appendChild(headingMenu);headingButton.setAttribute('aria-controls',headingMenu.id);
  for(let depth=1;depth<=6;depth++)button(headingMenu,'heading-'+depth,'Heading '+depth,'h-'+depth+'.svg');
  for(const [action,label,icon] of tools)button(toolbar,action,label,icon);
  button(toolbar,'format','Format Markdown','formatter.svg');
  const toggle=button(toolbar,'preview','Markdown preview','markdown-preview.svg');toggle.setAttribute('aria-controls','markdown-preview');
  const exportButtons=['html','pdf'].map(format=>{
    const node=document.createElement('button');node.type='button';node.className='markdown-tool markdown-export-tool';
    node.dataset.markdownAction='export-'+format;node.textContent=format.toUpperCase();
    node.title=tr('Export Markdown as '+format.toUpperCase());node.setAttribute('aria-label',node.title);toolbar.appendChild(node);return node;
  });
  const exportStatus=document.createElement('span');exportStatus.className='markdown-export-status';exportStatus.hidden=true;
  exportStatus.setAttribute('role','status');exportStatus.setAttribute('aria-live','polite');toolbar.appendChild(exportStatus);
  function reportExport(message,error=false){
    exportStatus.textContent=message;exportStatus.hidden=false;exportStatus.setAttribute('role',error?'alert':'status');
    notify(message);layout();
  }
  let exporting=false;
  async function exportDocument(format){
    if(!valid()){notify(tr('Open a Markdown file to export.'));return;}
    if(exporting)return;
    exporting=true;for(const node of exportButtons)node.disabled=true;
    try{
      // Snapshot before the chooser opens, so later edits cannot mix documents.
      const active=doc,source=active.model.getValue(),name=active.name,documentPath=active.path,root=getRoot();
      reportExport(tr(api.chooseMarkdownExport?'Choose where to export Markdown.':'Preparing Markdown export…'));
      const result=await exportMarkdownDocument({format,source,name,documentPath,root,api,
        getProtectedPaths:()=>getDocuments().map(item=>item.path).filter(Boolean)},
        {onPreparing:()=>reportExport(tr('Preparing Markdown export…'))});
      if(result?.canceled)reportExport(tr('Markdown export cancelled.'));
      else {
        const message=result?.path?tr('Exported to:')+' '+result.path:tr(result?.printing?'Print dialog opened. Choose Save as PDF.':'Markdown exported.');
        reportExport(message+(result?.missingImages?.length?' '+tr('Unavailable images were replaced with labelled placeholders.')+' '+result.missingImages.filter(reference=>!reference.startsWith('data:')).join(', '):''));
      }
    }catch(error){
      const detail=error.message.replace(/^Error invoking remote method '[^']+': Error: /,'');
      reportExport(tr('Could not export Markdown.')+' '+tr(detail),true);
      console.error('Markdown export failed:',error);
    }
    finally{exporting=false;for(const node of exportButtons)node.disabled=false;}
  }
  function closeHeading(){headingMenu.hidden=true;headingButton.setAttribute('aria-expanded','false');}
  toolbar.addEventListener('pointerdown',event=>{if(event.button===0&&event.target.closest('button'))event.preventDefault();});
  toolbar.addEventListener('click',event=>{
    const action=event.target.closest('[data-markdown-action]')?.dataset.markdownAction;if(!action)return;
    if(action==='heading-menu'){headingMenu.hidden=!headingMenu.hidden;headingButton.setAttribute('aria-expanded',String(!headingMenu.hidden));return;}
    closeHeading();if(action==='preview'){togglePreview();return;}if(action==='format'){format();return;}
    if(action.startsWith('export-')){void exportDocument(action.slice(7));return;}apply(action);
  });
  document.addEventListener('pointerdown',event=>{if(!headingGroup.contains(event.target))closeHeading();});
  toolbar.addEventListener('keydown',event=>{if(event.key==='Escape'){closeHeading();getEditor()?.focus();}});
  function apply(action){
    if(!valid())return;const editor=getEditor(),model=doc.model;if(editor?.getModel()!==model)return;
    try{
      const edits=markdownEdits(model.getValue(),editor.getSelections().map(selection=>({start:model.getOffsetAt(selection.getStartPosition()),end:model.getOffsetAt(selection.getEndPosition())})),action);
      const selections=[];let delta=0;
      for(const edit of edits){selections.push([edit.selectionStart+delta,edit.selectionEnd+delta]);delta+=edit.text.length-(edit.end-edit.start);}
      editor.pushUndoStop();editor.executeEdits('markdown-tools',edits.map(edit=>({range:monaco.Range.fromPositions(model.getPositionAt(edit.start),model.getPositionAt(edit.end)),text:edit.text,forceMoveMarkers:true})),()=>selections.map(([start,end])=>{const a=model.getPositionAt(start),b=model.getPositionAt(end);return new monaco.Selection(a.lineNumber,a.column,b.lineNumber,b.column);}));editor.pushUndoStop();editor.focus();
    }catch(error){notify(tr(error.message));}
  }
  function visible(){
    const markdown=Boolean(valid());toolbar.hidden=!markdown;preview.hidden=!markdown||!shown;divider.hidden=preview.hidden;
    $('btn-markdown-preview').hidden=!markdown;toggle.setAttribute('aria-pressed',String(!preview.hidden));$('btn-markdown-preview').setAttribute('aria-pressed',String(!preview.hidden));
    wrap.classList.toggle('markdown-open',!preview.hidden);if(!markdown)closeHeading();layout();
  }
  function schedule(){clearTimeout(timer);++revision;if(valid()&&shown)timer=setTimeout(render,160);}
  async function render(){
    if(!valid()||!shown)return;const run=++revision,active=doc,documentPath=doc.path,root=getRoot();
    $('markdown-preview-title').textContent=doc.name;$('markdown-status').textContent='';
    const source=doc.model.getValue();
    if(new TextEncoder().encode(source).length>1024*1024){content.replaceChildren();$('markdown-status').textContent=tr('Preview supports up to 1 MiB. The complete file remains editable.');return;}
    const scroll=content.scrollTop;
    try{
      current=markdownFragment(source);content.replaceChildren(current.fragment);content.scrollTop=scroll;
      if(!source.trim()){const empty=document.createElement('p');empty.className='markdown-empty';empty.textContent=tr('Start writing Markdown to see the preview.');content.appendChild(empty);}
      let next=0,failed=0;
      const images=current.images.slice(0,64);
      await Promise.all(Array.from({length:Math.min(4,images.length)},async()=>{
        while(next<images.length){const {node,reference}=images[next++];if(run!==revision||doc!==active)return;
          node.addEventListener('error',()=>{if(run===revision){node.title=tr('Image could not be loaded')+': '+reference;$('markdown-status').textContent=tr('Some images could not be loaded. Check their paths and folder access.');}},{once:true});
          try{
            const location=markdownTarget(reference,documentPath,root);
            if(location?.kind==='external'&&location.url.startsWith('https:'))node.src=location.url;
            else if(/^data:image\/(?:png|jpeg|gif|webp|avif|svg\+xml|bmp|x-icon);base64,[a-z0-9+/=\s]+$/i.test(reference)&&reference.length<7*1024*1024){node.loading='eager';node.src=reference;}
            else if(location?.kind==='file'){
              let image=cache.get(reference);
              if(!image){image=await api.readMarkdownAsset({reference,documentPath,root});if(run!==revision||doc!==active)return;
                if(cacheBytes+image.bytes>20*1024*1024)throw new Error('Image preview limit reached.');cache.set(reference,image);cacheBytes+=image.bytes;}
              node.loading='eager';node.src=image.url;
            }else throw new Error('Use a local image or HTTPS image address.');
          }catch(error){failed++;node.title=tr('Image could not be loaded')+': '+reference;}
        }
      }));
      if(run===revision&&failed)$('markdown-status').textContent=tr('Some images could not be loaded. Check their paths and folder access.');
      else if(run===revision&&current.images.length>64)$('markdown-status').textContent=tr('Preview shows the first 64 images.');
    }catch(error){if(run===revision){content.replaceChildren();$('markdown-status').textContent=tr('Could not render Markdown preview.')+' '+error.message;}}
  }
  function activate(next,editor){
    if(doc!==next||target!==editor||identity!==(next?.path||'')){
      for(const subscription of subscriptions)subscription.dispose();subscriptions=[];doc=next;target=editor;identity=next?.path||'';cache=new Map();cacheBytes=0;current=null;content.replaceChildren();
      if(doc){subscriptions.push(doc.model.onDidChangeContent(schedule));subscriptions.push(doc.model.onDidChangeLanguage(()=>{visible();schedule();}));}
    }
    visible();schedule();
  }
  function togglePreview(){if(!valid()){notify(tr('Open a Markdown file to use the preview.'));return;}shown=!shown;try{storage.setItem('jotta.markdownPreview',String(shown));}catch{}visible();schedule();}
  function resize(value){ratio=Math.max(.2,Math.min(.8,value));wrap.style.setProperty('--markdown-source-width',ratio*100+'%');divider.setAttribute('aria-valuenow',String(Math.round(ratio*100)));layout();}
  divider.addEventListener('pointerdown',event=>divider.setPointerCapture(event.pointerId));
  divider.addEventListener('pointermove',event=>{if(divider.hasPointerCapture(event.pointerId)){const bounds=wrap.getBoundingClientRect();resize((event.clientX-bounds.left)/bounds.width);}});
  divider.addEventListener('pointerup',event=>{if(divider.hasPointerCapture(event.pointerId))divider.releasePointerCapture(event.pointerId);try{storage.setItem('jotta.markdownRatio',String(ratio));}catch{}});
  divider.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home'].includes(event.key)){event.preventDefault();resize(event.key==='Home' ? .5 : ratio+(event.key==='ArrowLeft'?-.05:.05));try{storage.setItem('jotta.markdownRatio',String(ratio));}catch{}}});
  function scrollTo(fragment){const heading=current?.headings.get(fragment);if(heading)heading.scrollIntoView({block:'start'});}
  async function follow(event){
    const anchor=event.target.closest('a');if(!anchor||!content.contains(anchor))return;event.preventDefault();if(event.type==='auxclick'&&event.button!==1)return;
    const reference=current?.links.get(anchor),location=markdownTarget(reference,doc?.path,getRoot());
    if(!location){notify(tr('This Markdown link is not supported.'));return;}
    if(location.kind==='anchor')scrollTo(location.fragment);
    else if(location.kind==='external')await api.openMarkdownLink(location.url);
    else {await openFile(location.path);if(location.fragment)setTimeout(()=>{if(doc?.path?.replace(/\\/g,'/')===location.path)scrollTo(location.fragment);},250);}
  }
  content.addEventListener('click',event=>follow(event).catch(error=>notify(error.message)));content.addEventListener('auxclick',event=>follow(event).catch(error=>notify(error.message)));
  $('markdown-close').onclick=()=>{shown=false;try{storage.setItem('jotta.markdownPreview','false');}catch{}visible();++revision;};
  $('markdown-refresh').onclick=()=>{cache.clear();cacheBytes=0;schedule();};$('btn-markdown-preview').onclick=togglePreview;
  document.addEventListener('jotta:locale-changed',()=>{for(const node of toolbar.querySelectorAll('[data-markdown-action]')){const action=node.dataset.markdownAction,label=tools.find(tool=>tool[0]===action)?.[1]||({'heading-menu':'Heading',format:'Format Markdown',preview:'Markdown preview'})[action]||(action.startsWith('heading-')?'Heading '+action.slice(-1):action.startsWith('export-')?'Export Markdown as '+action.slice(7).toUpperCase():'');node.title=tr(label);node.setAttribute('aria-label',tr(label));}schedule();});
  resize(ratio);visible();return {activate,export:exportDocument,toggle:togglePreview,refresh:()=>{cache.clear();cacheBytes=0;visible();schedule();}};
}
