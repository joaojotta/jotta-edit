// One policy for desktop and browser storage. Limits apply across all projects.
export const HISTORY_LIMITS = Object.freeze({perFile:30, entries:300, fileBytes:1024*1024, totalBytes:20*1024*1024, days:30});
const bytes = text => new TextEncoder().encode(text).length;
export function pruneHistory(records, now = Date.now(), limits = HISTORY_LIMITS) {
  const counts = new Map(); let total = 0;
  const kept = [];
  for (const record of [...records].reverse()) {
    if (!record || typeof record.id !== 'string' || typeof record.path !== 'string' || typeof record.text !== 'string' || !Number.isFinite(record.time)) continue;
    if (record.time < now - limits.days * 86400000) continue;
    const size = bytes(record.text);
    const count = counts.get(record.path) || 0;
    if (size > limits.fileBytes || total + size > limits.totalBytes || count >= limits.perFile || kept.length >= limits.entries) continue;
    total += size; counts.set(record.path, count + 1); kept.push(record);
  }
  return kept.reverse();
}
export function appendHistory(records, path, snapshots, now = Date.now(), makeId = () => crypto.randomUUID(), limits = HISTORY_LIMITS) {
  const next = pruneHistory(records, now, limits);
  for (const snapshot of snapshots) {
    if (typeof snapshot.text !== 'string' || bytes(snapshot.text) > limits.fileBytes) continue;
    const previous = next.findLast(record => record.path === path);
    if (previous?.text === snapshot.text) continue;
    next.push({id:makeId(), path, text:snapshot.text, time:now, kind:snapshot.kind || 'save'});
  }
  return pruneHistory(next, now, limits);
}
export function historyList(records, path) {
  return records.filter(record => record.path === path).reverse().map(({text, ...metadata}) => ({...metadata, bytes:bytes(text)}));
}

export function moveHistory(records, source, destination) {
  return records.map(record => record.path === source || record.path.startsWith(source + '/')
    ? {...record, path:destination + record.path.slice(source.length)} : record);
}
