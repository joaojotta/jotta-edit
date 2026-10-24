// Views share document models; each pane owns its selection and scroll state.
export function installEditorLayout({monaco, primary, host, getDocuments, options, configure, activate, tr = s => s, displayPath = path => path}) {
  const make = (tag, className, parent) => {
    const node = document.createElement(tag); node.className = className; parent.appendChild(node); return node;
  };
  const workspace = make('div', 'editor-workspace', host.parentElement);
  const panes = [];
  let active, split = false, comparison = null, diff = null, original = null, ratio = .5;
  const diffWrap = make('section', 'comparison-view', host.parentElement);
  diffWrap.hidden = true;
  const toolbar = make('div', 'pane-heading comparison-heading', diffWrap);
  const caption = make('span', 'comparison-caption', toolbar);
  const button = (parent, label, action) => {
    const node = make('button', '', parent); node.type = 'button'; node.textContent = tr(label);
    node.setAttribute('aria-label', tr(label)); node.onclick = action; return node;
  };
  button(toolbar, 'Previous change', () => diff?.goToDiff('previous'));
  button(toolbar, 'Next change', () => diff?.goToDiff('next'));
  button(toolbar, 'Close comparison', () => closeComparison());
  const conflictBar = make('div', 'conflict-actions', diffWrap);
  conflictBar.hidden = true;
  const conflictMessage = make('p', 'conflict-message', conflictBar);
  conflictMessage.setAttribute('role', 'status');
  conflictMessage.textContent = tr('Latest file on the left, your edits on the right. Copy individual changes with the arrows, or edit the right side before saving.');
  const conflictButtons = make('div', 'conflict-buttons', conflictBar);
  let conflictActions = null;
  for (const [label, action] of [['Use latest file', 'useLatest'], ['Save resolved file', 'save'], ['Save As…', 'saveAs'], ['Refresh latest file', 'refresh']]) {
    button(conflictButtons, label, () => conflictActions?.[action]());
  }
  const diffHost = make('div', 'comparison-editor', diffWrap);
  function notify(pane, target = pane.editor) {
    active = pane;
    for (const p of panes) p.node.classList.toggle('active-pane', p === pane);
    activate(target, getDocuments().find(doc => doc.id === pane.id) || null);
  }
  function addPane(target, editorHost) {
    const node = make('section', 'editor-pane', workspace);
    const heading = make('div', 'pane-heading', node);
    const select = make('select', 'pane-document', heading);
    select.setAttribute('aria-label', tr(panes.length ? 'Right editor file' : 'Left editor file'));
    node.appendChild(editorHost); editorHost.classList.add('pane-editor');
    const pane = {node, heading, select, editor:target, id:null, views:new Map()};
    panes.push(pane);
    target.onDidFocusEditorText(() => notify(pane));
    select.onchange = () => {
      closeComparison(false); active = pane;
      selectDocument(getDocuments().find(doc => doc.id === select.value) || null);
    };
    return pane;
  }
  const first = addPane(primary, host); active = first;
  const divider = make('div', 'editor-divider', workspace);
  divider.tabIndex = 0; divider.setAttribute('role', 'separator');
  divider.setAttribute('aria-orientation', 'vertical'); divider.setAttribute('aria-label', tr('Resize editors'));
  function resize(value) {
    ratio = Math.max(.2, Math.min(.8, value));
    workspace.style.setProperty('--editor-split', `${ratio * 100}%`);
    divider.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
    layout();
  }
  divider.setAttribute('aria-valuemin', '20'); divider.setAttribute('aria-valuemax', '80');
  divider.addEventListener('pointerdown', e => { divider.setPointerCapture(e.pointerId); });
  divider.addEventListener('pointermove', e => {
    if (!divider.hasPointerCapture(e.pointerId)) return;
    const bounds = workspace.getBoundingClientRect(); resize((e.clientX - bounds.left) / bounds.width);
  });
  divider.addEventListener('pointerup', e => { if (divider.hasPointerCapture(e.pointerId)) divider.releasePointerCapture(e.pointerId); });
  divider.addEventListener('keydown', e => {
    if (!['ArrowLeft','ArrowRight','Home'].includes(e.key)) return;
    e.preventDefault(); resize(e.key === 'Home' ? .5 : ratio + (e.key === 'ArrowLeft' ? -.05 : .05));
  });
  function remember(pane) { if (pane.id) pane.views.set(pane.id, pane.editor.saveViewState()); }
  function assign(pane, doc) {
    if (pane.id !== (doc?.id || null) || pane.editor.getModel() !== (doc?.model || null)) {
      remember(pane); pane.id = doc?.id || null; pane.editor.setModel(doc?.model || null);
      if (doc) pane.editor.restoreViewState(pane.views.get(doc.id) || doc.viewState || null);
    }
  }
  function refresh() {
    const docs = getDocuments();
    for (const pane of panes) {
      pane.select.replaceChildren();
      for (const doc of docs) {
        const option = make('option', '', pane.select); option.value = doc.id;
        option.textContent = `${doc.name}${doc.dirty ? ' •' : ''}`;
        option.title = displayPath(doc.path) || doc.name;
      }
      pane.select.value = pane.id || ''; pane.heading.hidden = !split;
    }
    workspace.classList.toggle('is-split', split); divider.hidden = !split;
    if (panes[1]) panes[1].node.hidden = !split;
    workspace.hidden = !docs.length || Boolean(comparison);
  }
  function selectDocument(doc) {
    closeComparison(false);
    assign(active, doc); refresh(); notify(active);
    if (doc) active.editor.focus();
  }
  function toggleSplit() {
    if (!getDocuments().length) return;
    closeComparison(false);
    if (split) {
      const current = getDocuments().find(doc => doc.id === active.id);
      remember(active); assign(first, current); active = first;
      assign(panes[1], null); split = false;
    } else {
      if (!panes[1]) {
        const secondHost = document.createElement('div'); secondHost.id = 'editor-secondary';
        const second = monaco.editor.create(secondHost, options());
        const pane = addPane(second, secondHost);
        button(pane.heading, 'Close split', toggleSplit);
        configure(second, secondHost);
      }
      split = true;
      const doc = getDocuments().find(doc => doc.id !== active.id) || getDocuments().find(doc => doc.id === active.id);
      assign(panes[1], doc); active = panes[1];
    }
    refresh(); resize(ratio); notify(active); active.editor.focus();
  }
  function compareSaved(doc, snapshot = null) {
    if (!doc) return;
    closeComparison(false); assign(active, doc); remember(active);
    if (!diff) {
      diff = monaco.editor.createDiffEditor(diffHost, {...options(), originalEditable:false, readOnly:false,
        renderSideBySide:true, useInlineViewWhenSpaceIsLimited:false, ignoreTrimWhitespace:false,
        renderIndicators:true, enableSplitViewResizing:true});
      configure(diff.getModifiedEditor(), diffHost);
      diff.getModifiedEditor().onDidFocusEditorText(() => { if (comparison) notify(active, diff.getModifiedEditor()); });
      // Read-only original focus must keep Save/Format/Undo targeted at the working copy.
      diff.getOriginalEditor().onDidFocusEditorText(() => { if (comparison) notify(active, diff.getModifiedEditor()); });
    }
    original = monaco.editor.createModel(snapshot ? snapshot.text : doc.savedText, doc.model.getLanguageId());
    conflictActions = snapshot?.conflict || null;
    conflictBar.hidden = !conflictActions;
    diff.updateOptions({renderMarginRevertIcon:Boolean(conflictActions), renderGutterMenu:!conflictActions});
    comparison = doc.id;
    caption.textContent = `${doc.name} — ${snapshot ? snapshot.label : tr('Saved snapshot')} ↔ ${tr('Current changes')}`;
    caption.title = snapshot ? snapshot.label : tr('The saved version when this comparison was opened. Reopen to refresh.');
    diff.setModel({original, modified:doc.model});
    diff.getModifiedEditor().restoreViewState(active.editor.saveViewState());
    diffWrap.hidden = false; refresh(); layout(); notify(active, diff.getModifiedEditor());
    diff.getModifiedEditor().focus();
  }
  function closeComparison(focus = true) {
    if (!comparison) return;
    const view = diff.getModifiedEditor().saveViewState();
    diff.setModel(null); original.dispose(); original = null; comparison = null; diffWrap.hidden = true;
    conflictActions = null; conflictBar.hidden = true;
    active.editor.restoreViewState(view); refresh(); layout(); notify(active);
    if (focus) active.editor.focus();
  }
  function removeDocument(id, fallback) {
    if (comparison === id) closeComparison(false);
    for (const pane of panes) {
      if (pane.id === id) assign(pane, pane === active ? fallback : getDocuments().find(doc => doc.id !== id) || null);
      pane.views.delete(id);
    }
    if (!getDocuments().length) { split = false; active = first; }
    refresh(); notify(active);
  }
  function rebind(doc, old) {
    for (const pane of panes) if (pane.editor.getModel() === old) {
      const view = pane.editor.saveViewState(); pane.editor.setModel(doc.model); pane.editor.restoreViewState(view);
    }
    if (comparison === doc.id) {
      const view = diff.getModifiedEditor().saveViewState();
      diff.setModel({original, modified:doc.model});
      diff.getModifiedEditor().restoreViewState(view);
    }
    refresh();
  }
  function layout() { for (const pane of panes) if (!pane.node.hidden) pane.editor.layout(); if (comparison) diff.layout(); }
  function updateOptions(value) { for (const pane of panes) pane.editor.updateOptions(value); diff?.updateOptions(value); }
  refresh(); resize(.5);
  return {selectDocument, toggleSplit, compareSaved, closeComparison, removeDocument, rebind, refresh, layout, updateOptions,
    get split() { return split; }, get comparing() { return Boolean(comparison); },
    get comparisonId() { return comparison; }, get resolving() { return Boolean(conflictActions); }};
}
