import { prettierPrintWidth } from './editor-behaviour.js';

// Browser-compatible, lazily loaded Prettier standalone plugins. No network
// requests or external executables are needed for these five formatters.
export const formatLanguages = new Set([
  'javascript', 'typescript', 'json', 'html', 'css', 'scss', 'less', 'php'
]);

const lazy = (load) => {
  let task;
  return () => (task ||= load().catch(error => { task = null; throw error; }));
};
const getPrettier = lazy(() => import('prettier/standalone'));
const getBabel = lazy(() => import('prettier/plugins/babel'));
const getEstree = lazy(() => import('prettier/plugins/estree'));
const getTypescript = lazy(() => import('prettier/plugins/typescript'));
const getHtml = lazy(() => import('prettier/plugins/html'));
const getPostcss = lazy(() => import('prettier/plugins/postcss'));
// PHP standalone is published as UMD. Node's dynamic import often wraps the
// UMD exports under `default`, while a browser bundler can expose them directly.
// Pass the actual parsers/printers object to Prettier in either environment.
export function unwrapPhpPlugin(module) {
  const plugin = module?.parsers?.php ? module : module?.default?.parsers?.php ? module.default : null;
  if (!plugin) throw new Error('PHP formatter plugin does not expose a php parser');
  return plugin;
}
const getPhp = lazy(async () => unwrapPhpPlugin(await import('@prettier/plugin-php/standalone')));

export function hasMixedPhpHtml(source) {
  if (!/<\?(?:php|=|\s)/i.test(source)) return false;
  // Markup either before opening a PHP block or after closing one.
  const open = source.search(/<\?(?:php|=|\s)/i);
  if (/<(?:[a-z][\w:-]*\b|!doctype\b|!--)/i.test(source.slice(0, open))) return true;
  const afterClose = source.indexOf('?>', open);
  return afterClose !== -1 && /<[a-z][\w:-]*\b/i.test(source.slice(afterClose + 2));
}

function parserFor(lang, filename) {
  switch (lang) {
    case 'javascript': return /\.jsx$/i.test(filename) ? 'babel' : 'babel';
    case 'typescript': return 'typescript';
    case 'json': return /\.jsonc$/i.test(filename) ? 'jsonc' : 'json';
    case 'html': return 'html';
    case 'css': return 'css';
    case 'scss': return 'scss';
    case 'less': return 'less';
    case 'php': return 'php';
    default: return null;
  }
}

export async function formatCode(source, { language, filename = '', tabWidth = 2, useTabs = false, printWidth = 'none' } = {}) {
  const parser = parserFor(language, filename);
  if (!parser) return null;
  if (!source.trim()) return source;
  const plugins = [];
  if (parser === 'babel' || parser === 'json' || parser === 'jsonc') {
    plugins.push(await getBabel(), await getEstree());
  } else if (parser === 'typescript') {
    plugins.push(await getTypescript(), await getEstree());
  } else if (parser === 'html') {
    plugins.push(await getHtml(), await getBabel(), await getEstree(), await getPostcss(), await getTypescript());
  } else if (parser === 'css' || parser === 'scss' || parser === 'less') {
    plugins.push(await getPostcss());
  } else if (parser === 'php') {
    plugins.push(await getPhp());
  }
  const prettier = await getPrettier();
  const formatted = await prettier.format(source, {
    parser,
    plugins,
    tabWidth,
    useTabs,
    printWidth: prettierPrintWidth(printWidth),
    // Keep paragraph prose as typed instead of imposing artificial line breaks.
    // Existing hard newlines stay intact; editor word-wrap never edits the source.
    proseWrap: 'never',
    phpVersion: 'auto',
    singleQuote: language === 'javascript' || language === 'typescript',
    endOfLine: 'lf'
  });
  return formatted;
}
