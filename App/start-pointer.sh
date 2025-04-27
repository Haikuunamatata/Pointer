#!/bin/bash

echo "Starting Pointer application..."

# Check if background mode is requested
BACKGROUND=""
if [ "$1" == "--background" ] || [ "$1" == "-b" ]; then
    BACKGROUND="--background"
    echo "Running in background mode..."
else
    echo "Running in interactive mode..."
fi

# Check if the required dependencies are installed
yarn install

# Start all processes
if [ -n "$BACKGROUND" ]; then
    # Run in background
    nohup node start-pointer.js --background > pointer.log 2>&1 &
    echo "Pointer started in background. Check pointer.log for output."
else
    # Run in foreground
    yarn dev $BACKGROUND
fi 