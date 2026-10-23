"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

function makeTabs() {
  const panels = new Map();
  const buttons = ['editor', 'themes', 'explorer', 'general'].map(id => {
    panels.set('settings-pane-' + id, { hidden: id !== 'editor' });
    const attrs = { 'aria-controls': 'settings-pane-' + id };
    return { dataset: { settingsTab: id }, attributes: attrs, tabIndex: -1,
      setAttribute(name, value) { attrs[name] = value; },
      getAttribute(name) { return attrs[name]; },
      focus() { this.focused = true; } };
  });
  const handlers = {};
  const tabs = { querySelectorAll: () => buttons, addEventListener(type, cb) { handlers[type] = cb; },
    contains(button) { return buttons.includes(button); } };
  const dialog = { querySelector(selector) { return panels.get(selector.slice(1)); } };
  return { buttons, panels, handlers, tabs, dialog };
}

test('Preferences tabs retain all controls, roles and a draggable title bar', () => {
  const html = read('index.html');
  const css = read('src/style.css');
  const js = read('src/main.js');
  const initial = require('../package.json');
  assert.equal(initial.version, '1.1.4', 'current release version');
  for (const id of ['editor','themes','explorer','general']) {
    assert.match(html, new RegExp(`id="settings-tab-${id}"[^>]*role="tab"`));
    assert.match(html, new RegExp(`id="settings-pane-${id}"[^>]*role="tabpanel"`));
  }
  assert.match(html, /id="settings-drag-handle"/);
  assert.match(html, /id="settings-tabs"[^>]*role="tablist"/);
  for (const id of ['setting-font','setting-ui-font','setting-size','setting-ui-size','setting-syntax-theme','setting-icon-type','setting-hidden-files','setting-frame','setting-language']) {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1);
  }
  assert.match(css, /\.settings-pane\[hidden\] \{ display:none !important/);
  assert.match(js, /installSettingsTabs\(/);
  assert.match(js, /installSettingsDragging\(/);
});

test('Tab selection and keyboard navigation update ARIA and visible panels', async () => {
  const { installSettingsTabs } = await import('../src/settings-tabs.js');
  const ui = makeTabs();
  const changed = [];
  const controller = installSettingsTabs(ui.dialog, ui.tabs, { initial: 'themes', onChange: name => changed.push(name) });
  assert.equal(ui.buttons[1].attributes['aria-selected'], 'true');
  assert.equal(ui.panels.get('settings-pane-editor').hidden, true);
  assert.equal(ui.panels.get('settings-pane-themes').hidden, false);
  controller.select('explorer');
  assert.equal(ui.panels.get('settings-pane-explorer').hidden, false);
  assert.equal(ui.buttons[1].tabIndex, -1);
  assert.equal(ui.buttons[2].tabIndex, 0);
  let prevented = false;
  ui.handlers.keydown({ target: { closest: () => ui.buttons[2] }, key: 'ArrowRight', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(ui.panels.get('settings-pane-general').hidden, false);
  assert.equal(ui.buttons[3].focused, true);
  assert.deepEqual(changed, ['themes','explorer','general']);
});

test('Dragging is pointer-captured, bounded and resettable without dragging close control', async () => {
  const { installSettingsDragging } = await import('../src/settings-tabs.js');
  const handlers = {};
  const dialog = {style: {}, getBoundingClientRect() { return { left: 100, top: 100, right: 400, bottom: 400 }; }};
  const handle = { addEventListener(type, callback) { handlers[type] = callback; }, setPointerCapture(id) { this.captured = id; } };
  const drag = installSettingsDragging(dialog, handle);
  assert.equal(typeof drag.reset, 'function');
  const ignored = { button: 0, target: { closest() { return {}; } }, pointerId: 10,
    clientX: 120, clientY: 120, preventDefault() {} };
  handlers.pointerdown(ignored);
  assert.equal(handle.captured, undefined, 'title bar controls are not draggable');
  const originalWidth = global.innerWidth;
  const originalHeight = global.innerHeight;
  try {
    global.innerWidth = 800; global.innerHeight = 600;
    handlers.pointerdown({ ...ignored, target: { closest() { return null; } } });
    assert.equal(handle.captured, 10);
    handlers.pointermove({ pointerId: 10, clientX: 170, clientY: 180 });
    assert.match(dialog.style.transform, /translate3d\(50px, 60px, 0\)/);
    handlers.pointerup({ pointerId: 10 });
    drag.reset();
    assert.equal(dialog.style.transform, '');
  } finally { global.innerWidth = originalWidth; global.innerHeight = originalHeight; }
});

test('Sublime, VS Code and Pro palettes exist with both light and dark support', async () => {
  const { syntaxPalettes, syntaxThemeChoices } = await import('../src/syntax-themes.js');
  for (const id of ['sublime-mariana','sublime-monokai','sublime-celeste','sublime-breakers','vscode-dark-plus','vscode-light-plus','monokai-pro','mariana-pro-cool','mariana-pro-gray','mariana-pro-warm']) {
    assert.ok(syntaxPalettes[id], `${id} missing`);
    assert.ok(syntaxThemeChoices.some(x => x.id === id), `${id} not selectable`);
  }
  assert.equal(syntaxPalettes['vscode-dark-plus'].background, '#1e1e1e');
  assert.equal(syntaxPalettes['vscode-light-plus'].background, '#ffffff');
  assert.equal(syntaxPalettes['sublime-monokai'].background, '#272822');
});
