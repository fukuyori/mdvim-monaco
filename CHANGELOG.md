# Changelog

All notable changes to this project will be documented in this file.

## v1.1.0

### Added

- Added startup view mode flags:
  - `-e` starts in Editor mode
  - `-v` starts in Preview mode
  - `-s` starts in Split mode
- Added support for applying the startup view mode reliably from Tauri CLI arguments.
- Added `--clean` support to build scripts:
  - `scripts\build-windows.bat --clean`
  - `./scripts/build-macos.sh --clean`
  - `./scripts/build-linux.sh --clean`

### Changed

- Split mode remains the default startup mode when no view flag is specified.
- Build scripts now use `npm ci` instead of `npm install` for more reproducible builds.
- Build scripts no longer delete `node_modules` and build artifacts on every run by default.
- Windows build script no longer pauses at the end, making it easier to use in automation.
- Linux build script now clearly rejects unsupported distributions and documents Ubuntu/Debian support.
- Updated build and installer documentation to match the new script behavior.

### Fixed

- Fixed startup view mode flags not changing the initial UI mode as expected.
- Fixed CLI view mode overrides being lost when persisted settings were loaded after startup.

### Versioning

- Updated application version to `1.1.0` in frontend, Tauri, and Rust package metadata.
