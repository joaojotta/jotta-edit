// Place the caret in the first empty leaf element, or just after the first opening tag.
// This covers .this, .content*5, nested elements and ordinary paired tags.
export function expansionCaret(text) {
  const pair = /<(?!\/|!)([a-z][\w:-]*)\b[^>]*>(\s*)<\/\1\s*>/i.exec(text);
  if (pair) return pair.index + pair[0].indexOf('>') + 1;
  const open = /<(?!\/|!|\?)([a-z][\w:-]*)\b[^>]*>/i.exec(text);
  return open ? open.index + open[0].length : text.length;
}
export function insertionForExpansion(text) { return { text, caretOffset: expansionCaret(text) }; }
export function snippetForExpansion(text) {
  const position = expansionCaret(text);
  const escape = part => part.replace(/[\\$}]/g, '\\$&');
  return escape(text.slice(0, position)) + '$0' + escape(text.slice(position));
}
