#!/usr/bin/env node
'use strict';
// electron-builder 26.0.12 LinuxConfiguration whitelist, matching the installed schema.
// The older 26.0.12 release does not yet support linux.syncDesktopName.
const pkg = require('../package.json');
const supportedLinuxKeys = new Set(`appId artifactName asar asarUnpack category compression cscKeyPassword cscLink defaultArch description desktop detectUpdateChannel disableDefaultIgnoredFiles electronLanguages electronUpdaterCompatibility executableArgs executableName extraFiles extraResources fileAssociations files forceCodeSigning generateUpdatesFilesForAllChannels icon maintainer mimeTypes packageCategory protocols publish releaseInfo synopsis target vendor`.split(' '));
function validateBuildConfiguration(build) {
  const errors = [];
  if (!build || typeof build !== 'object') return ['Missing electron-builder configuration'];
  for (const field of Object.keys(build.linux || {})) {
    if (!supportedLinuxKeys.has(field)) errors.push(`Unsupported electron-builder 26.0.12 linux option: ${field}`);
  }
  if (build.appId !== 'pt.jotta.edit') errors.push('Expected application ID pt.jotta.edit');
  if (!Array.isArray(build.linux?.target) || !build.linux.target.includes('flatpak')) errors.push('Missing Flatpak target');
  return errors;
}
if (require.main === module) {
  const errors = validateBuildConfiguration(pkg.build);
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('Build configuration checked for electron-builder 26.0.12 (Linux options).');
}
module.exports = { validateBuildConfiguration };
