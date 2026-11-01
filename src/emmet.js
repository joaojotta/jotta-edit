// Slate's Emmet integration uses the upstream Emmet engine rather than a
// hand-written abbreviation parser. This supports grouping, nesting, classes,
// id selectors, numbering, repetition and stylesheet snippets.
import expand, { extract } from 'emmet';

const markupLanguages = new Set(['html', 'php', 'xml']);
const stylesLanguages = new Set(['css', 'scss', 'less']);
const tagAbbreviations = new Set([
  'a', 'abbr', 'article', 'aside', 'body', 'br', 'button', 'div', 'em',
  'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header',
  'html', 'img', 'input', 'label', 'li', 'link', 'main', 'meta', 'nav',
  'ol', 'option', 'p', 'script', 'section', 'select', 'span', 'strong',
  'style', 'table', 'tbody', 'td', 'textarea', 'th', 'title', 'tr', 'ul'
]);

export function emmetSyntax(language, filename = '', lineBeforeCaret = '') {
  if (stylesLanguages.has(language)) return language;
  if (/\.(jsx|tsx)$/i.test(filename)) return 'jsx';
  if (!markupLanguages.has(language)) return null;
  if (language === 'php') {
    // Do not expand markup inside a PHP code region.
    const codeStart = Math.max(lineBeforeCaret.lastIndexOf('<?php'), lineBeforeCaret.lastIndexOf('<?='), lineBeforeCaret.lastIndexOf('<?'));
    if (codeStart !== -1 && codeStart > lineBeforeCaret.lastIndexOf('?>')) return null;
  }
  return language === 'xml' ? 'xml' : 'html';
}

export function abbreviationAt(line, caretOffset, language, filename = '', explicit = false, documentPrefix = null) {
  if (!Number.isInteger(caretOffset) || caretOffset <= 0 || caretOffset > line.length) return null;
  const syntax = emmetSyntax(language, filename, documentPrefix ?? line.slice(0, caretOffset));
  if (!syntax) return null;
  // Emmet's extract() understands nested, grouped and numbered abbreviations.
  // It returns original character offsets, which we reuse for Monaco ranges.
  const stylesheet = stylesLanguages.has(language);
  let match;
  try { match = extract(line, caretOffset, { type: stylesheet ? 'stylesheet' : 'markup' }); }
  catch { return null; }
  if (!match?.abbreviation || match.end !== caretOffset) return null;
  const abbreviation = match.abbreviation;
  if (abbreviation.length > 300 || /[\r\n]/.test(abbreviation)) return null;
  if (!stylesheet) {
    // A closing angle bracket or semicolon signals existing markup, not an Emmet abbreviation.
    // The > operator MUST remain allowed: Emmet nesting uses e.g. ul>li*3.
    if (/[<;]/.test(abbreviation) || /^\s/.test(abbreviation)) return null;
    if (!explicit && /^[a-z][\w-]*$/i.test(abbreviation) && !tagAbbreviations.has(abbreviation.toLowerCase())) return null;
  } else if (!explicit && !/\d|[:+!#-]/.test(abbreviation)) {
    // Avoid consuming Tab for ordinary CSS property names, e.g. 'color'.
    return null;
  }
  try {
    const result = expand(abbreviation, {
      syntax,
      type: stylesheet ? 'stylesheet' : 'markup',
      options: { 'output.format': true, 'output.indent': '  ' }
    });
    if (!result || result === abbreviation || result.length > 250000) return null;
    return { abbreviation, start: match.start, end: match.end, syntax, result };
  } catch { return null; }
}

export function indentedExpansion(found, line) {
  const indent = (line.match(/^\s*/) || [''])[0];
  // Base indent is already present before the abbreviation; only additional
  // lines need the same prefix. Retain nested indentation from Emmet itself.
  return found.result.replace(/\n/g, `\n${indent}`);
}
