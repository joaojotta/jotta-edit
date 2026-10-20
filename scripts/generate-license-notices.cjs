#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const pkg = require('../package.json');

function packageDirectory(name, from) {
  for (let current = from; ; current = path.dirname(current)) {
    const candidate = path.join(current, 'node_modules', name);
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
    if (path.dirname(current) === current) throw new Error(`Missing installed dependency: ${name}`);
  }
}
function generateLicenseNotices(output = path.join(root, 'public', 'licenses')) {
  const packages = new Map();
  function visit(name, from) {
    const dir = packageDirectory(name, from);
    if (packages.has(dir)) return;
    const metadata = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    const files = fs.readdirSync(dir, {withFileTypes:true})
      .filter(entry => entry.isFile() && (/^(?:licen[cs]e|copying|copyright)(?:[.-]|$)/i.test(entry.name) || /notice/i.test(entry.name)))
      .map(entry => entry.name).sort();
    if (!files.length) throw new Error(`Missing licence text for ${metadata.name}`);
    packages.set(dir, {dir, metadata, files});
    for (const dependency of Object.keys(metadata.dependencies || {})) visit(dependency, dir);
  }
  for (const name of Object.keys(pkg.dependencies)) visit(name, root);
  const sections = [...packages.values()].sort((a, b) => a.metadata.name.localeCompare(b.metadata.name))
    .map(({dir, metadata, files}) => {
      const heading = `${metadata.name}@${metadata.version} (${metadata.license || 'See notices below'})`;
      return heading + '\n' + '='.repeat(heading.length) + '\n\n' + files.map(file =>
        `--- ${file} ---\n\n${fs.readFileSync(path.join(dir, file), 'utf8')}`
      ).join('\n\n');
    });
  fs.mkdirSync(output, {recursive:true});
  fs.copyFileSync(path.join(root, 'LICENSE'), path.join(output, 'LICENSE.txt'));
  for (const file of ['GPL-3.0-or-later.txt', 'CC0-1.0.txt']) fs.copyFileSync(path.join(root, 'licenses', file), path.join(output, file));
  fs.writeFileSync(path.join(output, 'THIRD-PARTY-NOTICES.txt'),
    'Jotta Edit third-party software notices\n\nThird-party components retain the following copyright and licence notices.\n\n' + sections.join('\n\n'));
  return packages.size;
}
if (require.main === module) console.log(`Generated licence notices for ${generateLicenseNotices()} runtime packages.`);
module.exports = {generateLicenseNotices};
