@echo off
echo Starting Pointer application...

rem Check if background mode is requested
set BACKGROUND=
if "%1"=="--background" set BACKGROUND=--background
if "%1"=="-b" set BACKGROUND=--background

rem Check if the required dependencies are installed
call yarn install

rem Start all processes
if defined BACKGROUND (
    echo Running in background mode...
    start /b cmd /c "node start-pointer.js --background"
) else (
    echo Running in interactive mode...
    call yarn dev %BACKGROUND%
) 