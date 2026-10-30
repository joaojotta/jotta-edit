# Build, run and test C/C++

The **desktop app** uses locally installed GCC/G++ or Clang, with optional CMake and Make support. Open **Tools → Build & Run** to see the output panel and expand **Build settings** to configure the current project. The browser edition cannot launch local compilers.

| Action | Default shortcut | Behavior |
| --- | --- | --- |
| Build C/C++ | F7 | Save changed project files and build. |
| Build and run C/C++ | F6 | Build, then run only if the build succeeds. |
| Test C/C++ | Ctrl+F6 | Build, then run CTest, the Make test target, or the single-file program. |
| Stop build or program | Shift+F6 | Stop the running process and its compiler/test children. |

These actions also appear in the command palette. Shortcuts can be changed in Preferences → Shortcuts. Hiding the output panel keeps the task running; Stop ends it. Reloading or closing the app stops active tasks.

## Install the tools

On Debian/Ubuntu, install the native toolchain in a terminal:

```sh
sudo apt install build-essential cmake
```

Use your distribution's equivalent packages on other Linux systems. For Clang, also install `clang`. Restart Jotta Edit after changing PATH.

On Windows, [MSYS2](https://www.msys2.org/) provides native GCC/G++, CMake and Make. Install the UCRT64 toolchain following its instructions, and make its binaries available on Jotta Edit's PATH (usually `C:\msys64\ucrt64\bin`). The Make integration invokes `mingw32-make` on Windows. For CMake, choose a generator matching the installed build tool, for example `-G "MinGW Makefiles"` in **CMake configure options**. The compiler is selected explicitly as GCC or Clang; MSVC is not a compiler option in this panel.

The Flatpak edition launches tools installed **on the host** using `flatpak-spawn --host`; it needs the existing `org.freedesktop.Flatpak` D-Bus permission. Linux host process management also uses `setsid`, `sh` and `kill`. Projects must be in folders visible to both the app and host tools, such as your home directory. Installing GCC only inside another sandbox does not make it available to the host.

GCC/G++, Clang, CMake and Make are external dependencies; they are not downloaded or bundled by Jotta Edit. See the [GCC manual](https://gcc.gnu.org/onlinedocs/gcc/Invoking-GCC.html), [CMake manual](https://cmake.org/cmake/help/latest/manual/cmake.1.html) and [CTest manual](https://cmake.org/cmake/help/latest/manual/ctest.1.html) for tool options.

## Automatic formatting

Install **clang-format 12 or newer** on PATH (Debian/Ubuntu: `sudo apt install clang-format`). In Flatpak, install it on the host. C/C++ supports **Format Document** (**Shift+Alt+F**) and **Format document when saving** in Preferences. Both format the current editor buffer, including unsaved edits, through the editor's normal undo and save handling.

The formatter inherits the project's `.clang-format` or `_clang-format` style, falling back to LLVM. The editor's indentation, tab width and formatting line width override those specific style options; an unlimited width uses `ColumnLimit: 0`. See the [clang-format documentation](https://clang.llvm.org/docs/ClangFormat.html). Missing tools and invalid style files are reported in the status bar.

## Single source files

Save and open a `.c`, `.cpp`, `.cc`, `.cxx` or `.C` file, then press **F6**. Auto-detect uses single-file mode when the project root has no `CMakeLists.txt` or Makefile. You can also select **Single file** explicitly.

C files use `gcc` with C17; C++ files use `g++` with C++17. Selecting Clang uses `clang` or `clang++`. Debug symbols and `-Wall -Wextra` are enabled. **Compiler options (single file)** accepts additional flags, such as `-O2`, `-std=c++20`, `-Iinclude` or `-lm`. Quoted paths are supported. A project with several source files should use CMake or Make to describe its sources, libraries and dependencies.

Executables are written into **build/jotta** by default, with a source-specific suffix to avoid filename collisions. Add that folder to your project's `.gitignore`. A failed compilation prevents execution of any previously built binary. **Test C/C++** in single-file mode runs the program and reports its exit status; it does not discover a separate test suite.

## CMake projects

Open the folder containing `CMakeLists.txt`. Auto-detect configures a Debug build in **build/jotta**, exports `compile_commands.json`, and builds with `cmake --build`. **Build target** can restrict the build to one target. **CMake configure options** accepts options such as `-DBUILD_TESTING=ON` or `-G Ninja`. Use a separate build directory when changing generators.

Tests use `ctest --test-dir build/jotta --build-config Debug --output-on-failure --no-tests=error`. The project must register tests with `enable_testing()` and `add_test()`; an empty test suite is reported as a failure. For example:

```cmake
cmake_minimum_required(VERSION 3.16)
project(hello LANGUAGES CXX)
enable_testing()
add_executable(hello main.cpp)
add_test(NAME hello_runs COMMAND hello)
```

To run an application, set **Executable path** relative to the project root, for example `build/jotta/hello`, `build/jotta/hello.exe`, or `build/jotta/Debug/hello.exe` for a multi-configuration generator. This is explicit because a project can have several executables.

## Make projects

Auto-detect recognizes `GNUmakefile`, `makefile` and `Makefile`. Builds run `make` in the project root, or `mingw32-make` on Windows, with the selected `CC`/`CXX` compiler. An empty **Build target** uses the default target. **Test C/C++** builds first and then invokes **Test target (Make)**, which defaults to `test`; set it to `check` if that is what the project uses.

Set **Executable path** to the program you want to run. Compiler and linker flags belong in the Makefile. The Makefile controls where its artifacts are created; the panel's **Build directory** setting applies to single-file and CMake builds.

## Output, input and settings

Drag the panel's top edge up or down to resize it. The height is remembered across sessions and constrained to the available window space. Focus the resize handle and use **Up/Down** for 20px steps or **Home/End** for minimum/maximum height. Double-click the handle to restore the default height. Fullscreen hides the resize handle and restores the saved height when you exit.

The panel streams stdout/stderr and reports exit codes. Click a GCC/Clang file/line error or warning to open that location within the project. Output is limited to 2 MB per task; the process continues after that limit. Clear output only clears the display.

Enable **Program output only** in the panel toolbar to hide compiler/build output, command lines, input echoes and editor completion messages. The console then shows only the program's stdout and stderr. Toggle it at any time to reveal the retained messages; the preference is saved across app restarts. Build/run status remains visible in the panel header, including failures.

Choose **Fullscreen output** to fill the screen with the console and its controls. Program input remains available. Press **Esc** or **Exit fullscreen** to return to the editor; hiding the panel also exits fullscreen without stopping the program.

Resize console text with **Ctrl+mouse wheel**, **Ctrl++ / Ctrl+-**, **Ctrl+0** to reset, or the panel's **A− / size / A+** controls. Keyboard shortcuts target the output panel when it has focus or the pointer is over it, and throughout fullscreen. Output and program-input text share a saved size from 10–72px (14px by default), independent of the editor and interface text.

**Program arguments** accepts quoted arguments, passed directly without shell expansion. During a single-file run, or a configured CMake/Make executable run, use **Send input** to submit a line and **End input** to close stdin. This is a line-oriented console, not a full terminal: programs requiring terminal control, curses or raw key events should be run in an external terminal. Programs with buffered output may need `fflush(stdout)` or an explicit C++ stream flush before an input prompt becomes visible.

Build settings are saved locally for each project folder. In a workspace with several folders, commands use the active file's folder; without an active file they use the primary folder. Unsaved named files in that project are saved through the editor's normal conflict checks before a build. A cancelled save or conflict stops the build. Save a new source file before compiling it. Files in connected remote folders must be copied to a local project first.

Only an explicit Build, Run or Test action executes project build scripts. Opening a project or the panel does not start a build. This support does not include a step debugger. Optional `clangd` completion remains available separately.
