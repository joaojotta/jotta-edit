'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const pkg = require('../package.json');
const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const { fileArguments } = require('../electron/launch-paths.cjs');

test('Flatpak starts through X11 backend, not forced Wayland/Vulkan path', () => {
  assert.equal(pkg.version, '1.1.6');
  assert.equal(pkg.build.flatpak.useWaylandFlags, false);
  assert.ok(pkg.build.flatpak.finishArgs.includes('--socket=x11'));
  assert.ok(!pkg.build.flatpak.finishArgs.includes('--socket=wayland'));
  assert.ok(pkg.build.flatpak.finishArgs.includes('--env=XDG_SESSION_TYPE=x11'));
  assert.ok(pkg.build.flatpak.finishArgs.includes('--env=WAYLAND_DISPLAY='));
  assert.ok(pkg.build.flatpak.finishArgs.includes('--env=WAYLAND_SOCKET='));
  // Chromium chooses its display platform before Electron's main script runs.
  assert.doesNotMatch(read('electron/main.cjs'), /^\s*app\.commandLine\.appendSwitch\('ozone-platform', 'x11'\)/m);
});
test('file CLI parser excludes binary argv[0], flags, folders, and supports encoded URLs', () => {
  const root = path.join(__dirname, 'fixtures');
  const input = path.join(root, 'space & amp.php');
  const options = {
    cwd: root,
    exists: (p) => p === '/app/bin/jotta-edit' || p === input || p === root,
    isFile: (p) => p !== root
  };
  const args = [pathToFileURL(input).href, '--ozone-platform=x11', '.', 'space & amp.php'];
  // app is responsible for stripping argv[0] before invoking the parser.
  assert.deepEqual(fileArguments(args, options), [input]);
  const main = read('electron/main.cjs');
  assert.match(main, /fileArguments\(process\.argv\.slice\(1\)\)/);
  assert.match(main, /fileArguments\(argv\.slice\(1\)\)/);
});
test('document opens only when renderer is ready, including second-instance events', () => {
  assert.match(read('electron/main.cjs'), /app:renderer-ready/);
  assert.match(read('electron/main.cjs'), /second-instance/);
  assert.match(read('electron/preload.cjs'), /rendererReady: \(\) => ipcRenderer\.send\('app:renderer-ready'\)/);
  assert.match(read('src/main.js'), /api\.rendererReady\(\)/);
});
test('hidden dialogs cannot intercept events and desktop repair has a usable Exec', () => {
  const css = read('src/style.css');
  assert.match(css, /\.jotta-modal-overlay\[aria-hidden="true"\].*pointer-events: none !important/);
  const script = read('scripts/repair-kde-open-with.sh');
  assert.match(script, /Exec=flatpak run pt\.jotta\.edit --ozone-platform=x11 %F/);
  assert.match(script, /StartupWMClass=pt\.jotta\.edit/);
  assert.match(script, /\.bak\./);
});
