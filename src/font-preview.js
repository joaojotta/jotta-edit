const DEFAULT_TEXT='The quick brown fox jumps over the lazy dog.\nÀÁÂÃÄÅ Ç ÈÉÊË ÌÍÎÏ Ñ ÒÓÔÕÖ ÙÚÛÜ — Olá, mundo!';
const boundedSize=value=>Math.max(10,Math.min(160,Number.isFinite(Number(value))?Math.round(Number(value)):48));
export function installFontPreview({host,tr=s=>s,activate=()=>{},documentRef=document,FontFaceClass=globalThis.FontFace}) {
  const make=(tag,cls,parent=host)=>{const node=documentRef.createElement(tag);node.className=cls;parent.appendChild(node);return node;};
  host.classList.add('font-preview');host.hidden=true;
  const toolbar=make('div','font-preview-toolbar');
  const name=make('strong','font-preview-name',toolbar);
  const sizeLabel=make('label','font-preview-size',toolbar);sizeLabel.textContent=tr('Preview size');
  const size=make('input','',sizeLabel);size.type='number';size.min='10';size.max='160';size.step='1';
  size.setAttribute('aria-label',tr('Preview size'));
  const reset=make('button','',toolbar);reset.type='button';reset.textContent=tr('Reset preview');
  const status=make('p','font-preview-status');status.setAttribute('role','status');
  const content=make('div','font-preview-content');
  const label=make('label','font-preview-label',content);label.textContent=tr('Sample text');
  const sample=make('textarea','font-preview-sample',label);sample.rows=3;sample.maxLength=4000;sample.spellcheck=false;
  sample.setAttribute('aria-label',tr('Sample text'));
  const glyphs=make('div','font-preview-glyphs',content);
  glyphs.textContent='ABCDEFGHIJKLMNOPQRSTUVWXYZ\nabcdefghijklmnopqrstuvwxyz\n0123456789 !? @#$%& () [] {} +−×÷ = :;.,';
  let doc=null,source=null,face=null,generation=0;
  function release() {
    ++generation;
    if (face) documentRef.fonts.delete(face);
    face=null;source=null;
    sample.style.fontFamily='';glyphs.style.fontFamily='';
  }
  function settings() {return doc.fontPreview ||= {text:DEFAULT_TEXT,size:48};}
  function draw() {
    if (!doc) return;
    size.value=String(settings().size);
    sample.style.fontSize=settings().size+'px';glyphs.style.fontSize=settings().size+'px';
  }
  function resize(value) {if (!doc) return;settings().size=boundedSize(value);draw();}
  function zoom(delta) {if (doc) resize(settings().size+delta*2);}
  size.addEventListener('input',()=>resize(size.value));
  sample.addEventListener('input',()=>{if(doc)settings().text=sample.value;});
  reset.onclick=()=>{if(!doc)return;doc.fontPreview={text:DEFAULT_TEXT,size:48};sample.value=DEFAULT_TEXT;draw();};
  host.addEventListener('pointerdown',activate);host.addEventListener('focusin',activate);
  content.addEventListener('wheel',event=>{
    if (!(event.ctrlKey||event.metaKey)||!event.deltaY) return;
    event.preventDefault();event.stopPropagation();zoom(event.deltaY<0?1:-1);
  },{passive:false});
  return {
    show(next) {
      const different=doc!==next;
      doc=next?.font?next:null;host.hidden=!doc;
      if (!doc) {if(source)release();return false;}
      if (different) sample.value=settings().text;
      name.textContent=doc.name;name.title=doc.name;draw();
      if (source===doc.font.url) return true;
      release();source=doc.font.url;const request=generation;
      status.textContent=tr('Loading font…');content.hidden=true;
      try {
        const family='JottaPreview'+crypto.randomUUID().replaceAll('-','');
        const loading=new FontFaceClass(family,`url("${source}")`);
        loading.load().then(loaded=>{
          if(request!==generation||!doc)return;
          face=loaded;documentRef.fonts.add(face);
          sample.style.fontFamily=`"${family}", sans-serif`;glyphs.style.fontFamily=`"${family}", sans-serif`;
          status.textContent=doc.font.type+' · '+Math.ceil(doc.font.bytes/1024)+' KB';content.hidden=false;
        }).catch(()=>{if(request===generation)status.textContent=tr('Cannot preview this font. The file may be damaged or unsupported.');});
      } catch {status.textContent=tr('Cannot preview this font. The file may be damaged or unsupported.');}
      return true;
    },
    focus(){(content.hidden?size:sample).focus();},zoom,reset(){resize(48);},
    get visible(){return Boolean(doc);},dispose(){release();doc=null;}
  };
}
