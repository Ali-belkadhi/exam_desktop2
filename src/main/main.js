const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const setupIpcHandlers = require('./ipcHandlers');

// Allow webview to load local/code-server pages
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors');
app.commandLine.appendSwitch('ignore-certificate-errors');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 768,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,          // nécessaire pour <webview>
      webSecurity: false,        // permet le chargement de localhost:PORT dans webview
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/login.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  // Passer mainWindow aux handlers IPC (requis pour push events code-server)
  setupIpcHandlers(ipcMain, mainWindow);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
