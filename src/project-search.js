// Literal project search and replacement plans. Offsets always refer to source text.
export const SEARCH_LIMITS = {files:8000, fileBytes:1024 * 1024, totalBytes:20 * 1024 * 1024, matchesPerFile:5000};
const binaryExtension = /\.(?:png|jpe?g|gif|webp|avif|ico|pdf|zip|gz|bz2|xz|7z|rar|woff2?|ttf|otf|eot|mp[34]|wav|ogg|flac|mov|webm|wasm|sqlite|db|exe|dll|so|class)$/i;
const normalized = path => String(path).replace(/\\/g, '/').replace(/\/+$/, '');
export function projectPathContains(root, file) {
  const parent = normalized(root), child = normalized(file);
  return Boolean(parent) && child.startsWith(parent + '/') && !child.slice(parent.length + 1).split('/').some(part => part === '..');
}
export function findProjectMatches(text, query, {matchCase = false, wholeWord = false} = {}, max = SEARCH_LIMITS.matchesPerFile + 1) {
  if (!query) return [];
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = wholeWord ? `(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])` : escaped;
  const expression = new RegExp(pattern, matchCase ? 'gu' : 'giu');
  const matches = [];
  let line = 1, lineStart = 0, cursor = 0;
  for (const match of text.matchAll(expression)) {
    for (; cursor < match.index; cursor++) if (text[cursor] === '\n') { line++; lineStart = cursor + 1; }
    matches.push({start:match.index, end:match.index + match[0].length, line, column:match.index - lineStart + 1});
    if (matches.length >= max) break;
  }
  return matches;
}
export function replaceProjectMatches(text, matches, replacement) {
  const parts = []; let cursor = 0;
  for (const match of matches) { parts.push(text.slice(cursor, match.start), replacement); cursor = match.end; }
  parts.push(text.slice(cursor));
  return parts.join('');
}
export function replacementPlans(results, selected, replacement) {
  const encoder = new TextEncoder();
  return results.filter(file => selected.has(file.path)).map(file => {
    const length = file.text.length + file.matches.reduce((total, match) => total + replacement.length - (match.end - match.start), 0);
    if (length > 5 * 1024 * 1024) throw new Error('Replacement exceeds the 5 MB file limit.');
    const after = replaceProjectMatches(file.text, file.matches, replacement);
    if (encoder.encode(after).length > 5 * 1024 * 1024) throw new Error('Replacement exceeds the 5 MB file limit.');
    return {path:file.path, before:file.text, after};
  }).filter(file => file.before !== file.after);
}

export async function searchProjectFiles({root, paths, buffers = new Map(), readFile, query, options = {}, cancelled = () => false}) {
  const results = []; const encoder = new TextEncoder();
  let bytes = 0, skipped = 0, limited = false, count = 0;
  const files = [...new Set(paths.filter(file => projectPathContains(root, file)))];
  for (const path of files) {
    if (cancelled()) return null;
    if (count++ >= SEARCH_LIMITS.files) { limited = true; break; }
    if (binaryExtension.test(path)) continue;
    let text;
    try { text = buffers.has(path) ? buffers.get(path) : (await readFile(path)).content; }
    catch { skipped++; continue; }
    if (cancelled()) return null;
    if (typeof text !== 'string' || text.includes('\0')) { skipped++; continue; }
    const size = encoder.encode(text).length;
    if (size > SEARCH_LIMITS.fileBytes) { skipped++; continue; }
    if (bytes + size > SEARCH_LIMITS.totalBytes) { limited = true; break; }
    bytes += size;
    const matches = findProjectMatches(text, query, options);
    if (matches.length > SEARCH_LIMITS.matchesPerFile) { skipped++; limited = true; continue; }
    if (matches.length) results.push({path, text, matches});
  }
  return {results, skipped, limited};
}
