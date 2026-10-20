'use strict';
const fs = require('node:fs');
const path = require('node:path');

function verifyWebBuild(distDir) {
  const errors = [];
  const dest = path.resolve(distDir);
  const entry = path.join(dest, 'index.html');
  if (!fs.existsSync(entry)) throw new Error('Missing compiled index.html. Run npm run build:pwa, not a copy of web/.');
  const html = fs.readFileSync(entry, 'utf8');
  if (/\.\.\/src\/web-entry\.js|src\/main\.js/.test(html)) {
    errors.push('index.html still contains source entrypoints; publish compiled web-dist/, not web/.');
  }
  function attribute(tag, attr) {
    const match = tag.match(new RegExp(`\\b${attr}\\s*=\\s*(?:"([^"]+)"|'([^']+)')`, 'i'));
    return match?.[1] || match?.[2] || '';
  }
  const styles = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map(([tag]) => ({href: attribute(tag, 'href'), rel: attribute(tag, 'rel')}))
    .filter(tag => tag.rel.split(/\s+/).includes('stylesheet'));
  const modules = [...html.matchAll(/<script\b[^>]*>/gi)]
    .map(([tag]) => ({src: attribute(tag, 'src'), type: attribute(tag, 'type')}))
    .filter(tag => tag.type === 'module');
  if (!styles.length) errors.push('No compiled CSS link found in index.html.');
  if (!modules.length) errors.push('No compiled JavaScript module found in index.html.');
  const cssContents = [];
  function checkFile(url, kind) {
    if (!url || /^(?:https?:)?\/\//i.test(url)) {
      errors.push(`Invalid ${kind} URL in index.html: ${url}`);
      return;
    }
    const pathname = url.split(/[?#]/)[0];
    const relative = pathname.replace(/^\.\//, '').replace(/^\//, '');
    if (pathname.startsWith('/') || relative.split('/').some(part => !part || part === '..' || part === '.')) {
      errors.push(`${kind} must use an intact relative file path: ${url}`);
      return;
    }
    const file = path.resolve(dest, relative);
    if (!file.startsWith(dest + path.sep) || !fs.existsSync(file) || fs.statSync(file).size === 0) {
      errors.push(`Missing generated ${kind}: ${url} (expected ${file})`);
      return;
    }
    if (kind === 'CSS') cssContents.push(fs.readFileSync(file, 'utf8'));
  }
  for (const tag of styles) checkFile(tag.href, 'CSS');
  for (const tag of modules) checkFile(tag.src, 'JavaScript');
  if (cssContents.length && !cssContents.some(css => css.includes('.sidebar') && css.includes('.jotta-web'))) {
    errors.push('Compiled CSS does not contain both desktop editor and web interface styles.');
  }
  for (const item of ['icon.png', 'manifest.webmanifest', 'sw.js']) {
    if (!fs.existsSync(path.join(dest, item))) errors.push(`Missing PWA asset ${item}`);
  }
  if (errors.length) throw new Error(`Web deployment is incomplete:\n- ${errors.join('\n- ')}`);
  return {stylesheets:styles.length, modules:modules.length};
}

if (require.main === module) {
  try {
    const dest = process.argv[2] || path.join(__dirname, '../web-dist');
    const result = verifyWebBuild(dest);
    console.log(`Web deployment verified: ${result.stylesheets} CSS stylesheet(s), ${result.modules} JS entrypoint(s), manifest and offline worker.`);
    console.log('Upload EVERYTHING in web-dist/, or build the deployment ZIP with ./scripts/build-web.sh.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = {verifyWebBuild};
