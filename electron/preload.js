const { contextBridge, ipcRenderer } = require('electron');

const on = (channel, cb) => {
  const h = (_e, data) => cb(data);
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.removeListener(channel, h);
};

contextBridge.exposeInMainWorld('diskly', {
  material: process.platform === 'win32' ? 'mica' : null,
  info: () => ipcRenderer.invoke('app:info'),
  drives: () => ipcRenderer.invoke('drives:list'),
  loadScan: () => ipcRenderer.invoke('scan:load'),
  saveScan: d => ipcRenderer.invoke('scan:save', d),
  startScan: roots => ipcRenderer.invoke('scan:start', roots),
  cancelScan: () => ipcRenderer.invoke('scan:cancel'),
  onProgress: cb => on('scan:progress', cb),
  onDone: cb => on('scan:done', cb),
  onError: cb => on('scan:error', cb),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: s => ipcRenderer.invoke('settings:set', s),
  reveal: p => ipcRenderer.invoke('file:reveal', p),
  del: (items, permanent) => ipcRenderer.invoke('file:delete', items, permanent),
  move: items => ipcRenderer.invoke('file:move', items)
});
