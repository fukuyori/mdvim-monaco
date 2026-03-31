@echo off
setlocal
REM mdvim Windows Build Script
REM Requires: Node.js, Rust, Visual Studio Build Tools

echo === mdvim Windows Build Script ===
echo.

set CLEAN_BUILD=0

if /I "%~1"=="--clean" set CLEAN_BUILD=1
if /I "%~1"=="-c" set CLEAN_BUILD=1
if /I "%~1"=="--help" goto :help
if /I "%~1"=="-h" goto :help

REM Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo Error: Node.js not found
    echo Please install Node.js from https://nodejs.org/
    exit /b 1
)
echo Node.js: 
node --version

REM Check npm
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo Error: npm not found
    exit /b 1
)
echo npm:
npm --version

REM Check Rust
where cargo >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo Error: Rust not found
    echo Please install Rust from https://rustup.rs/
    exit /b 1
)
echo Rust:
rustc --version

echo.
echo === Building mdvim ===
echo.

REM Get script directory
set SCRIPT_DIR=%~dp0
set PROJECT_DIR=%SCRIPT_DIR%..

REM Change to project directory
cd /d "%PROJECT_DIR%"

REM Clean previous build if requested
if "%CLEAN_BUILD%"=="1" (
    echo Cleaning previous build artifacts...
    if exist node_modules rmdir /s /q node_modules
    if exist src-tauri\target rmdir /s /q src-tauri\target
)

REM Install npm dependencies from lockfile
echo Installing npm dependencies...
call npm ci
if %ERRORLEVEL% neq 0 (
    echo Error: npm ci failed
    exit /b 1
)

REM Build Tauri app
echo Building Tauri app...
call npm run tauri build
if %ERRORLEVEL% neq 0 (
    echo Error: Build failed
    exit /b 1
)

echo.
echo === Build Complete ===
echo.
echo Output files:
dir /b src-tauri\target\release\bundle\msi\*.msi 2>nul
dir /b src-tauri\target\release\bundle\nsis\*.exe 2>nul

echo.
echo To install, run the .msi or .exe file from:
echo   src-tauri\target\release\bundle\msi\
echo   src-tauri\target\release\bundle\nsis\
echo.
echo To run after installation:
echo   mdvim
echo   mdvim file.md
echo   mdvim -e

exit /b 0

:help
echo Usage: scripts\build-windows.bat [--clean]
echo.
echo   --clean    Remove node_modules and src-tauri\target before building
exit /b 0
