'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = filename => fs.readFileSync(path.join(root, filename), 'utf8');

test('current release version and artifact templates are consistent', () => {
  const pkg = require('../package.json');
  assert.equal(pkg.version, '1.1.0');
  assert.match(read('index.html'), /Version 1\.1\.0/);
  assert.equal(pkg.build.win.artifactName, 'Jotta-Edit-${version}-Windows-${arch}-Portable.${ext}');
  assert.equal(pkg.build.flatpak.artifactName, 'Jotta-Edit-${version}-linux-${arch}.flatpak');
});

test('the sidebar control uses the exact uploaded fold and unfold SVGs', () => {
  const html = read('index.html');
  assert.match(html, /id="btn-sidebar"[^>]*aria-controls="sidebar"[^>]*aria-expanded="true"/);
  assert.match(html, /id="sidebar-toggle-icon"[^>]*src="\/ui-icons\/sidebar-fold\.svg"/);
  for (const name of ['sidebar-fold', 'sidebar-unfold']) {
    const content = read(`public/ui-icons/${name}.svg`);
    assert.match(content, /<svg\b/);
    assert.match(content, /viewBox="0 0 24 24"/);
    assert.match(content, /<path\b/);
  }
});

test('toggle and initial state use matching icons, tooltip and accessibility state', () => {
  const code = read('src/main.js');
  const functionBody = code.slice(code.indexOf('function updateSidebarToggle()'), code.indexOf('function toggleSidebar()'));
  assert.match(functionBody, /state\.sidebarOpen \? 'Hide sidebar \(Ctrl\+B\)' : 'Show sidebar \(Ctrl\+B\)'/);
  assert.match(functionBody, /state\.sidebarOpen\s*\? '\/ui-icons\/sidebar-fold\.svg'\s*:\s*'\/ui-icons\/sidebar-unfold\.svg'/);
  assert.match(functionBody, /button\.setAttribute\('aria-expanded', String\(state\.sidebarOpen\)\)/);
  const toggle = code.slice(code.indexOf('function toggleSidebar()'), code.indexOf('function toggleMinimap()'));
  assert.match(toggle, /updateSidebarToggle\(\)/);
  assert.match(code, /\$\('btn-sidebar'\)\.onclick = toggleSidebar/);
  // An initial run and a language preference change must refresh the label.
  assert.ok((code.match(/updateSidebarToggle\(\);/g) || []).length >= 3);
  const i18n = read('src/i18n.js');
  assert.match(i18n, /'Hide sidebar \(Ctrl\+B\)':'Ocultar explorador \(Ctrl\+B\)'/);
  assert.match(i18n, /'Show sidebar \(Ctrl\+B\)':'Mostrar explorador \(Ctrl\+B\)'/);
});

test('the sidebar SVG stays centred and adapts to both interface themes', () => {
  const css = read('src/style.css');
  assert.match(css, /#btn-sidebar\s*\{[^}]*display: inline-flex; align-items: center; justify-content: center;/);
  assert.match(css, /#btn-sidebar \.sidebar-toggle-icon/);
  assert.match(css, /:root\[data-theme="dark"\] #btn-sidebar \.sidebar-toggle-icon/);
  assert.match(css, /:root\[data-theme="light"\] #btn-sidebar \.sidebar-toggle-icon/);
});
