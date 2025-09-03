const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  selectVideoFiles: () => ipcRenderer.invoke("select-video-files"),
  selectSubtitleFile: () => ipcRenderer.invoke("select-subtitle-file"),
  getInstalledFonts: () => ipcRenderer.invoke("get-installed-fonts"),
  loadStore: () => ipcRenderer.invoke("store-load"),
  saveStore: (data) => ipcRenderer.invoke("store-save", data),
  windowControl: {
    minimize: () => ipcRenderer.send("window-control", "minimize"),
    maximize: () => ipcRenderer.send("window-control", "maximize"),
    close: () => ipcRenderer.send("window-control", "close"),
  },
});
