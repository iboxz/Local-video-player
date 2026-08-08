const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  selectVideoFiles: () => ipcRenderer.invoke("select-video-files"),
  selectSubtitleFile: () => ipcRenderer.invoke("select-subtitle-file"),
  getInstalledFonts: () => ipcRenderer.invoke("get-installed-fonts"),
  loadStore: () => ipcRenderer.invoke("store-load"),
  saveStore: (data) => ipcRenderer.invoke("store-save", data),
  prepareVideo: (fileUrl, force) => ipcRenderer.invoke("prepare-video", fileUrl, force),
  onPrepareProgress: (cb) => ipcRenderer.on("prepare-progress", (_, data) => cb && cb(data)),
  onPrepareDone: (cb) => ipcRenderer.on("prepare-done", (_, data) => cb && cb(data)),
  onPrepareError: (cb) => ipcRenderer.on("prepare-error", (_, data) => cb && cb(data)),
  windowControl: {
    minimize: () => ipcRenderer.send("window-control", "minimize"),
    maximize: () => ipcRenderer.send("window-control", "maximize"),
    close: () => ipcRenderer.send("window-control", "close"),
  },
});
