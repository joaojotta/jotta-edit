// Monaco's bundled HTML worker has no embedded-CSS awareness at all (its
// completion provider only knows HTML tags/attributes), so typing inside a
// <style> block gets no CSS suggestions. This fills that gap the same way
// document-outline.js extracts embedded CSS for the outline: by running the
// real CSS language service directly against the extracted stylesheet text.
function styleBlockAt(text, offset) {
  const regex = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let match;
  while ((match = regex.exec(text))) {
    const start = match.index + match[0].indexOf('>') + 1;
    const end = start + match[1].length;
    if (offset >= start && offset <= end) return { start, end };
  }
  return null;
}

let cssServicePromise = null;
function cssService() {
  return cssServicePromise ||= import('../node_modules/monaco-editor/esm/external/vscode-css-languageservice/lib/esm/cssLanguageService.js')
    .then(m => m.getCSSLanguageService());
}

// LSP CompletionItemKind numbers (vscode-languageserver-types) mapped onto
// Monaco's own enum; defaults to Property for anything not covered.
const KIND_MAP = { 1: 'Text', 3: 'Function', 5: 'Field', 9: 'Module', 10: 'Property', 12: 'Value', 14: 'Keyword', 15: 'Snippet', 16: 'Color', 21: 'Constant' };

export function installStyleBlockCompletion(monaco) {
  monaco.languages.registerCompletionItemProvider('html', {
    triggerCharacters: [':', ' ', '-'],
    async provideCompletionItems(model, position) {
      const text = model.getValue();
      const offset = model.getOffsetAt(position);
      const region = styleBlockAt(text, offset);
      if (!region) return { suggestions: [] };
      const [{ TextDocument }, service] = await Promise.all([
        import('../node_modules/monaco-editor/esm/external/vscode-languageserver-textdocument/lib/esm/main.js'),
        cssService()
      ]);
      const cssText = text.slice(region.start, region.end);
      const cssDocument = TextDocument.create(model.uri.toString(), 'css', model.getVersionId(), cssText);
      const stylesheet = service.parseStylesheet(cssDocument);
      const result = service.doComplete(cssDocument, cssDocument.positionAt(offset - region.start), stylesheet);
      if (!result?.items?.length) return { suggestions: [] };
      // Replace the word under the caret (including hyphens, e.g.
      // "background-color") rather than mapping each item's own text edit
      // from the extracted CSS text back into HTML coordinates.
      const line = model.getLineContent(position.lineNumber);
      let start = position.column;
      while (start > 1 && /[\w-]/.test(line[start - 2])) start--;
      const range = new monaco.Range(position.lineNumber, start, position.lineNumber, position.column);
      return {
        suggestions: result.items.map(item => ({
          label: item.label,
          kind: monaco.languages.CompletionItemKind[KIND_MAP[item.kind] || 'Property'],
          insertText: item.insertText ?? item.label,
          insertTextRules: item.insertTextFormat === 2 ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
          detail: item.detail,
          documentation: typeof item.documentation === 'string' ? item.documentation : item.documentation?.value,
          sortText: item.sortText,
          range
        }))
      };
    }
  });
}
