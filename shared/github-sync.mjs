export const SYNC_LIMITS = Object.freeze({files:2000, fileBytes:5*1024*1024, totalBytes:40*1024*1024});
export function safeRepoPath(path) {
  if (typeof path !== 'string' || !path || path.length > 4096 || /[\\\x00-\x1f<>:"|?*]/.test(path)) throw new Error('Unsupported repository path.');
  const parts = path.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part) || /^\.git$/i.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error('Unsupported repository path.');
  return path;
}
export function encodeBytes(bytes) {
  let binary = '';
  for (let i=0;i<bytes.length;i+=32768) binary += String.fromCharCode(...bytes.subarray(i,i+32768));
  return btoa(binary);
}
export function decodeBytes(value) {
  const binary = atob(value.replace(/\s/g,''));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}
export function textOf(file) {
  if (!file) return '';
  const bytes = decodeBytes(file.data);
  if (bytes.includes(0)) return null;
  try { return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes); } catch { return null; }
}
export async function blobSha(data) {
  const bytes = typeof data === 'string' ? decodeBytes(data) : data;
  const header = new TextEncoder().encode(`blob ${bytes.length}\0`), input = new Uint8Array(header.length+bytes.length);
  input.set(header); input.set(bytes,header.length);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-1',input))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
export function sameFile(a,b) { return (!a && !b) || Boolean(a && b && a.sha === b.sha && a.mode === b.mode); }
export function mergePlan(base, local, remote) {
  const b=new Map(base.map(file=>[file.path,file])), l=new Map(local.map(file=>[file.path,file])), r=new Map(remote.map(file=>[file.path,file]));
  return [...new Set([...b.keys(),...l.keys(),...r.keys()])].sort().flatMap(path=>{
    const before=b.get(path), ours=l.get(path), theirs=r.get(path);
    if (sameFile(ours,theirs)) return [];
    const localChanged=!sameFile(before,ours), remoteChanged=!sameFile(before,theirs);
    if (!localChanged && !remoteChanged) return [];
    return [{path, base:before || null, local:ours || null, remote:theirs || null,
      type:localChanged && remoteChanged ? 'conflict' : localChanged ? 'outgoing' : 'incoming'}];
  });
}
export function resolvePlan(plan, resolutions={}, selected=[]) {
  const chosen=new Set(selected), incoming=[], outgoing=[];
  for (const item of plan) {
    let type=item.type;
    if (type==='conflict') {
      if (!['local','remote'].includes(resolutions[item.path])) throw new Error('Resolve every conflict before syncing.');
      type=resolutions[item.path]==='local' ? 'outgoing' : 'incoming';
    }
    if (type==='incoming') incoming.push(item);
    else if (chosen.has(item.path)) outgoing.push(item);
  }
  return {incoming,outgoing};
}
export function assertSyncLimits(path,size,total,count) {
  const mib=bytes=>(bytes/1024/1024).toFixed(2);
  if(size>SYNC_LIMITS.fileBytes)throw new Error(`Cannot sync "${path}": file is ${mib(size)} MiB; the per-file limit is 5 MiB.`);
  if(count>SYNC_LIMITS.files)throw new Error(`Cannot sync "${path}": workspace contains more than 2,000 files (${count} scanned).`);
  if(total>SYNC_LIMITS.totalBytes)throw new Error(`Cannot sync "${path}": workspace exceeds 40 MiB (${mib(total)} MiB scanned).`);
}
export function validateEntries(entries, {data=false}={}) {
  if (!Array.isArray(entries)) throw new Error('Invalid sync file list.');
  if(entries.length>SYNC_LIMITS.files)assertSyncLimits(entries[SYNC_LIMITS.files]?.path,0,0,entries.length);
  const seen=new Set(); let total=0;
  for (const entry of entries) {
    safeRepoPath(entry.path);
    if (seen.has(entry.path.normalize('NFC').toLowerCase())) throw new Error('Case-colliding repository paths are not supported.');
    seen.add(entry.path.normalize('NFC').toLowerCase());
    if (!['100644','100755'].includes(entry.mode)) throw new Error('Symlinks and submodules are not supported by this checkout.');
    if (data) {
      if (typeof entry.data!=='string') throw new Error('Missing file content.');
      const size=decodeBytes(entry.data).length; total+=size;
      assertSyncLimits(entry.path,size,total,seen.size);
    }
  }
}
export function validLink(value) {
  if (!value || !/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(value.repo || '') || ['.','..'].includes(value.repo?.split('/')[1]) || !value.branch || /[\x00-\x20~^:?*\[\\]|\.\.|@\{/.test(value.branch) || value.branch.length>200) throw new Error('Choose a valid repository and branch.');
  return {repo:value.repo,branch:value.branch};
}
export class GitHubClient {
  constructor({fetch:fetcher=globalThis.fetch}={}) { this.fetch=fetcher.bind(globalThis); this.token=''; this.controllers=new Set(); }
  disconnect() { this.token=''; for(const controller of this.controllers)controller.abort(); this.controllers.clear(); }
  async connect(token) {
    this.disconnect();
    if (typeof token!=='string' || !token.trim() || /\s/.test(token.trim())) throw new Error('Enter a GitHub access token.');
    this.token=token.trim();
    try { return await this.request('/user'); } catch(error) {this.disconnect();throw error;}
  }
  async request(path, method='GET', body) {
    if (!this.token) throw new Error('Connect to GitHub first.');
    if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Invalid GitHub endpoint.');
    const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),30000); this.controllers.add(controller);
    try {
      const response=await this.fetch('https://api.github.com'+path,{method, redirect:'error',signal:controller.signal,
        headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+this.token,'X-GitHub-Api-Version':'2026-03-10',...(body?{'Content-Type':'application/json'}:{})},
        ...(body?{body:JSON.stringify(body)}:{})});
      if (!response.ok) {
        const messages={401:'GitHub rejected this token. Reconnect with a valid token.',403:'GitHub denied access or the rate limit was reached. Check repository permissions.',404:'Repository or branch not found, or this token cannot access it.',409:'Repository is empty or changed. Initialize it with a README, then refresh.',422:'GitHub rejected the update. Refresh changes; the branch may have moved or be protected.'};
        throw new Error(messages[response.status] || `GitHub request failed (${response.status}).`);
      }
      if (response.status===204) return null;
      return await response.json();
    } finally {clearTimeout(timer);this.controllers.delete(controller);}
  }
  async paged(path) {
    const all=[];
    for(let page=1;page<=3;page++) { const result=await this.request(`${path}${path.includes('?')?'&':'?'}per_page=100&page=${page}`);all.push(...result);if(result.length<100)break; }
    return all;
  }
  repositories() {return this.paged('/user/repos?sort=updated');}
  async branches(repo) { validLink({repo,branch:'main'});const metadata=await this.request('/repos/'+repo);return {defaultBranch:metadata.default_branch,branches:await this.paged('/repos/'+repo+'/branches')}; }
  async snapshot(link) {
    const {repo,branch}=validLink(link), ref=await this.request(`/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
    const head=ref.object.sha, commit=await this.request(`/repos/${repo}/git/commits/${head}`);
    const tree=await this.request(`/repos/${repo}/git/trees/${commit.tree.sha}?recursive=1`);
    if (tree.truncated) throw new Error('GitHub returned an incomplete tree. This repository is too large to sync.');
    const entries=tree.tree.filter(item=>item.type!=='tree').map(item=>({path:item.path,sha:item.sha,mode:item.mode,size:item.size}));
    validateEntries(entries);
    let total=0;
    for(const file of entries){total+=file.size||0;assertSyncLimits(file.path,file.size||0,total,entries.length);}
    return {head,tree:commit.tree.sha,entries};
  }
  async blob(repo,file) {
    const blob=await this.request(`/repos/${repo}/git/blobs/${file.sha}`);
    if (blob.size>SYNC_LIMITS.fileBytes || (blob.content || '').length>SYNC_LIMITS.fileBytes*1.5+10000) throw new Error('GitHub file exceeds the 5 MB sync limit.');
    if (blob.encoding!=='base64') throw new Error('Unsupported GitHub file encoding.');
    const entry={...file,data:blob.content.replace(/\s/g,'')}; validateEntries([entry],{data:true});
    if (await blobSha(entry.data)!==file.sha) throw new Error('GitHub file integrity check failed.');
    return entry;
  }
  async publish(link, snapshot, files, message) {
    validLink(link);validateEntries(files.filter(file=>file.data!==null),{data:true});
    if (!message?.trim() || message.length>1000) throw new Error('Enter a commit message (up to 1,000 characters).');
    const current=await this.request(`/repos/${link.repo}/git/ref/heads/${encodeURIComponent(link.branch)}`);
    if(current.object.sha!==snapshot.head) throw new Error('The remote branch changed. Refresh before syncing.');
    const tree=[];
    for(const file of files) {
      safeRepoPath(file.path);
      if(file.data===null){tree.push({path:file.path,mode:file.mode || '100644',type:'blob',sha:null});continue;}
      const blob=await this.request(`/repos/${link.repo}/git/blobs`,'POST',{content:file.data,encoding:'base64'});
      tree.push({path:file.path,mode:file.mode,type:'blob',sha:blob.sha});
    }
    const createdTree=await this.request(`/repos/${link.repo}/git/trees`,'POST',{base_tree:snapshot.tree,tree});
    const commit=await this.request(`/repos/${link.repo}/git/commits`,'POST',{message:message.trim(),tree:createdTree.sha,parents:[snapshot.head]});
    await this.request(`/repos/${link.repo}/git/refs/heads/${encodeURIComponent(link.branch)}`,'PATCH',{sha:commit.sha,force:false});
    const entries=new Map(snapshot.entries.map(file=>[file.path,file]));
    for(const file of files) {if(file.data===null)entries.delete(file.path);else entries.set(file.path,{path:file.path,mode:file.mode,sha:await blobSha(file.data)});}
    return {head:commit.sha,tree:createdTree.sha,entries:[...entries.values()]};
  }
}
