const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cupboxSerial', {
    connectAll: () => ipcRenderer.invoke('serial:connect-all'),
    connect: (role) => ipcRenderer.invoke('serial:connect', role),
    writeMain: (bytes) => ipcRenderer.invoke('serial:write-main', bytes),
    writeServo: (bytes) => ipcRenderer.invoke('serial:write-servo', bytes),
    listPorts: () => ipcRenderer.invoke('serial:list'),
    onData: (callback) => {
        ipcRenderer.on('serial:data', (_event, payload) => callback(payload));
    },
});
