// Conservative content-based language identification for unsaved documents only.
// File extensions always take precedence for saved documents.
export function detectLanguage(content) {
  const s = String(content || '').trim();
  if (!s) return null;
  if (/^<\?php\b/i.test(s) || /<\?php\b/i.test(s.slice(0, 512))) return 'php';
  if (/^<\?xml\b/i.test(s)) return 'xml';
  if (/^<!doctype\s+html\b/i.test(s) || /^<html\b/i.test(s) || /<\/?(?:div|body|head|main|section|article|span|p|h[1-6])(?:\s|>)/i.test(s)) return 'html';
  if (/^(?:\{|\[)\s*["\[{\d\-]|^\{\s*\}/.test(s)) {
    try { JSON.parse(s); return 'json'; } catch { /* incomplete JSON */ }
  }
  if (/^#![^\n]*(?:bash|sh|zsh)\b/.test(s)) return 'shell';
  if (/^#![^\n]*python\b/.test(s) || /^(?:from\s+\w+\s+import\s+|import\s+\w+\s*$|def\s+\w+\s*\(|class\s+\w+\s*[:(])/m.test(s)) return 'python';
  if (/^(?:SELECT\s+.+\s+FROM\s+|CREATE\s+TABLE\s+|INSERT\s+INTO\s+)/i.test(s)) return 'sql';
  if (/^(?:export\s+|import\s+.+\s+from\s+|const\s+|let\s+|function\s+|async\s+function\s+)/m.test(s)) return 'javascript';
  if (/(?:^|[\n}])\s*(?:[.#]?[\w-]+(?:\s+[.#]?[\w-]+)*)\s*\{\s*(?:[\n\r\t ]*[\w-]+\s*:\s*[^{};]+;?)+/m.test(s)) return 'css';
  if (/^#{1,6}\s+\S/m.test(s) || /\[[^\]]+\]\(https?:\/\//.test(s)) return 'markdown';
  return null;
}
