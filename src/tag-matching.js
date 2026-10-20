// Highlight the names of matching HTML/XML tags (not their < or > characters).
// Pure scanner to avoid changing the source or relying on Monaco's bracket renderer.
const HTML_VOID = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));

export function tagPairs(source, { html = true } = {}) {
  const tokens = [];
  const len = source.length;
  for (let i = 0; i < len; ) {
    if (source[i] !== '<') { i++; continue; }
    if (source.startsWith('<!--', i)) {
      const end = source.indexOf('-->', i + 4); i = end === -1 ? len : end + 3; continue;
    }
    if (source.startsWith('<![CDATA[', i)) {
      const end = source.indexOf(']]>', i + 9); i = end === -1 ? len : end + 3; continue;
    }
    if (source.startsWith('<?', i)) {
      const end = source.indexOf('?>', i + 2); i = end === -1 ? len : end + 2; continue;
    }
    if (source.startsWith('<!', i)) {
      const end = source.indexOf('>', i + 2); i = end === -1 ? len : end + 1; continue;
    }
    const start = i;
    const closing = source[i + 1] === '/';
    const nameStart = i + (closing ? 2 : 1);
    const match = /^[A-Za-z][A-Za-z0-9:._-]*/.exec(source.slice(nameStart));
    if (!match) { i++; continue; }
    const nameEnd = nameStart + match[0].length;
    if (!/[\s/>]/.test(source[nameEnd] || '')) { i++; continue; }
    let q = null, end = nameEnd;
    for (; end < len; end++) {
      const c = source[end];
      if (q) { if (c === q) q = null; }
      else if (c === '\'' || c === '"') q = c;
      else if (c === '>') break;
    }
    if (end === len) break;
    const selfClose = !closing && /\/\s*>$/.test(source.slice(nameEnd, end + 1));
    const name = html ? match[0].toLowerCase() : match[0];
    const token = { name, start, end: end + 1, nameStart, nameEnd, closing, selfClose,
      paired: null };
    tokens.push(token);
    i = end + 1;
    // Never parse fake tags inside the raw text of JS/CSS blocks.
    if (html && !closing && !selfClose && (name === 'script' || name === 'style')) {
      const rest = source.slice(i), closingMatch = new RegExp(`<\\/\\s*${name}\\s*>`, 'i').exec(rest);
      if (!closingMatch) { i = len; break; }
      i += closingMatch.index;
    }
  }
  const stack = [];
  for (const token of tokens) {
    if (token.selfClose || (html && HTML_VOID.has(token.name))) continue;
    if (!token.closing) { stack.push(token); continue; }
    // A closing tag ends the nearest matching open tag. Drop improperly nested
    // tags above that position instead of decorating an unrelated pair.
    const index = stack.findLastIndex(t => t.name === token.name);
    if (index < 0) continue;
    const opening = stack[index];
    opening.paired = token; token.paired = opening;
    stack.length = index;
  }
  return tokens;
}

export function matchingTagNames(source, caret, options) {
  const tokens = tagPairs(source, options);
  // On the name itself or either angle bracket of a tag; reject an unrelated
  // caret inside text. Both ranges cover only the names, not <, / or >.
  const current = tokens.find(t => t.paired && caret >= t.start && caret <= t.end);
  if (!current) return [];
  return [current, current.paired].map(t => ({ start: t.nameStart, end: t.nameEnd }));
}

export function installTagUnderlining(editor, monaco) {
  const markup = new Set(['html', 'xml', 'php']);
  const decorations = editor.createDecorationsCollection();
  const isMarkup = model => model && (markup.has(model.getLanguageId()) ||
    /\.(?:jsx|tsx)$/i.test(model.uri?.path || ''));
  let cachedModel = null, cachedVersion = -1, cachedSource = '', cachedTokens = [];
  function refresh() {
    const model = editor.getModel(), pos = editor.getPosition();
    const lang = model?.getLanguageId();
    if (!model || !pos || !isMarkup(model)) { decorations.clear(); return; }
    const version = model.getVersionId();
    if (model !== cachedModel || version !== cachedVersion) {
      cachedModel = model; cachedVersion = version;
      cachedSource = model.getValue();
      cachedTokens = cachedSource.length <= 2_000_000 ? tagPairs(cachedSource, { html: lang !== 'xml' }) : [];
    }
    const source = cachedSource;
    // Escape hatch for very large documents so moving the cursor stays quick.
    if (source.length > 2_000_000) { decorations.clear(); return; }
    const offset = model.getOffsetAt(pos);
    const tag = cachedTokens.find(t => t.paired && offset >= t.start && offset <= t.end);
    const ranges = tag ? [tag, tag.paired].map(t => ({start:t.nameStart,end:t.nameEnd})) : [];
    decorations.set(ranges.map(item => {
      const a = model.getPositionAt(item.start), b = model.getPositionAt(item.end);
      return { range: new monaco.Range(a.lineNumber,a.column,b.lineNumber,b.column),
        options: { inlineClassName: 'jotta-matching-tag-name' } };
    }));
  }
  function updateLanguage() {
    cachedModel = null; cachedVersion = -1;
    const active = Boolean(isMarkup(editor.getModel()));
    editor.updateOptions({ matchBrackets: active ? 'never' : 'always' });
    refresh();
  }
  editor.onDidChangeCursorPosition(refresh);
  editor.onDidChangeModelContent(refresh);
  editor.onDidChangeModel(updateLanguage);
  updateLanguage();
  return { refresh, dispose: () => decorations.clear() };
}
