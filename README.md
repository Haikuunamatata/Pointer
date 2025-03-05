# Pointer - Modern Code Editor

A modern code editor built with React, TypeScript, and Python, featuring AI assistance, integrated terminal, and a VS Code-like interface.

(This project will probably take a while. (please help me))

## Features

- 🎨 VS Code-like interface and theme

- 🤖 AI-powered code assistance
- 📁 File explorer with create/edit/delete capabilities
- 💻 Integrated terminal
- 📝 Monaco Editor with syntax highlighting
- 🔄 Real-time code synchronization
- 🎯 Multi-cursor support
- 📊 Split view support

## Prerequisites

- Node.js (v16 or higher)
- Python (v3.8 or higher)
- npm or yarn
- Git

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/f1shyondrugs/Pointer.git
cd pointer/App
```

### 2. Frontend Setup

Install the frontend dependencies:

```bash
npm install
# or
yarn install
```

### 3. Backend Setup

Create and activate a Python virtual environment _(optional)_:

```bash
# Windows
python -m venv venv
.\venv\Scripts\activate


# macOS/Linux
python3 -m venv venv
source venv/bin/activate
```

Install the Python dependencies:

```bash
pip install -r backend/requirements.txt
```

## Running the Application

### 1. Start the Backend Server

In a terminal window with the virtual environment activated:

```bash
cd backend
python run.py
```

The backend server will start on `http://localhost:8000`

### 2. Start the Frontend Development Server

In a new terminal window:

```bash
npm run dev
# or
yarn dev
```

The frontend development server will start on `http://localhost:3000`

## Usage

1. Open your browser and navigate to `http://localhost:3000`
2. Use the "Open Folder" button in the top bar to open a project directory
3. Use the file explorer on the left to navigate and edit files
4. Toggle the terminal using the terminal icon in the tab bar
5. Access AI assistance through the chat panel on the right

## Development

### Project Structure

```
pointer/App/
├── src/                    # Frontend source code
│   ├── components/         # React components
│   ├── services/          # API and service layers
│   ├── styles/            # CSS styles
│   └── utils/             # Utility functions
├── backend/               # Python backend
│   ├── file_server.py     # FastAPI server
│   └── requirements.txt   # Python dependencies
└── public/                # Static assets
```

### Environment Variables

Create a `.env` file in the root directory:

```env
VITE_API_URL=http://localhost:8000
```

## Troubleshooting

### Common Issues

1. **Backend Connection Error**
   - Ensure the Python backend is running on port 8000
   - Check if there are any CORS issues in the browser console
   - Verify the virtual environment is activated

2. **Frontend Build Issues**
   - Clear the node_modules folder and reinstall dependencies
   - Ensure all required dependencies are properly installed
   - Check for Node.js version compatibility

3. **Terminal Integration Issues**
   - On Windows, ensure you have Windows Terminal installed
   - On Linux/macOS, verify proper permissions for PTY access

### Error Messages

If you encounter the error "No directory opened", make sure to:
1. Click the "Open Folder" button in the top bar
2. Select a valid project directory
3. Wait for the file explorer to refresh

## Contributing

1. Fork the repository
2. Create a new branch (`git checkout -b feature/improvement`)
3. Make your changes
4. Commit your changes (`git commit -am 'Add new feature'`)
5. Push to the branch (`git push origin feature/improvement`)
6. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file of the repository for details.

## Acknowledgments

- Built with [React](https://reactjs.org/)
- Editor powered by [Monaco Editor](https://microsoft.github.io/monaco-editor/)
- Terminal integration using [xterm.js](https://xtermjs.org/)
- Backend powered by [FastAPI](https://fastapi.tiangolo.com/)


![works on my machine](https://blog.codinghorror.com/content/images/uploads/2007/03/6a0120a85dcdae970b0128776ff992970c-pi.png)
