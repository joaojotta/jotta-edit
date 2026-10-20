import {browserGitHubWorkspace} from './github-workspace.js';
import {appendHistory, pruneHistory, historyList, moveHistory, HISTORY_LIMITS} from '../shared/local-history.mjs';
import {getMeta, putMeta, getFile, putFile, addFile, allFiles, mutateFiles, updateHistory, putWorkspaceContext} from './storage.js';
import {readZip, writeZip, safeArchivePath} from './zip.js';

const MAX_BYTES=5*1024*1024;
const IGNORE=new Set(['node_modules','.git','vendor','.cache','dist','build']);
const MAX_COUNT=8000;
const utf8=new TextEncoder();
const rootPrefix='/workspace/';
const normalize=p=>String(p||'').replace(/\\/g,'/').replace(/\/+/g,'/').replace(/\/$/,'');
const base=p=>normalize(p).split('/').pop();
const parent=p=>normalize(p).slice(0,normalize(p).lastIndexOf('/'));
const within=(root,p)=>p===root || p.startsWith(root+'/');
const cleanName=name=> {
  if(typeof name!=='string'||!name||name.trim()!==name||name==='.'||name==='..'|| /[\\/\x00-\x1f<>:"|?*]/.test(name)||/[. ]$/.test(name))
    throw new Error('Invalid file or folder name');
  return name;
};
const entryPath=(root,parts)=>[root,...parts].join('/');
function selectFiles({directory=false,multiple=false,accept=''}) {
  return new Promise(resolve=>{
    const input=document.createElement('input'); input.type='file';input.multiple=multiple;
    if(directory) input.setAttribute('webkitdirectory','');
    if(accept) input.accept=accept;
    input.style.display='none'; document.body.append(input);
    let settled=false;
    const finish=value=>{if(settled)return;settled=true;window.removeEventListener('focus',onFocus);input.remove();resolve(value);};
    const onFocus=()=>setTimeout(()=>{if(!settled && !input.files?.length) finish([]);},1200);
    window.addEventListener('focus',onFocus);
    input.addEventListener('change',()=>finish([...input.files]));input.click();
  });
}
async function inspectFile(file) {
  if(file.size>MAX_BYTES) throw new Error(`${file.name} is larger than 5 MB`);
  const data=new Uint8Array(await file.arrayBuffer());
  if (data.includes(0)) return {binary:data};
  try {return {content:new TextDecoder('utf-8',{fatal:true}).decode(data)};}
  catch {return {binary:data};}
}
async function checkText(file) {
  const item=await inspectFile(file);
  if('binary' in item) throw new Error(`Binary file cannot be opened in the code editor: ${file.name}`);
  return item.content;
}
function downloadBlob(blob,name) {
  const url=URL.createObjectURL(blob); const a=document.createElement('a');a.href=url;a.download=name;
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),120000);
}
function downloadFile(name, content) {
  name = cleanName(name);
  if (typeof content !== 'string' || utf8.encode(content).length > MAX_BYTES) throw new Error('Text exceeds 5 MB');
  downloadBlob(new Blob([content], {type:'text/plain;charset=utf-8'}), name);
}
let activeRoot=null,activeMode='virtual',nativeRoot=null;
async function context() {
  const root=await getMeta('workspace-root');
  const mode=await getMeta('workspace-mode','virtual');
  if(root!==activeRoot || mode!==activeMode || !nativeRoot) {
    activeRoot=root;activeMode=mode;
    nativeRoot=mode==='native' ? await getMeta('workspace-handle') : null;
  }
  return {root,mode,handle:nativeRoot};
}
async function registry() { const entries = await getMeta('workspace-registry', []); return Array.isArray(entries) ? entries : []; }
async function setWorkspace(root,mode,handle=null) {
  const previous = await context();
  await putWorkspaceContext({root,mode,handle:mode === 'native' ? handle : null}, previous);
  activeRoot=root;activeMode=mode;nativeRoot=handle;
}
async function contextForPath(path) {
  const current = await context();
  if (current.root && within(current.root, path)) return current;
  const entries = await registry();
  const entry = entries.filter(entry => within(entry.root, path)).sort((a,b) => b.root.length - a.root.length)[0];
  if (entry) return entry;
  if (path.startsWith('/native/')) throw new Error('Folder access expired. Use Open Folder to grant access again.');
  return current;
}
async function reopenWorkspace(root, request = true) {
  const current = await context();
  const entry = current.root === root ? current : (await registry()).find(entry => entry.root === root);
  if (!entry) throw new Error('Workspace is no longer available. Use Open Folder to open it again.');
  if (entry.mode === 'native') await access(entry.handle, true, request);
  await setWorkspace(entry.root, entry.mode, entry.handle);
  return root;
}
async function access(handle,write=false,request=false) {
  const options={mode:write?'readwrite':'read'};
  let permission=await handle.queryPermission(options);
  if(permission!=='granted' && request) permission=await handle.requestPermission(options);
  if(permission!=='granted') throw new Error('Folder access expired. Use Open Folder to grant access again.');
}
async function resolveHandle(path, kind='file', {create=false}={}) {
  const {root,mode,handle}=await contextForPath(path);
  if(mode!=='native'||!root||!handle||!within(root,path)) throw new Error('Not a native workspace path');
  await access(handle,create);
  const parts=path===root?[]:path.slice(root.length+1).split('/');
  let folder=handle;
  const count=kind==='directory'?parts.length:parts.length-1;
  for(let i=0;i<count;i++) folder=await folder.getDirectoryHandle(parts[i],{create});
  if(kind==='directory') return folder;
  return folder.getFileHandle(parts[parts.length-1],{create});
}
async function nativeExists(path) {
  const folder=await resolveHandle(parent(path),'directory');
  const name=base(path);
  try {await folder.getFileHandle(name);return true;}
  catch(error) {if(error.name!=='NotFoundError' && error.name!=='TypeMismatchError')throw error;}
  try {await folder.getDirectoryHandle(name);return true;}
  catch(error) {if(error.name!=='NotFoundError' && error.name!=='TypeMismatchError')throw error;}
  return false;
}
async function nativeTree(root,options={}) {
  const handle=await resolveHandle(root,'directory'); let count=0;
  async function walk(folder,here,depth) {
    if(depth>12||count>=MAX_COUNT)return [];
    const items=[];
    for await(const [name,h] of folder.entries()) {
      if(count>=MAX_COUNT)break;
      if(!options.showHidden && name.startsWith('.'))continue;
      if(h.kind==='directory' && IGNORE.has(name))continue;
      const path=here+'/'+name;
      if(h.kind==='directory') items.push({path,name,dir:true,children:await walk(h,path,depth+1)});
      else {count++;items.push({path,name,dir:false});}
    }
    return items.sort((a,b)=>Number(b.dir)-Number(a.dir)||a.name.localeCompare(b.name,undefined,{numeric:true}));
  }
  return {root,nodes:await walk(handle,root,0),count,truncated:count>=MAX_COUNT};
}
async function virtualTree(root,options={}) {
  const files=(await allFiles()).filter(x=>within(root,x.path));
  const map=new Map();const nodes=[];let count=0;
  function insert(parts, directory = false) {
    let list=nodes,prefix=root;
    for(let i=0;i<parts.length;i++) {
      const name=parts[i]; if(!name)continue;
      if(!options.showHidden&&name.startsWith('.'))return;
      if(i<parts.length-1 && IGNORE.has(name))return;
      prefix+='/'+name;
      let item=map.get(prefix);
      if(!item) {item={name,path:prefix,dir:i<parts.length-1 || directory,children:[]};map.set(prefix,item);list.push(item);}
      list=item.children;
    }
  }
  for(const file of files) {
    if(count>=MAX_COUNT)break;
    insert(file.path.slice(root.length+1).split('/'), file.dir === true);count++;
  }
  function order(list) { list.sort((a,b)=>Number(b.dir)-Number(a.dir)||a.name.localeCompare(b.name,undefined,{numeric:true}));for(const i of list)if(i.dir)order(i.children); else delete i.children; }
  order(nodes);
  return {root,nodes,count,truncated:count>=MAX_COUNT};
}
async function tree(root,options) {
  const ctx=await contextForPath(root);
  return ctx.mode==='native' && root===ctx.root ? nativeTree(root,options):virtualTree(root,options);
}
async function uniqueRoot(name) {
  const cleaned=cleanName(name);
  const files=await allFiles();
  const used=new Set(files.map(f=>f.path.slice(rootPrefix.length).split('/')[0]));
  for (const entry of await registry()) if (entry.root.startsWith(rootPrefix)) used.add(entry.root.slice(rootPrefix.length).split('/')[0]);
  const active=await getMeta('workspace-root');
  if(active?.startsWith(rootPrefix)) used.add(active.slice(rootPrefix.length).split('/')[0]);
  let candidate=cleaned, count=2;
  while(used.has(candidate)) candidate=`${cleaned} (${count++})`;
  return rootPrefix+candidate;
}
async function virtualImport(files,name) {
  const root=await uniqueRoot(name);
  const imported=[], skipped=[];
  for(const file of files) {
    const source=(file.webkitRelativePath||file.name).replace(/^([^/]+)\//,'');
    if(!safeArchivePath(source)||source.endsWith('/'))continue;
    try { imported.push({path:root+'/'+source,...await inspectFile(file),mtimeMs:Date.now()}); }
    catch(error) { skipped.push(file.name); console.warn('Skipped file import:',error.message); }
  }
  if(skipped.length && !window.confirm(`${skipped.length} files exceed the 5 MB browser limit. Skip them and continue?`))return null;
  if(!imported.length) throw new Error('No supported files were selected');
  await mutateFiles([],imported);await setWorkspace(root,'virtual');
  return root;
}
async function importDirectory() {
  const files=await selectFiles({directory:true,multiple:true});
  if(!files.length)return null;
  const name=files[0].webkitRelativePath?.split('/')[0]||'Imported project';
  return virtualImport(files,name);
}
async function chooseFolder() {
  if(typeof window.showDirectoryPicker==='function') {
    try {
      const handle=await window.showDirectoryPicker({mode:'readwrite'});
      await access(handle,true,true);
      let root;
      const current = await context();
      for (const entry of [current,...await registry()]) {
        if (entry.mode === 'native' && entry.handle && await handle.isSameEntry(entry.handle)) { root = entry.root; break; }
      }
      root ||= '/native/' + crypto.randomUUID() + '/' + cleanName(handle.name);
      await setWorkspace(root,'native',handle);
      return root;
    } catch(error) {
      if(error.name==='AbortError')return null;
      // Allow importing a copy if the browser cannot grant write permission.
      if(!window.confirm('Direct folder access is unavailable. Import a local copy instead?'))throw error;
    }
  }
  return importDirectory();
}
async function newWorkspace(name) {
  cleanName(name);
  const root=await uniqueRoot(name);
  await setWorkspace(root,'virtual');return root;
}
async function importZip() {
  const files=await selectFiles({accept:'.zip,application/zip'});
  if(!files.length)return null;
  const content=await readZip(files[0]);if(!content.length)throw new Error('No text/code files in archive');
  const root=await uniqueRoot(files[0].name.replace(/\.zip$/i,'').slice(0,100)||'Project');
  await mutateFiles([],content.map(file=>({path:root+'/'+file.name,...(typeof file.content==='string'?{content:file.content}:{binary:file.content}),mtimeMs:Date.now()})));
  await setWorkspace(root,'virtual');return root;
}
async function exportProject(root) {
  const ctx=await context();if(!root)throw new Error('Open a folder first');
  const listing=await tree(root,{showHidden:true});
  const paths=[];function walk(nodes){for(const n of nodes)n.dir?walk(n.children):paths.push(n.path);}walk(listing.nodes);
  const files=[],skipped=[];for(const path of paths){try{
    let content;
    if(ctx.mode==='native' && within(root,path)) {
      const file=await (await resolveHandle(path)).getFile();
      if(file.size>MAX_BYTES)throw new Error('File larger than 5 MB');
      const entry=await inspectFile(file);content=entry.binary||entry.content;
    } else {const entry=await getFile(path);if(!entry)throw new Error('File missing');content=entry.binary||entry.content;}
    files.push({name:path.slice(root.length+1),content});
  }catch(error){skipped.push(base(path));console.warn('Skipping:',path,error.message);}}
  if(skipped.length)throw new Error(`ZIP backup cancelled: could not include ${skipped.length} files (${skipped.slice(0,3).join(', ')})`);
  if(!files.length)throw new Error('No text files to export');
  downloadBlob(writeZip(files),base(root)+'.zip');
  return files.length;
}
async function retainLocalFile(handle, opened = null, openPaths = []) {
  // A file selected separately may already be open through a directory handle.
  for (const path of openPaths) {
    const ctx = await contextForPath(path);
    if (ctx.mode === 'native' && within(ctx.root, path)) {
      try { if (await handle.isSameEntry(await resolveHandle(path))) return path; } catch {}
    }
  }
  let previous;
  for (const record of await allFiles()) {
    if (record.saveMode === 'local' && record.handle) {
      try { if (await handle.isSameEntry(record.handle)) { previous = record; break; } } catch {}
    }
  }
  const path = previous?.path || '/local-files/' + crypto.randomUUID() + '/' + cleanName(handle.name);
  if (opened || !previous) await putFile({...previous, path, handle, saveMode:'local',
    ...(opened ? {content:opened.content, mtimeMs:opened.mtimeMs} : {})});
  return path;
}
async function localPermission(handle, write = false, request = false) {
  const options = {mode:write ? 'readwrite' : 'read'};
  let permission = await handle.queryPermission(options);
  if (permission !== 'granted' && request) permission = await handle.requestPermission(options);
  if (permission !== 'granted') throw new Error('File access expired. Reopen the file or use Save As.');
}
async function chooseFiles({openPaths = []} = {}) {
  if (typeof window.showOpenFilePicker === 'function') {
    let handles;
    try { handles = await window.showOpenFilePicker({multiple:true}); }
    catch (error) { if (error.name === 'AbortError') return []; throw error; }
    const paths = [];
    for (const handle of handles) {
      const file = await handle.getFile(), content = await checkText(file);
      paths.push(await retainLocalFile(handle, {content, mtimeMs:file.lastModified}, openPaths));
    }
    return paths;
  }
  const files=await selectFiles({multiple:true});const paths=[];
  for(const file of files) {
    const path='/imports/'+crypto.randomUUID()+'/'+cleanName(file.name);
    await putFile({path,content:await checkText(file),mtimeMs:file.lastModified || Date.now(),saveMode:'download'}); paths.push(path);
  }
  return paths;
}
async function prepareSave(path) {
  const record = await getFile(path);
  if (record?.saveMode === 'local') return localPermission(record.handle, true, true);
  if (path.startsWith('/local-files/')) throw new Error('File access expired. Reopen the file or use Save As.');
  const ctx = await contextForPath(path);
  if (ctx.mode === 'native' && within(ctx.root,path)) await access(ctx.handle, true, true);
}
async function saveLocation(path) {
  if (!path) return 'Choose save location';
  const record = await getFile(path);
  if (record?.saveMode === 'local' || path.startsWith('/local-files/')) return 'Local file';
  if (record?.saveMode === 'download' || path.startsWith('/imports/') || path.startsWith('/downloads/')) return 'Download copy';
  const ctx = await contextForPath(path);
  return ctx.mode === 'native' && within(ctx.root,path) ? 'Local folder' : 'Browser storage';
}
async function readFile(path) {
  const cached = await getFile(path);
  if (cached?.saveMode === 'local') {
    try {
      await localPermission(cached.handle);
      const file = await cached.handle.getFile();
      return {path,name:base(path),content:await checkText(file),mtimeMs:file.lastModified};
    } catch (error) {
      if (['NotAllowedError','SecurityError','NotFoundError'].includes(error.name) || error.message.startsWith('File access expired')) {
        if (typeof cached.content === 'string') return {path,name:base(path),content:cached.content,mtimeMs:cached.mtimeMs};
      }
      throw error;
    }
  }
  if (path.startsWith('/local-files/')) throw new Error('File access expired. Reopen the file or use Save As.');
  const ctx=await contextForPath(path);
  if(ctx.mode==='native' && within(ctx.root,path)) {
    const handle=await resolveHandle(path); const file=await handle.getFile();
    return {path,name:base(path),content:await checkText(file),mtimeMs:file.lastModified};
  }
  const value=await getFile(path);if(!value)throw new Error('File not found');
  if(value.dir)throw new Error('Cannot open a folder as a file');
  if(value.binary)throw new Error('Binary file cannot be edited as text');
  return {path,name:base(path),content:value.content,mtimeMs:value.mtimeMs||0};
}
async function saveFile(path,content,options={}) {
  if(typeof content!=='string'||utf8.encode(content).length>MAX_BYTES)throw new Error('Text exceeds 5 MB');
  const existing = await getFile(path);
  let localHandle = null;
  if (existing?.saveMode === 'local') {
    localHandle = existing.handle;
    await localPermission(localHandle, true, true);
  } else if (path.startsWith('/local-files/')) throw new Error('File access expired. Reopen the file or use Save As.');
  let historyWarning = '';
  const capture = async snapshots => {
    try { await updateHistory(records => appendHistory(records, path, snapshots)); }
    catch { historyWarning = 'Local history could not be updated.'; }
  };
  try { const previous = await readFile(path); await capture([{text:previous.content, kind:'before-save'}]); }
  catch (error) { if (error.message !== 'File not found' && error.name !== 'NotFoundError') historyWarning = 'Local history could not be updated.'; }
  const ctx=await contextForPath(path);
  if(localHandle || ctx.mode==='native' && within(ctx.root,path) && path!==ctx.root) {
    const handle = localHandle || await resolveHandle(path,'file',{create:true});
    if (typeof options.expectedText === 'string') {
      const disk = await handle.getFile();
      if (await checkText(disk) !== options.expectedText) throw new Error('File changed on disk. Close and reopen it, or use Save As to preserve both versions.');
    }
    const writable=await handle.createWritable();
    try { await writable.write(content); await writable.close(); }
    catch (error) { try { await writable.abort?.(); } catch {} throw error; }
    let notice = localHandle ? 'Saved to local file.' : 'Saved to local folder.';
    if (localHandle) {
      try { await putFile({...existing, content, mtimeMs:Date.now()}); }
      catch { notice = 'Saved to local file. Browser recovery copy could not be updated.'; }
    }
    await capture([{text:content, kind:'save'}]);
    if(utf8.encode(content).length>HISTORY_LIMITS.fileBytes)historyWarning='File saved. Local history supports files up to 1 MB.';
    return {path,mtimeMs:Date.now(),historyWarning,notice};
  }
  const download = existing?.saveMode === 'download' || path.startsWith('/imports/') || path.startsWith('/downloads/');
  await putFile({path,content,mtimeMs:Date.now(),...(download ? {saveMode:'download'} : {})});
  if (download) downloadFile(base(path), content);
  await capture([{text:content, kind:'save'}]);
  if(utf8.encode(content).length>HISTORY_LIMITS.fileBytes)historyWarning='File saved. Local history supports files up to 1 MB.';
  return {path,mtimeMs:Date.now(),historyWarning,notice:download ? 'Download started; a browser recovery copy was saved.' : 'Saved in browser storage.'};
}
async function saveAsDialog(suggestion, {openPaths = []} = {}) {
  const name = base(suggestion || 'untitled.txt');
  if (typeof window.showSaveFilePicker === 'function') {
    let handle;
    try { handle = await window.showSaveFilePicker({suggestedName:name}); }
    catch (error) { if (error.name === 'AbortError') return null; throw error; }
    return retainLocalFile(handle, null, openPaths);
  }
  const typed=window.prompt('Save as filename (a copy will be downloaded):',name);
  if (typed === null) return null;
  return '/downloads/' + crypto.randomUUID() + '/' + cleanName(typed);
}
async function projectMutation(type,root,source,dest) {
  const ctx=await context();
  if(!root||root!==ctx.root||!within(root,source)||source===root)throw new Error('Entry is outside the current project');
  if(type==='rename')dest=parent(source)+'/'+cleanName(dest);
  if(type==='move') {
    if(!within(root,dest)||dest===source||dest.startsWith(source+'/'))throw new Error('Invalid destination');
    dest=dest+'/'+base(source);
  }
  if(type!=='delete') {
    if(dest===source)return {oldPath:source,path:source};
    if(!within(root,dest)||dest.startsWith(source+'/'))throw new Error('Cannot move a folder into itself');
  }
  if(ctx.mode==='native') {
    const nodes=await nativeTree(root,{showHidden:true});let entries=[],allEntries=[];
    function walk(items){for(const item of items){allEntries.push(item);if(item.path===source||within(source,item.path))entries.push(item);if(item.dir)walk(item.children);}}walk(nodes.nodes);
    if(!entries.length)throw new Error('Entry not found');
    if(type!=='delete') {
      if(allEntries.some(e=>e.path===dest) || await nativeExists(dest))throw new Error('Destination already exists');
      await access(ctx.handle,true);
      const destinationDir=await resolveHandle(parent(dest),'directory');
      const first=entries.find(e=>e.path===source);
      // Browser API has no atomic rename: refuse folder moves to avoid partial copying.
      if(first.dir)throw new Error('Native browser folder rename/move is not atomic. Export and re-import the folder instead.');
      const sourceFile=await (await resolveHandle(source)).getFile();
      const newHandle=await destinationDir.getFileHandle(base(dest),{create:true});
      const stream=await newHandle.createWritable();await stream.write(sourceFile);await stream.close();
      const oldDir=await resolveHandle(parent(source),'directory');
      try{await oldDir.removeEntry(base(source));}catch(error){await destinationDir.removeEntry(base(dest));throw error;}
    } else {
      const directory=await resolveHandle(parent(source),'directory');
      await access(ctx.handle,true);await directory.removeEntry(base(source),{recursive:true});
    }
  } else {
    const all=await allFiles();const affected=all.filter(e=>within(source,e.path));
    if(!affected.length)throw new Error('Entry not found');
    if(type!=='delete') {
      if(all.some(e=>within(dest,e.path)))throw new Error('Destination already exists');
      await mutateFiles(affected.map(e=>e.path),affected.map(e=>({...e,path:dest+e.path.slice(source.length)})));
    } else await mutateFiles(affected.map(e=>e.path),[]);
  }
  let historyWarning = '';
  if (type !== 'delete') {
    try { await updateHistory(records => pruneHistory(moveHistory(records, source, dest))); }
    catch { historyWarning = 'Local history could not be updated.'; }
  }
  return type==='delete'?{path:source}:{oldPath:source,path:dest,historyWarning};
}
async function createEntry(root, folder, name, kind) {
  const ctx = await context();
  if (!root || root !== ctx.root || !within(root, folder)) throw new Error('Destination is outside the current project');
  if (!['file', 'folder'].includes(kind)) throw new Error('Invalid entry type');
  name = cleanName(name);
  const target = folder + '/' + name;
  if (ctx.mode === 'native') {
    await access(ctx.handle, true);
    const directory = await resolveHandle(folder, 'directory');
    if (await nativeExists(target)) throw new Error('Destination already exists');
    if (kind === 'folder') await directory.getDirectoryHandle(name, {create:true});
    else await directory.getFileHandle(name, {create:true});
  } else {
    const all = await allFiles();
    if (folder !== root && !all.some(entry => entry.path === folder ? entry.dir : within(folder, entry.path))) throw new Error('Destination must be a folder');
    if (all.some(entry => within(target, entry.path))) throw new Error('Destination already exists');
    await addFile({path:target, ...(kind === 'folder' ? {dir:true} : {content:''}), mtimeMs:Date.now()});
  }
  return {path:target, name, dir:kind === 'folder'};
}
async function renameEntry(root,source,name){return projectMutation('rename',root,source,name);}
async function moveEntry(root,source,folder){return projectMutation('move',root,source,folder);}
async function deleteEntry(root, source) {
  const ctx = await context();
  if (!root || root !== ctx.root || !within(root, source) || source === root) throw new Error('Entry is outside the current project');
  const trash = root + '/.jotta-trash';
  if (within(trash, source)) throw new Error('Restore items from .jotta-trash before moving them to Trash again');
  const id = Date.now().toString(36) + '-' + globalThis.crypto.randomUUID();
  const destination = trash + '/' + id + '/entry/' + base(source);
  if (ctx.mode === 'native') {
    await access(ctx.handle, true);
    const directory = await resolveHandle(parent(source), 'directory');
    let original;
    try { original = await directory.getDirectoryHandle(base(source)); }
    catch (error) { if (error.name !== 'TypeMismatchError' && error.name !== 'NotFoundError') throw error; original = await directory.getFileHandle(base(source)); }
    const trashDir = await ctx.handle.getDirectoryHandle('.jotta-trash', {create:true});
    const itemDir = await trashDir.getDirectoryHandle(id, {create:true});
    async function copy(handle, target, name) {
      if (handle.kind === 'directory') {
        const folder = await target.getDirectoryHandle(name, {create:true});
        for await (const [childName, child] of handle.entries()) await copy(child, folder, childName);
      } else {
        const file = await handle.getFile();
        const created = await target.getFileHandle(name, {create:true});
        const writable = await created.createWritable();
        try { await writable.write(file); await writable.close(); }
        catch (error) { await writable.abort().catch(() => {}); throw error; }
      }
    }
    // Browser folder APIs cannot access the operating-system Trash. Preserve
    // a complete project-local copy before removing the original entry.
    const payload = await itemDir.getDirectoryHandle('entry', {create:true});
    await copy(original, payload, base(source));
    const metadata = await itemDir.getFileHandle('restore.json', {create:true});
    const writer = await metadata.createWritable();
    await writer.write(JSON.stringify({originalPath:source, deletedAt:Date.now()})); await writer.close();
    await directory.removeEntry(base(source), {recursive:true});
  } else {
    const entries = (await allFiles()).filter(entry => within(source, entry.path));
    if (!entries.length) throw new Error('Entry not found');
    await mutateFiles(entries.map(entry => entry.path), [
      ...entries.map(entry => ({...entry, path:destination + entry.path.slice(source.length)})),
      {path:parent(parent(destination)) + '/restore.json', content:JSON.stringify({originalPath:source, deletedAt:Date.now()}), mtimeMs:Date.now()}
    ]);
  }
  return {path:source, trashPath:destination};
}
async function projectSearch(root,query) {
  if(!root||!query||query.length<2)return [];
  const listing=await tree(root,{}),matches=[];
  async function walk(nodes) {for(const item of nodes){if(matches.length>=100)break;if(item.dir)await walk(item.children);else{
    try{const {content}=await readFile(item.path);const lines=content.split(/\r?\n/);
      for(let i=0;i<lines.length&&matches.length<100;i++)if(lines[i].toLowerCase().includes(query.toLowerCase()))matches.push({path:item.path,line:i+1,preview:lines[i].trim().slice(0,200)});
    }catch{} }
  }}await walk(listing.nodes);return matches;
}
async function completePath({file,root,typed}) {
  if(!root||typeof typed!=='string'||typed.includes('\\')||/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(typed))return [];
  let dir=typed.slice(0,typed.lastIndexOf('/')+1);
  const origin=typed.startsWith('/')?root:(file?parent(file):root);
  if(dir.startsWith('/'))dir=dir.slice(1);
  const segments=normalize(origin+'/'+dir).split('/').filter(Boolean),path=[];
  for(const seg of segments){if(seg==='..')path.pop();else if(seg!=='.')path.push(seg);}
  const folder='/'+path.join('/');if(!within(root,folder))return [];
  try{const listing=await tree(root,{});const children=findNodeChildren(listing.nodes,folder,root);
    return children.map(n=>({name:n.name,dir:n.dir})).slice(0,100);}catch{return [];}
}
function findNodeChildren(nodes,folder,root){if(folder===root)return nodes;for(const n of nodes){if(n.path===folder&&n.dir)return n.children||[];if(n.dir){const found=findNodeChildren(n.children||[],folder,root);if(found.length)return found;}}return [];}

const githubWorkspace=browserGitHubWorkspace(context);
export const browserApi={
  githubTokenHelp:()=>window.open('https://github.com/settings/personal-access-tokens/new','_blank','noopener,noreferrer'),
  githubState:root=>githubWorkspace.get(root), githubSetState:(root,state)=>githubWorkspace.set(root,state),
  githubSnapshot:(root,tracked)=>githubWorkspace.snapshot(root,tracked),
  githubApply:(root,changes,expected,tracked)=>githubWorkspace.apply(root,changes,expected,tracked),
  githubChooseWorkspace:name=>newWorkspace(name),
  platform:'web', prepareSave, saveLocation, reopenWorkspace, downloadFile, chooseFolder, newWorkspace, importDirectory, importZip, exportProject,
  listHistory:async path=>historyList(pruneHistory(await getMeta('local-history',[])),path),
  getHistory:async(path,id)=>{const record=pruneHistory(await getMeta('local-history',[])).find(r=>r.path===path&&r.id===id);if(!record)throw new Error('This history version is no longer available.');return record;},
  captureHistory:(path,text)=>updateHistory(records=>appendHistory(records,path,[{text,kind:'restore-backup'}])),
  scanFolder:tree, chooseFiles, readFile, saveFile, saveAsDialog,
  createEntry,renameEntry,moveEntry,deleteEntry,searchProject:projectSearch,completePath,
  getSession:()=>getMeta('session',{}),setSession:session=>putMeta('session',session),
  getWindowPrefs:async()=>({nativeFrame:true}),setWindowPrefs:async()=>({nativeFrame:true}),
  restartConfirmed:async()=>window.location.reload(),
  listFonts:async()=>['Rubik','Arial','Verdana','Georgia','Monospace','Courier New','Consolas','Menlo','Monaco'],
  systemLocale:async()=>navigator.language||'en',menuLocale:async()=>{},
  popupMenu:async()=>{},complete:async()=>[],
  windowAction:async()=>{},closeConfirmed:()=>{},onBeforeClose:()=>()=>{},
  onMenuCommand:()=>()=>{},onOpenFile:()=>()=>{},rendererReady:()=>window.dispatchEvent(new Event('jotta:web-ready'))
};
