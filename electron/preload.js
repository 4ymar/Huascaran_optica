const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    openPDF: (data) => ipcRenderer.invoke('open-pdf', data),
    openExternal: (url)        => ipcRenderer.invoke('open-external', url),
    saveCSV: (data) => ipcRenderer.invoke('save-csv', data),
    saveExcel: (data) => ipcRenderer.invoke('save-excel', data),
    savePDFDialog:(data) => ipcRenderer.invoke('save-pdf-dialog', data),
    selectImage:  ()     => ipcRenderer.invoke('select-image'),
    printTicket:  (data) => ipcRenderer.invoke('print-ticket', data),
    saveSupportZip: (data) => ipcRenderer.invoke('save-support-zip', data),
    appReady:     () => ipcRenderer.invoke('app-render-ready'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    logEvento:    (msg) => ipcRenderer.invoke('renderer-log', msg),
    isElectron:   true,
    windowControls: {
        minimize:       () => ipcRenderer.invoke('window-minimize'),
        maximizeToggle: () => ipcRenderer.invoke('window-maximize-toggle'),
        close:          () => ipcRenderer.invoke('window-close'),
        onMaximizedChange: (callback) => {
            const subscription = (event, isMaximized) => callback(isMaximized);
            ipcRenderer.on('window-maximized-change', subscription);
            return () => ipcRenderer.removeListener('window-maximized-change', subscription);
        }
    },
    updater: {
        check: () => ipcRenderer.invoke('updater:check'),
        checkForced:  () => ipcRenderer.invoke('updater:check-forced'),
        download: () => ipcRenderer.invoke('updater:download'),
        install: (options) => ipcRenderer.invoke('updater:install', options),
        onStatus: (callback) => {
            const subscription = (event, status) => callback(status);
            ipcRenderer.on('updater:status', subscription);
            return () => ipcRenderer.removeListener('updater:status', subscription);
        }
    }
}); 
