# Licensing and third-party notices

Jotta Edit's original code is licensed under GNU GPL version 2 or later
(`GPL-2.0-or-later`), as described in LICENSE. This does not replace the
licences or remove copyright notices of third-party components.

The application includes Monaco Editor, Emmet, Prettier, its PHP plugin,
Marked, DOMPurify, Rubik fonts, basic-ftp, ssh2-sftp-client, ssh2, smb3-client, webdav
and their runtime dependencies. These components retain their
original licences, including MIT, Apache-2.0, MPL-2.0 and OFL-1.1. Monaco's upstream
third-party notices include its bundled TypeScript tooling. Combined builds
that incorporate Apache-2.0 components use the GPLv3 compatibility option;
see licenses/GPL-3.0-or-later.txt.

Both frontend build commands generate public/licenses/THIRD-PARTY-NOTICES.txt
from the installed runtime packages' original licence and notice files,
including their transitive dependencies. These files are copied verbatim,
with package headings, into the desktop dist/licenses/ and web
web-dist/licenses/ directories. They must accompany redistributed builds.
The application licence and supplementary licence texts are included there too.

Desktop Electron distributions additionally retain LICENSE.electron.txt
and LICENSES.chromium.html alongside the executable. Keep those upstream
notices when redistributing the native application.

Only assets/linux/pt.jotta.edit.metainfo.xml (the Discover/AppStream metadata)
is licensed under CC0-1.0; see licenses/CC0-1.0.txt. This metadata licence does
not apply to the application code.

The GPL requires corresponding source availability when distributing covered
application builds. Distribute the applicable source and build scripts along
with, or through equivalent access alongside, the binaries. Third-party
licence notices alone do not replace that requirement.

Noto Color Emoji (Copyright 2013 Google LLC) is bundled in public/fonts/
under the SIL Open Font License 1.1. Its original notice and licence are in
licenses/NotoColorEmoji-OFL.txt and accompany desktop and web builds.

The @nodable/entities 3.1.0 npm package omits its licence file. Its upstream
MIT notice is preserved in licenses/nodable-entities-MIT.txt, from
https://github.com/nodable/val-parsers/blob/main/LICENSE, and included in generated notices.

byte-length 1.0.2 distributes its MIT declaration and author attribution only
in package.json; those original metadata are included in generated notices.
data-uri-to-buffer 4.0.1 embeds its complete MIT licence in README.md, which
is included verbatim when no standalone licence file is present.
