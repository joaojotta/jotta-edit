/** Determine whether the caret is inside a local path in common web/code contexts.
 * Does not offer filesystem paths inside network URLs or data/mailto URIs.
 * The returned range replaces only the current path segment, preserving ../ and subfolders.
 */
const supported = new Set(['html','xml','css','scss','less','javascript','typescript','php','json']);
const external = /^(?:[a-z][a-z\d+.-]*:|\/\/|#|\?)/i;
export function pathContext(line, column, language) {
  if (!supported.has(language) || !Number.isInteger(column) || column < 1 || column > line.length + 1) return null;
  const before = line.slice(0, column - 1);
  let match;
  // HTML attributes (also accepted in PHP templates).
  match = /(?:^|[\s<])(?:src|href|action|poster|data|srcset|formaction|include|file|path)\s*=\s*(["'])([^"'<>]*)$/i.exec(before);
  if (!match && ['css','scss','less','html','php'].includes(language)) {
    match = /(?:url\(\s*(["']?)|@import\s+(["']))([^"')\s]*)$/i.exec(before);
    if (match) match = [match[0], '', match[3]];
  }
  // In JS, PHP, JSON or CSS, quoted strings can contain project paths.
  if (!match && ['javascript','typescript','php','json','css','scss','less'].includes(language)) {
    match = /(["'`])([^"'`\r\n]*)$/.exec(before);
    if (match && /(^|[^\\])\\$/.test(match[2])) match = null;
  }
  if (!match) return null;
  const typed = match[2];
  if (external.test(typed) || typed.includes('\\') || typed.includes('\0') || typed.length > 260 || /[?*<>|]/.test(typed)) return null;
  // A bare string with no path separator should only complete when it is in a
  // path-looking context, or when invoked explicitly. Strings with ./ are always paths.
  const segment = typed.slice(typed.lastIndexOf('/') + 1);
  const startColumn = column - segment.length;
  return { typed, segment, startColumn, endColumn: column };
}
export function filterPathItems(entries, fragment) {
  const needle = fragment.toLowerCase();
  return entries.filter(x => !needle || x.name.toLowerCase().startsWith(needle)).map(x => ({
    label: x.name + (x.dir ? '/' : ''),
    insertText: x.name + (x.dir ? '/' : ''),
    dir: x.dir
  }));
}
