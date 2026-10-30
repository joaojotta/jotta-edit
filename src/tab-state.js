export function keepTab(doc) {
  if (!doc?.preview) return false;
  doc.preview = false; doc.previewPane = null;
  return true;
}
export function pinTab(tabs, doc, pinned = !doc?.pinned) {
  if (!doc || !tabs.includes(doc)) return;
  keepTab(doc); doc.pinned = Boolean(pinned);
  tabs.sort((a,b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
}
export function replaceablePreview(tabs, pane, visibleElsewhere = () => false) {
  const candidates = tabs.filter(doc => doc.preview && doc.previewPane === pane);
  for (const doc of candidates) {
    if (doc.dirty || doc.pinned || visibleElsewhere(doc.id)) { keepTab(doc); continue; }
    return doc;
  }
  return null;
}
