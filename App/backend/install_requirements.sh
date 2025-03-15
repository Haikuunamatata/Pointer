#!/bin/bash

# Detect operating system
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    echo "Detected macOS. Installing macOS requirements..."
    python3 -m pip install -r requirements_macos.txt
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    echo "Detected Linux. Installing Linux requirements..."
    python3 -m pip install -r requirements_linux.txt
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" || "$OSTYPE" == "cygwin" ]]; then
    # Windows
    echo "Detected Windows. Installing Windows requirements..."
    python -m pip install -r requirements_windows.txt
else
    # Unknown OS
    echo "Unknown operating system: $OSTYPE"
    echo "Please manually install the appropriate requirements file:"
    echo "- Windows: pip install -r requirements_windows.txt"
    echo "- macOS: pip install -r requirements_macos.txt"
    echo "- Linux: pip install -r requirements_linux.txt"
    exit 1
fi

echo "Requirements installation completed!"

# Install spaCy language model
echo "Installing spaCy English language model..."
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" || "$OSTYPE" == "cygwin" ]]; then
    python -m spacy download en_core_web_sm
else
    python3 -m spacy download en_core_web_sm
fi

echo "Setup completed! You can now run the application." 