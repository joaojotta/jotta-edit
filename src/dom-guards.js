/** UI startup helpers. Monaco may return null before its view is mounted. */
export function requiredElement(documentRef, id) {
  const element = documentRef.getElementById(id);
  if (!element) throw new Error(`Jotta Edit interface is missing #${id}. Check the packaged dist/index.html.`);
  return element;
}

export function editorInputTarget(editor, fallbackElement) {
  // getDomNode(): HTMLElement | null according to the Monaco API.
  // Never abort the whole application merely because the editor view is pending.
  return editor?.getDomNode?.() || fallbackElement || null;
}
