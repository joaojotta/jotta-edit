# Licensing and third-party notices

Jotta Edit's original code is licensed under GNU GPL version 2 or later
(`GPL-2.0-or-later`), as described in LICENSE. This does not replace the
licences or remove copyright notices of third-party components.

The application includes Monaco Editor, Emmet, Prettier, its PHP plugin,
Rubik fonts and their runtime dependencies. These components retain their
original licences, including MIT, Apache-2.0 and OFL-1.1. Monaco's upstream
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
