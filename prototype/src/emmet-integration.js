// Wires the Emmet engine (./emmet.js, ./emmet-caret.js) to Tab-expansion.
// Uses a Monaco context key so Tab only triggers the expansion when an
// abbreviation is actually present at the caret; otherwise Tab falls through
// to Monaco's normal indentation handling untouched.
import { abbreviationAt, indentedExpansion } from './emmet.js';
import { insertionForExpansion } from './emmet-caret.js';

function findAbbreviation(editor, explicit) {
  const model = editor.getModel();
  const position = editor.getPosition();
  if (!model || !position || editor.getSelections().length !== 1 || !editor.getSelection().isEmpty()) return null;
  const line = model.getLineContent(position.lineNumber);
  const language = model.getLanguageId();
  const found = abbreviationAt(line, position.column - 1, language, model.uri.path, explicit);
  return found && { found, line, position };
}

function expand(editor, monaco, explicit) {
  const current = findAbbreviation(editor, explicit);
  if (!current) return false;
  const { found, line, position } = current;
  const range = new monaco.Range(position.lineNumber, found.start + 1, position.lineNumber, found.end + 1);
  const insertion = insertionForExpansion(indentedExpansion(found, line));
  const model = editor.getModel();
  const startOffset = model.getOffsetAt(range.getStartPosition());
  editor.pushUndoStop();
  editor.executeEdits('emmet', [{ range, text: insertion.text }]);
  editor.setPosition(model.getPositionAt(startOffset + insertion.caretOffset));
  editor.pushUndoStop();
  return true;
}

export function setupEmmet(editor, monaco) {
  const expandable = editor.createContextKey('emmetExpandable', false);
  const refresh = () => expandable.set(Boolean(findAbbreviation(editor, false)));
  editor.onDidChangeCursorPosition(refresh);
  editor.onDidChangeModelContent(refresh);
  editor.onDidChangeModel(refresh);
  editor.addAction({
    id: 'emmet.expandTab', label: 'Emmet: Expand Abbreviation (Tab)',
    keybindings: [monaco.KeyCode.Tab],
    precondition: 'editorTextFocus && emmetExpandable && !suggestWidgetVisible && !inSnippetMode',
    run: () => expand(editor, monaco, false)
  });
  editor.addAction({
    id: 'emmet.expandExplicit', label: 'Emmet: Expand Abbreviation',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyE],
    precondition: 'editorTextFocus',
    run: () => expand(editor, monaco, true)
  });
  refresh();
}
