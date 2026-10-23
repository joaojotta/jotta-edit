'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const projectRoot = path.resolve(__dirname, '..');
const script = path.join(projectRoot, 'scripts/repair-kde-open-with.sh');

// The functional test requires Bash and POSIX shell stubs, which are not
// provided by a standard Windows development environment. We can still
// validate the launcher contract on Windows without executing any shell code.
test('KDE desktop repair statically declares its launcher and opt-in default handler', () => {
  const source = fs.readFileSync(script, 'utf8');
  assert.match(source, /^Exec=flatpak run pt\.jotta\.edit --ozone-platform=x11 %F$/m);
  assert.match(source, /^MimeType=text\/plain;/m);
  assert.match(source, /\[\[ \$\{1:-\} == '--set-default' \]\]/);
  assert.match(source, /xdg-mime default "\$app_id\.desktop" text\/plain/);
});

test('KDE desktop repair writes a nonempty Flatpak Exec with file arguments and preserves default until asked', {
  skip: process.platform === 'win32' ? 'Bash/Flatpak integration is Linux-only; static checks still run on Windows' : false
}, () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jotta-open-with-test-'));
  try {
    const bin = path.join(temp, 'bin');
    const data = path.join(temp, 'share');
    fs.mkdirSync(bin);
    const commands = ['flatpak', 'xdg-mime', 'kbuildsycoca6', 'update-desktop-database'];
    for (const command of commands) {
      const output = command === 'xdg-mime' ? `#!/bin/sh\nprintf '%s\\n' "$*" >> '${path.join(temp,'mime-called')}'\n` : '#!/bin/sh\nexit 0\n';
      const target = path.join(bin,command);
      fs.writeFileSync(target,output, { mode: 0o755 });
    }
    const opts = { env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, XDG_DATA_HOME: data } };
    let result = spawnSync('bash', [script], { ...opts, encoding: 'utf8' });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    const entry = fs.readFileSync(path.join(data, 'applications/pt.jotta.edit.desktop'), 'utf8');
    assert.match(entry, /^Exec=flatpak run pt\.jotta\.edit --ozone-platform=x11 %F$/m);
    assert.match(entry, /^MimeType=text\/plain;/m);
    assert.ok(!fs.existsSync(path.join(temp, 'mime-called')), 'default handler must not be changed without approval');
    result = spawnSync('bash', [script, '--set-default'], { ...opts, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(fs.readFileSync(path.join(temp, 'mime-called'), 'utf8'), /default pt\.jotta\.edit\.desktop text\/plain/);
    assert.ok(fs.readdirSync(path.join(data, 'applications')).some(name => /^pt\.jotta\.edit\.desktop\.bak\./.test(name)));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('Flatpak installation refreshes the KDE Open With entry', () => {
  const install = fs.readFileSync(path.join(projectRoot, 'scripts/install-flatpak.sh'), 'utf8');
  assert.match(install, /\.\/scripts\/repair-kde-open-with\.sh/);
  assert.match(install, /--set-default/);
  const pkg = require('../package.json');
  assert.equal(pkg.version, '1.1.1');
});
