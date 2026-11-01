'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const pkg = require('../package.json');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('Flatpak sets X11 display selection BEFORE Electron starts (not appending a late switch)', () => {
  const f = pkg.build.flatpak;
  assert.equal(f.useWaylandFlags, false);
  for (const opt of ['--socket=x11','--env=XDG_SESSION_TYPE=x11','--env=WAYLAND_DISPLAY=','--env=WAYLAND_SOCKET='])
    assert.ok(f.finishArgs.includes(opt), `Missing ${opt}`);
  assert.ok(!f.finishArgs.includes('--socket=wayland'));
  assert.doesNotMatch(read('electron/main.cjs'), /^\s*app\.commandLine\.appendSwitch\('ozone-platform'/m);
  assert.match(read('scripts/repair-kde-open-with.sh'), /Exec=flatpak run pt\.jotta\.edit --ozone-platform=x11 %F/);
});

test('Colour editor follows the approved Jotta Edit mockup structure', () => {
  const source = read('src/color-picker.js');
  const css = read('src/color-picker.css');
  assert.match(source, /jc-preview-large/);
  assert.match(source, /jc-preview-caption/);
  assert.match(source, /jc-original/);
  assert.match(source, /jc-current/);
  assert.match(source, /jc-output/);
  assert.match(source, /jc-hue-value/);
  assert.match(source, /jc-opacity-value/);
  assert.match(source, /Preset Colors/);
  for (const format of ['hex','rgba','hsl','cmyk']) {
    assert.ok(source.includes(`data-format="${format}"`));
    assert.ok(source.includes(`data-panel="${format}"`));
  }
  const count = source.match(/const presets = \[(.+?)\];/)[1].split(',').length;
  assert.equal(count, 20);
  assert.match(css, /grid-template-columns:repeat\(10,minmax\(0,1fr\)\)/);
  assert.match(css, /background:var\(--surface\)/);
  assert.match(css, /border-bottom-color:var\(--accent\)/);
  assert.doesNotMatch(css, /backdrop-filter/);
});
