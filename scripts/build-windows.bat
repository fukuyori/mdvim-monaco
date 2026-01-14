@echo off
REM mdvim Windows Build Script
REM Requires: Node.js, Rust, Visual Studio Build Tools

echo === mdvim Windows Build Script ===
echo.

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

REM Clean previous build
if exist node_modules rmdir /s /q node_modules
if exist src-tauri\target rmdir /s /q src-tauri\target

REM Install npm dependencies
echo Installing npm dependencies...
call npm install
if %ERRORLEVEL% neq 0 (
    echo Error: npm install failed
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

pause
