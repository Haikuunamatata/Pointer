# Pointer Single-Terminal Startup Scripts

These scripts allow you to run all Pointer components in a single terminal.

## Features

- Starts all three required processes (backend, server, electron) from a single command
- Automatically checks if backend is already running
- Finds available ports if default ones are taken
- Can run in background mode to free up your terminal
- Cross-platform support (Windows, macOS, Linux)

## Usage

### Windows

```
# Interactive mode (keeps terminal open)
start-pointer.bat

# Background mode (frees up terminal)
start-pointer.bat --background
# or
start-pointer.bat -b
```

### macOS/Linux

```
# First make the script executable
chmod +x start-pointer.sh

# Interactive mode (keeps terminal open)
./start-pointer.sh

# Background mode (frees up terminal)
./start-pointer.sh --background
# or
./start-pointer.sh -b
```

### Using Node Directly

```
# Interactive mode
yarn dev

# Background mode
yarn dev --background
# or
yarn dev -b
```

## Logs

When running in background mode on macOS/Linux, logs are saved to `pointer.log` in the current directory.

## Troubleshooting

- If you encounter port conflicts, the script will automatically try to use different ports
- To stop all processes in interactive mode, press Ctrl+C
- To stop background processes, you'll need to find and kill them manually:
  - Windows: Use Task Manager
  - macOS/Linux: Use `ps aux | grep node` or `ps aux | grep electron` 