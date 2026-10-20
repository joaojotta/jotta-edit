# Windows portable build review — Jotta Edit 1.0.2 Final Release

## Release format

- Windows target: electron-builder 26 `portable`, x64.
- Output: `release/Jotta-Edit-1.0.2-Windows-x64-Portable.exe`.
- **No installation required.** Copy the file to a Windows 10/11 x64 computer and double-click it. No Start Menu or system-wide installer changes are made.
- The program contains Electron, Monaco, fonts and app assets in one self-extracting executable. It temporarily extracts its runtime when launched. Windows may take a few seconds to unpack it, depending on storage and antivirus activity.
- Preferences are stored in the user's standard Windows profile. The executable itself is portable, but preferences do not automatically move with it.
- Windows app icon is bundled from `assets/icon.ico`. This unsigned executable may trigger a SmartScreen reputation warning.

## Build

Install Node.js 24 and Git. In PowerShell inside the `jotta-edit` directory:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-windows.ps1
```

The script checks Node, installs dependencies, checks syntax/configuration, runs tests and then builds the portable EXE. It refuses to claim success unless the expected output exists.

For manual builds, run `npm run dist:windows` after installing dependencies.

The GitHub Actions workflow publishes only the `*-Portable.exe` artifact from a Windows runner.

KDE Open With integration requires Bash and Flatpak, so that POSIX integration test is skipped on Windows. Windows still runs static checks of the KDE launcher command. This test compatibility adjustment does not change the `1.0.2` application version.

## Verify on Windows

1. Confirm `release/Jotta-Edit-1.0.2-Windows-x64-Portable.exe` exists and contains an application icon.
2. Copy **only that EXE** into a separate folder, then launch it without installation and without administrator privileges.
3. Open/save a file, reopen the application and check its settings persist under the user profile.
4. Check pt-PT and English, both themes, Explorer icons and zoom, colour controls, and native Open File/Folder dialogs.
5. Confirm the Windows build ran all tests and the output binary launches on a Windows system.

## Limitations

The source ZIP does **not** contain a prebuilt executable; this source packaging environment cannot verify an actual Windows GUI launch. The portable EXE still needs a Windows machine/runner to compile and test.
