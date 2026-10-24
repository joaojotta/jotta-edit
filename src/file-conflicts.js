// A review is tied to one document model, path and saved baseline. Reading a
// newer file never changes that baseline or the user's working copy.
export function createFileConflicts({api, isOpen, present, changed}) {
  const reviews = new WeakMap(), requests = new WeakMap();
  const valid = (doc, review) => isOpen(doc) && doc.path === review.path &&
    doc.model === review.model && doc.savedText === review.base;
  function current(doc) {
    const review = reviews.get(doc);
    return review && valid(doc, review) ? review : null;
  }
  function clear(doc) { reviews.delete(doc); requests.delete(doc); }
  async function check(doc) {
    if (!doc?.path || !isOpen(doc)) return null;
    const source = {path:doc.path, model:doc.model, base:doc.savedText}, token = {};
    requests.set(doc, token);
    const latest = await api.readFile(source.path, {fresh:true});
    if (requests.get(doc) !== token || !valid(doc, source)) return null;
    if (typeof latest.content !== 'string') throw new Error('Could not read the latest file. Your edits are still unsaved.');
    if (latest.content === source.base) { reviews.delete(doc); return null; }
    const previous = current(doc);
    const review = previous?.text === latest.content ? previous :
      Object.freeze({...source, text:latest.content, mtimeMs:latest.mtimeMs});
    reviews.set(doc, review);
    return review;
  }
  function expectedText(doc, review) {
    if (!review || current(doc) !== review) throw new Error('The file changed again. Refresh the comparison before resolving it.');
    return review.text;
  }
  function show(doc, review = current(doc)) {
    if (review && current(doc) === review) present(doc, review);
  }
  async function useLatest(doc, review) {
    expectedText(doc, review);
    const before = doc.model.getValue();
    // Preserve an additional recovery copy before replacing the working text.
    await api.captureHistory?.(review.path, before);
    const latest = await check(doc);
    if (latest !== review) {
      show(doc, latest);
      throw new Error('The file changed again. Refresh the comparison before resolving it.');
    }
    if (doc.model.getValue() !== before) throw new Error('Your edits changed while loading the latest file. Review them before trying again.');
    doc.savedText = review.text;
    doc.mtimeMs = review.mtimeMs;
    if (before !== review.text) {
      doc.model.pushStackElement();
      doc.model.pushEditOperations([], [{range:doc.model.getFullModelRange(), text:review.text}], () => null);
      doc.model.pushStackElement();
    }
    doc.dirty = doc.model.getValue() !== doc.savedText;
    clear(doc); changed(doc);
    return true;
  }
  return {check, current, clear, show, expectedText, useLatest};
}

// Electron's IPC preserves error messages, but does not preserve custom codes.
export function isFileConflict(error) {
  return /File changed on (?:disk|the server)\./.test(String(error?.message || error));
}
