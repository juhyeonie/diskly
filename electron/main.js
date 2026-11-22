const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const { Worker } = require('worker_threads');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEV = !!process.env.DISKLY_DEV;
let win = null;
let worker = null;

const userFile = name => path.join(app.getPath('userData'), name);
function readJson(name, fallback) {
  try { return JSON.parse(fs.readFileSync(userFile(name), 'utf8')); } catch (_) { return fallback; }
}
function writeJson(name, data) {
  try { fs.writeFileSync(userFile(name), JSON.stringify(data)); } catch (_) { /* ignore */ }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 720, minHeight: 560,
    title: 'Diskly', autoHideMenuBar: true,
    backgroundColor: '#141414',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  if (DEV) win.loadURL('http://localhost:5173');
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  win.on('closed', () => { win = null; });
}

// ---------- drives ----------
function listDrivesWindows() {
  const ps = 'Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID,DriveType,Size,FreeSpace,VolumeName,FileSystem,ProviderName | ConvertTo-Json -Compress';
  return new Promise(resolve => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 20000 }, (err, stdout) => {
      if (err) return resolve([]);
      try {
        let rows = JSON.parse(stdout);
        if (!Array.isArray(rows)) rows = [rows];
        resolve(rows.filter(r => [2, 3, 4].includes(r.DriveType)).map(r => ({
          id: r.DeviceID.replace(':', ''),
          root: r.DeviceID + '\\',
          label: r.VolumeName || '',
          kind: r.DriveType === 2 ? 'removable' : r.DriveType === 4 ? 'network' : 'fixed',
          fs: r.FileSystem || '',
          path: r.ProviderName || '',
          total: r.Size || 0,
          free: r.FreeSpace || 0,
          ok: !!r.Size,
          system: (process.env.SystemDrive || 'C:').toUpperCase() === r.DeviceID.toUpperCase()
        })));
      } catch (_) { resolve([]); }
    });
  });
}

async function listDrivesOther() {
  try {
    const s = await fs.promises.statfs('/');
    return [{ id: '/', root: '/', label: 'Root', kind: 'fixed', fs: '', path: '/', total: s.blocks * s.bsize, free: s.bavail * s.bsize, ok: true, system: true }];
  } catch (_) { return []; }
}

ipcMain.handle('drives:list', () => (process.platform === 'win32' ? listDrivesWindows() : listDrivesOther()));

ipcMain.handle('app:info', () => ({
  host: os.hostname().toUpperCase(),
  os: process.platform === 'win32' ? 'Windows ' + (parseInt(os.release().split('.')[2], 10) >= 22000 ? '11' : '10') : os.type(),
  platform: process.platform,
  user: os.userInfo().username
}));

// ---------- scan ----------
ipcMain.handle('scan:load', () => readJson('scan.json', null));
ipcMain.handle('scan:save', (_e, data) => { writeJson('scan.json', data); return true; });

ipcMain.handle('scan:start', (_e, roots) => {
  if (worker) return false;
  worker = new Worker(path.join(__dirname, 'scanner.js'), { workerData: { roots, minSize: 100 * 1024 * 1024, topN: 1500 } });
  worker.on('message', m => {
    if (!win) return;
    if (m.kind === 'progress') win.webContents.send('scan:progress', m);
    else if (m.kind === 'done') {
      if (!m.result.cancelled) writeJson('scan.json', m.result);
      win.webContents.send('scan:done', m.result);
    }
  });
  worker.on('error', err => { if (win) win.webContents.send('scan:error', String(err)); });
  worker.on('exit', () => { worker = null; });
  return true;
});
ipcMain.handle('scan:cancel', () => { if (worker) worker.postMessage('cancel'); return true; });

// ---------- settings ----------
ipcMain.handle('settings:get', () => readJson('settings.json', { warn: 75, crit: 90, showSys: true }));
ipcMain.handle('settings:set', (_e, s) => { writeJson('settings.json', s); return true; });

// ---------- file actions ----------
function safeFull(p) {
  if (typeof p !== 'string' || !path.isAbsolute(p)) throw new Error('Invalid path');
  return path.normalize(p);
}
ipcMain.handle('file:reveal', (_e, p) => { shell.showItemInFolder(safeFull(p)); return true; });
ipcMain.handle('file:open-folder', (_e, p) => shell.openPath(safeFull(p)));

ipcMain.handle('file:delete', async (_e, items, permanent) => {
  const results = [];
  for (const p of items) {
    try {
      const full = safeFull(p);
      const base = path.basename(full).toLowerCase();
      if (['pagefile.sys', 'hiberfil.sys', 'swapfile.sys'].includes(base)) throw new Error('Protected system file');
      if (permanent) await fs.promises.rm(full, { force: false });
      else await shell.trashItem(full);
      results.push({ path: p, ok: true });
    } catch (e) {
      results.push({ path: p, ok: false, error: e.message });
    }
  }
  return results;
});

ipcMain.handle('file:move', async (_e, items) => {
  const r = await dialog.showOpenDialog(win, { title: 'Move to…', properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return { canceled: true, results: [] };
  const dest = r.filePaths[0];
  const results = [];
  for (const p of items) {
    try {
      const src = safeFull(p);
      const target = path.join(dest, path.basename(src));
      if (fs.existsSync(target)) throw new Error('A file with that name already exists there');
      try { await fs.promises.rename(src, target); }
      catch (e) {
        if (e.code !== 'EXDEV') throw e;
        await fs.promises.copyFile(src, target);
        await fs.promises.rm(src);
      }
      results.push({ path: p, ok: true, to: target });
    } catch (e) {
      results.push({ path: p, ok: false, error: e.message });
    }
  }
  return { canceled: false, dest, results };
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (worker) worker.terminate(); app.quit(); });
app.on('activate', () => { if (!win) createWindow(); });
