const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Authentification
    login: (credentials) => ipcRenderer.invoke('auth:login', credentials),

    // Sessions
    joinSession: (data) => ipcRenderer.invoke('session:join', data),

    // OS Actions — VS Code externe
    launchExternalIDE: (projectId) => ipcRenderer.invoke('os:launchExternalIDE', { projectId }),
    launchVSCode: (args) => ipcRenderer.invoke('os:launchVSCode', args),
    selectVSCodeExe: () => ipcRenderer.invoke('os:selectVSCodeExe'),

    // Monitoring
    getMonitoringStats: () => ipcRenderer.invoke('os:getMonitoringStats'),

    // code-server intégré
    codeServer: {
        start: (workspacePath, keepAlive) => ipcRenderer.invoke('codeserver:start', { workspacePath, keepAlive }),
        stop: () => ipcRenderer.invoke('codeserver:stop'),
        status: () => ipcRenderer.invoke('codeserver:status'),
    },

    // Listeners depuis le processus principal
    onDownloadProgress: (cb) => ipcRenderer.on('download-progress', (_e, v) => cb(v)),
    onCodeServerReady: (cb) => ipcRenderer.on('codeserver:ready', (_e, v) => cb(v)),
    onCodeServerError: (cb) => ipcRenderer.on('codeserver:error', (_e, v) => cb(v)),
    onCodeServerStopped: (cb) => ipcRenderer.on('codeserver:stopped', (_e, v) => cb(v)),

    // Gestion de la fenêtre
    setLocked: (locked) => ipcRenderer.invoke('window:setLocked', locked),
});
