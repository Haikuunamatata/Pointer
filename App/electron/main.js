const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const os = require('os');
const isDev = process.env.NODE_ENV !== 'production';

console.log('Electron app is starting...');

// Define icon path based on platform
const getIconPath = () => {
  const platform = os.platform();
  const logoPath = path.join(__dirname, 'logo.png');
  
  // On macOS, return the PNG file
  // On Windows and Linux, still use the PNG - electron-builder will use the correct icon from package.json
  return logoPath;
};

// Create a variable to hold the splash window
let splashWindow = null;

// Update splash screen message
function updateSplashMessage(message) {
  if (splashWindow) {
    splashWindow.webContents.executeJavaScript(`
      document.querySelector('.message').textContent = "${message}";
    `).catch(err => console.error('Error updating splash message:', err));
  }
}

function createSplashScreen() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 400,
    transparent: true,
    frame: false,
    resizable: false,
    icon: getIconPath(),
    skipTaskbar: true, // Hide from taskbar until main window is ready
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Load the splash screen HTML
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  
  // Prevent the splash screen from closing when clicked
  splashWindow.on('blur', () => {
    splashWindow.focus();
  });
}

// Check if the backend is running
async function checkBackendConnection() {
  const maxRetries = 10;
  const retryDelay = 1000;
  let retries = 0;

  updateSplashMessage('Connecting to backend...');
  
  while (retries < maxRetries) {
    try {
      const response = await fetch('http://127.0.0.1:23816/test-backend');
      if (response.ok) {
        const data = await response.json();
        console.log('Backend connection successful:', data.message);
        return true;
      }
    } catch (err) {
      console.log('Waiting for backend...', retries + 1);
    }
    
    updateSplashMessage(`Connecting to backend... (${retries + 1}/${maxRetries})`);
    await new Promise(resolve => setTimeout(resolve, retryDelay));
    retries++;
  }

  return false;
}

async function waitForViteServer() {
  const maxRetries = 10;
  const retryDelay = 1000;
  let retries = 0;

  updateSplashMessage('Starting development server...');

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
    
    updateSplashMessage(`Starting development server... (${retries + 1}/${maxRetries})`);
    await new Promise(resolve => setTimeout(resolve, retryDelay));
    retries++;
  }
  return false;
}

// Function to show and hide windows with timeout protection
function showMainWindow(mainWindow) {
  console.log('Main window ready to show, cleaning up splash screen');
  
  // Close the splash screen
  if (splashWindow) {
    try {
      splashWindow.destroy();
    } catch (err) {
      console.error('Error closing splash screen:', err);
    }
    splashWindow = null;
  }
  
  // Show main window
  try {
    mainWindow.show();
    console.log('Main window shown successfully');
  } catch (err) {
    console.error('Error showing main window:', err);
  }
}

async function createWindow() {
  // First check if backend is running
  const backendReady = await checkBackendConnection();
  if (!backendReady) {
    console.error('Failed to connect to backend');
    // Show error dialog
    if (splashWindow) {
      dialog.showErrorBox(
        'Connection Error',
        'Failed to connect to the backend. Please ensure the backend server is running.'
      );
      splashWindow.destroy();
    }
    app.quit();
    return;
  }
  
  updateSplashMessage('Loading application...');

  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false, // Don't show until fully loaded
    icon: getIconPath(), // Set application icon
    title: 'Pointer', // Set window title
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Set up window event listeners for debugging
  mainWindow.webContents.on('did-start-loading', () => {
    console.log('Main window did-start-loading');
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Main window did-finish-load');
  });

  mainWindow.webContents.on('dom-ready', () => {
    console.log('Main window dom-ready');
  });

  // Set the app user model ID for Windows
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.pointer');
  }

  // Set up a timeout fallback to show the window in case the ready-to-show event doesn't fire
  const windowShowTimeout = setTimeout(() => {
    console.log('Window show timeout reached, forcing display');
    showMainWindow(mainWindow);
  }, 10000); // 10 second fallback timeout

  // Once everything is loaded and rendered, show the main window and close the splash
  mainWindow.once('ready-to-show', () => {
    console.log('Main window ready-to-show event triggered');
    clearTimeout(windowShowTimeout); // Clear the timeout as we got the event
    showMainWindow(mainWindow);
  });

  // Load the app
  if (isDev) {
    // Wait for Vite server in development
    const serverReady = await waitForViteServer();
    if (!serverReady) {
      console.error('Failed to connect to Vite server');
      if (splashWindow) {
        dialog.showErrorBox(
          'Development Server Error',
          'Failed to connect to the development server. Please ensure "yarn start" is running.'
        );
        splashWindow.destroy();
      }
      app.quit();
      return;
    }

    updateSplashMessage('Loading development environment...');
    console.log('Loading development URL: http://localhost:3000');
    try {
      await mainWindow.loadURL('http://localhost:3000');
      console.log('Development URL loaded successfully');
    } catch (error) {
      console.error('Error loading development URL:', error);
      // Show the window anyway if we hit an error trying to load the URL
      showMainWindow(mainWindow);
    }
    
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  } else {
    updateSplashMessage('Loading application...');
    console.log('Loading application from dist folder');
    try {
      await mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
      console.log('Application loaded successfully from dist folder');
    } catch (error) {
      console.error('Error loading application from dist folder:', error);
      // Show the window anyway if we hit an error trying to load the file
      showMainWindow(mainWindow);
    }
  }

  // Handle loading errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
    if (isDev) {
      // Retry loading in development
      setTimeout(() => {
        console.log('Retrying to load the app...');
        mainWindow.loadURL('http://localhost:3000').catch(err => {
          console.error('Error retrying load:', err);
          // Force show the window even if we can't load it
          showMainWindow(mainWindow);
        });
      }, 1000);
    } else {
      // Force show the window even if we can't load it
      showMainWindow(mainWindow);
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
  
  // Create and show the splash screen
  createSplashScreen();
  
  if (isDev) {
    const session = require('electron').session;
    await session.defaultSession.clearCache();
    console.log('Cache cleared');
  }
  
  // Create the main window
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