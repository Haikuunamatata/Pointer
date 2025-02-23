const { app, BrowserWindow } = require('electron');
const path = require('path');
const isDev = process.env.NODE_ENV !== 'production';

console.log('Electron app is starting...');

async function waitForViteServer() {
  const maxRetries = 10;
  const retryDelay = 1000;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      const response = await fetch('http://localhost:3000');
      if (response.ok) {
        console.log('Vite server is ready');
        return true;
      }
    } catch (err) {
      console.log('Waiting for Vite server...', retries + 1);
    }
    await new Promise(resolve => setTimeout(resolve, retryDelay));
    retries++;
  }
  return false;
}

async function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Load the app
  if (isDev) {
    // Wait for Vite server in development
    const serverReady = await waitForViteServer();
    if (!serverReady) {
      console.error('Failed to connect to Vite server');
      app.quit();
      return;
    }

    await mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Handle loading errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
    if (isDev) {
      // Retry loading in development
      setTimeout(() => {
        console.log('Retrying to load the app...');
        mainWindow.loadURL('http://localhost:3000');
      }, 1000);
    }
  });

  // Log any console messages from the renderer process
  mainWindow.webContents.on('console-message', (event, level, message) => {
    console.log('Renderer Console:', message);
  });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(async () => {
  console.log('Electron app is ready. Creating window...');
  if (isDev) {
    const session = require('electron').session;
    await session.defaultSession.clearCache();
    console.log('Cache cleared');
  }
  await createWindow();
});

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  console.log('All windows closed. Quitting app...');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  console.log('App activated. Checking for open windows...');
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
}); 