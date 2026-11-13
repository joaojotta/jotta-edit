const slash = value => String(value || '').replace(/\\/g, '/');
const trim = value => {const path=slash(value);return path==='/'||/^[a-z]:\/$/i.test(path)?path:path.replace(/\/+$/,'')||'/';};
const within = (file, root) => file === root || file.startsWith(root.endsWith('/') ? root : root + '/');
const name = file => trim(file).split('/').pop() || '/';

export function breadcrumbSegments(file, {root = null, label = '', platform = 'desktop'} = {}) {
  if (!file) return [{label, path:null, folder:false}];
  const path = slash(file);
  if (platform === 'web' && /^\/(local-files|imports|downloads)\//.test(path)) return [{label:label || name(path),path:null,folder:false}];
  let boundary = root && within(path, trim(root)) ? trim(root) : null;
  if (!boundary && platform === 'web') boundary = /^\/workspace\/[^/]+(?=\/)/.exec(path)?.[0] || null;
  if (!boundary) {
    boundary = /^\/\/[^/]+\/[^/]+/.exec(path)?.[0] || /^[a-z]:\//i.exec(path)?.[0] || (path.startsWith('/') ? '/' : null);
  }
  if (!boundary) return [{label:label || name(path),path:null,folder:false}];
  const parts = path.slice(boundary.length).replace(/^\//,'').split('/').filter(Boolean);
  const result = [{label:boundary === '/' ? '/' : /^[a-z]:\/$/i.test(boundary) ? boundary.slice(0,-1) : name(boundary),path:boundary,folder:true}];
  let current = boundary;
  for (const [index, part] of parts.entries()) {
    current = current.replace(/\/$/,'') + '/' + part;
    result.push({label:part,path:current,folder:index < parts.length - 1});
  }
  return result;
}

export function installBreadcrumbs({host, list, open, reveal, notify = () => {}, tr = value => value, documentRef = document}) {
  const popup = documentRef.createElement('section'); popup.className='breadcrumb-popup'; popup.hidden=true;
  popup.setAttribute('role','dialog'); popup.setAttribute('aria-label',tr('Folder contents'));
  documentRef.body.append(popup);
  let generation=0, contextRoot=null, folder=null, anchor=null, lastOpen=null;
  function close(focus = false) {
    ++generation;popup.hidden=true;anchor?.setAttribute('aria-expanded','false');
    if(focus && anchor?.isConnected)anchor.focus();
    folder=null;
  }
  const button = (label, action, className = '') => {
    const item=documentRef.createElement('button');item.type='button';item.className=className;item.textContent=label;item.onclick=action;return item;
  };
  async function browse(path, trigger = anchor, boundary = contextRoot) {
    path=slash(path);boundary=slash(boundary);
    const request=++generation;folder=path;anchor=trigger;contextRoot=boundary;
    popup.hidden=false;popup.replaceChildren();anchor?.setAttribute('aria-expanded','true');
    const heading=documentRef.createElement('header');heading.className='breadcrumb-popup-heading';
    const caption=documentRef.createElement('strong');caption.textContent=name(path);caption.title=path;
    const dismiss=button('×',()=>close(true));dismiss.setAttribute('aria-label',tr('Close folder contents'));
    heading.append(caption,dismiss);popup.append(heading);
    const navigation=documentRef.createElement('div');navigation.className='breadcrumb-popup-actions';
    const parentPath=path.replace(/\/$/,'').slice(0,path.replace(/\/$/,'').lastIndexOf('/')) || '/';
    const parent=/^[a-z]:$/i.test(parentPath)?parentPath+'/':parentPath;
    const up=button(tr('Parent folder'),()=>browse(parent,anchor,boundary));
    up.disabled=trim(path)===trim(boundary)||!within(parent,trim(boundary));
    navigation.append(up,button(tr('Reveal in Explorer'),async()=>{
      try { if(await reveal(path)!==false)close(); } catch(error) { notify(error.message); }
    }));popup.append(navigation);
    const status=documentRef.createElement('p');status.className='breadcrumb-status';status.setAttribute('role','status');status.textContent=tr('Loading folder…');popup.append(status);
    const entries=documentRef.createElement('div');entries.className='breadcrumb-entries';popup.append(entries);
    const rect=trigger?.getBoundingClientRect?.();
    popup.style.left=`${Math.max(8,Math.min((globalThis.innerWidth || 1000)-Math.min(340,(globalThis.innerWidth || 1000)-16)-8,rect?.left || 8))}px`;
    const viewportHeight=globalThis.innerHeight || 700;
    // Status-bar paths open upwards, leaving the folder listing inside the viewport.
    const above=rect && rect.top > viewportHeight / 2;
    popup.style.top=above?'auto':`${Math.max(8,Math.min(viewportHeight-180,rect?.bottom || 80))}px`;
    popup.style.bottom=above?`${Math.max(8,viewportHeight-rect.top+4)}px`:'auto';
    popup.style.maxHeight=`${Math.max(80,above?rect.top-12:viewportHeight-(rect?.bottom || 80)-8)}px`;
    try {
      const result=await list(path);
      if(request!==generation)return;
      status.textContent=tr(result.truncated?'Folder listing is limited.':result.nodes.length?'':'No visible files or folders');
      for(const entry of result.nodes){
        const row=button((entry.dir?'▸ ':'')+entry.name,()=>{
          if(entry.error){notify(entry.error);return;}
          if(entry.dir){void browse(entry.path,anchor,boundary);return;}
          const now=Date.now(),keep=lastOpen?.path===entry.path&&now-lastOpen.time<450;
          lastOpen={path:entry.path,time:now};
          void open(entry.path,{preview:!keep});
        },'breadcrumb-entry');
        row.dataset.path=entry.path;row.title=entry.error||entry.path;
        if(!entry.dir)row.ondblclick=()=>{void open(entry.path,{preview:false});close();};
        entries.append(row);
      }
      (entries.querySelector('button')||dismiss).focus();
    } catch(error){if(request===generation)status.textContent=error.message;}
  }
  host.setAttribute('aria-label',tr('File path'));
  host.setAttribute('role','navigation');
  documentRef.addEventListener('jotta:locale-changed',()=>{
    close();host.setAttribute('aria-label',tr('File path'));popup.setAttribute('aria-label',tr('Folder contents'));
  });
  function render(context) {
    host.hidden=!context;
    const segments=breadcrumbSegments(context?.path,{root:context?.root,label:context?.name || tr('START'),platform:context?.platform});
    const boundary=segments.find(item=>item.folder)?.path || null;
    if(boundary!==contextRoot){close();contextRoot=boundary;}
    host.replaceChildren();
    for(const [index,item] of segments.entries()){
      if(index){const divider=documentRef.createElement('span');divider.className='breadcrumb-separator';divider.textContent='/';divider.setAttribute('aria-hidden','true');host.append(divider);}
      if(item.folder){
        const crumb=button(item.label,()=>{if(!popup.hidden&&folder===item.path)close();else void browse(item.path,crumb,boundary);},'breadcrumb-folder');
        crumb.title=item.path;crumb.setAttribute('aria-haspopup','dialog');crumb.setAttribute('aria-expanded',String(!popup.hidden&&folder===item.path));
        crumb.dataset.path=item.path;host.append(crumb);
      }else{const leaf=documentRef.createElement('span');leaf.className='breadcrumb-file';leaf.textContent=item.label;leaf.setAttribute('aria-current','page');host.append(leaf);}
    }
    if(folder && !popup.hidden){anchor=[...host.querySelectorAll('button')].find(item=>item.dataset.path===folder)||anchor;}
    host.title=context?.path || context?.name || '';
    host.lastElementChild?.scrollIntoView?.({block:'nearest',inline:'nearest'});
  }
  documentRef.addEventListener('pointerdown',event=>{if(!popup.hidden&&!popup.contains(event.target)&&!host.contains(event.target))close();});
  documentRef.addEventListener('keydown',event=>{
    if(popup.hidden)return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);return;}
    const controls=[...popup.querySelectorAll('button:not(:disabled)')];
    if(event.key==='Tab'&&controls.length){
      const index=controls.indexOf(documentRef.activeElement),next=(index+(event.shiftKey?-1:1)+controls.length)%controls.length;
      event.preventDefault();controls[next].focus();
    }else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)&&controls.length){
      event.preventDefault();const index=controls.indexOf(documentRef.activeElement);
      controls[event.key==='Home'?0:event.key==='End'?controls.length-1:(index+(event.key==='ArrowUp'?-1:1)+controls.length)%controls.length].focus();
    }
  },true);
  globalThis.addEventListener?.('resize',()=>close());
  return {render,close,browse};
}
