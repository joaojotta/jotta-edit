/** IndexedDB-backed browser workspace. No network or Electron dependency. */
const DB_NAME = 'jotta-edit-web-v1';
const DB_VERSION = 1;
let connection;
function requestDone(request) {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
export function database() {
  return connection ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', {keyPath:'path'});
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Workspace database is blocked by another tab.'));
  });
}
async function tx(storeName, mode, operation) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let result;
    try { result = operation(store); } catch (error) { transaction.abort(); reject(error); return; }
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('Workspace transaction aborted'));
  });
}
export async function getMeta(key, fallback = null) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction('meta','readonly').objectStore('meta').get(key);
    request.onsuccess = () => resolve(request.result === undefined ? fallback : request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function putMeta(key, value) { await tx('meta','readwrite', store => store.put(value,key)); }
export async function getFile(path) {
  const db = await database();
  return requestDone(db.transaction('files','readonly').objectStore('files').get(path));
}
export async function putFile(record) { await tx('files','readwrite', store => store.put(record)); }
export async function allFiles() {
  const db = await database();
  return requestDone(db.transaction('files','readonly').objectStore('files').getAll());
}
/** Atomic virtual rename/move/delete, including all files nested inside a folder. */
export async function mutateFiles(removals, additions) {
  await tx('files','readwrite', store => {
    for (const path of removals) store.delete(path);
    for (const record of additions) store.put(record);
  });
}
export async function clearRoot(root) {
  const items = await allFiles();
  await mutateFiles(items.filter(x => x.path === root || x.path.startsWith(root+'/')).map(x => x.path), []);
}

/** Create exclusively so concurrent tabs cannot overwrite a saved entry. */
export async function addFile(record) { await tx('files','readwrite', store => store.add(record)); }

/** Serialize history changes with IndexedDB, including across browser tabs. */
export async function updateHistory(operation) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('meta', 'readwrite');
    const store = transaction.objectStore('meta');
    const request = store.get('local-history');
    request.onsuccess = () => {
      try { store.put(operation(request.result || []), 'local-history'); }
      catch (error) { transaction.abort(); reject(error); }
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('History transaction aborted'));
  });
}

/** Commit the selected workspace and retained directory handles together. */
export async function putWorkspaceContext(workspace, previous) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('meta', 'readwrite'), store = transaction.objectStore('meta');
    const request = store.get('workspace-registry');
    request.onsuccess = () => {
      try {
        const entries = Array.isArray(request.result) ? request.result : [];
        for (const entry of [previous, workspace].filter(entry => entry?.root)) {
          const index = entries.findIndex(item => item.root === entry.root);
          if (index !== -1) entries[index] = entry;
          else { if (entries.length >= 100) throw new Error('Workspace storage limit reached.'); entries.push(entry); }
        }
        store.put(entries, 'workspace-registry'); store.put(workspace.root, 'workspace-root');
        store.put(workspace.mode, 'workspace-mode'); store.put(workspace.handle || null, 'workspace-handle');
      } catch (error) { transaction.abort(); reject(error); }
    };
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('Workspace switch aborted'));
  });
}

/** Compare and apply a reviewed GitHub batch in a single cross-tab transaction. */
export async function atomicGithubFiles(plan) {
  const {decodeBytes,textOf} = await import('../shared/github-sync.mjs');
  const db=await database();
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction('files','readwrite'),store=transaction.objectStore('files'),request=store.getAll();
    request.onsuccess=()=>{
      try{
        for(const change of plan(request.result)){
          if(change.data===null)store.delete(change.path);
          else{
            const text=textOf(change);
            store.put({path:change.path,mode:change.mode,mtimeMs:Date.now(),...(text===null?{binary:decodeBytes(change.data)}:{content:text})});
          }
        }
      }catch(error){transaction.abort();reject(error);}
    };
    transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);
    transaction.onabort=()=>reject(transaction.error||new Error('Sync transaction aborted'));
  });
}
