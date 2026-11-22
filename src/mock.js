// Browser-only stand-in for the Electron preload API, so the renderer can be previewed with `npm run preview:web`.
// Never loaded inside Electron (window.diskly already exists there).
const GB = 1024 ** 3;
const day = 86400000;
const now = Date.now();

const drives = [
  { id: 'C', root: 'C:\\', label: 'Local Disk', kind: 'fixed', fs: 'NTFS', path: '', total: 475 * GB, free: 93 * GB, ok: true, system: true },
  { id: 'D', root: 'D:\\', label: 'Data', kind: 'fixed', fs: 'NTFS', path: '', total: 931 * GB, free: 521 * GB, ok: true, system: false },
  { id: 'E', root: 'E:\\', label: 'Backup', kind: 'removable', fs: 'exFAT', path: '', total: 238 * GB, free: 12 * GB, ok: true, system: false },
  { id: 'Z', root: 'Z:\\', label: 'NAS', kind: 'network', fs: '', path: '\\\\NAS-HOME\\share', total: 0, free: 0, ok: false, system: false }
];

const big = [
  ['Forza_Horizon_backup.zip', 'Archive', 'D:\\Backups', 38.2, 0],
  ['Ubuntu-24.04-dev.vdi', 'Disk image', 'D:\\VMs\\Ubuntu', 32.5, 80],
  ['Lightroom_Catalog_Backup.zip', 'Archive', 'E:\\Backups\\Lightroom', 24.7, 18],
  ['Q3_Project_Render_Final.mov', 'Video', 'D:\\Projects\\Client\\Renders', 21.6, 12],
  ['Family_Vacation_2025_4K.mp4', 'Video', 'D:\\Media\\Videos\\2025', 18.4, 400],
  ['RAW_Shoot_Lisbon.zip', 'Archive', 'D:\\Photos\\Archive', 14.1, 190],
  ['hiberfil.sys', 'System', 'C:\\', 12.7, 0],
  ['Game_Capture_2026-09-30.mkv', 'Video', 'C:\\Users\\Alex\\Videos\\Captures', 9.8, 50],
  ['pagefile.sys', 'System', 'C:\\', 8.0, 0],
  ['Win11_23H2_x64.iso', 'Disk image', 'C:\\Users\\Alex\\Downloads', 6.2, 66],
  ['Podcast_Masters_S2.wav', 'Audio', 'D:\\Media\\Audio\\Podcast', 4.9, 205],
  ['Thesis_Dataset.csv', 'Document', 'C:\\Users\\Alex\\Documents\\Research', 3.4, 245],
  ['Adobe_Premiere_Pro_Setup.exe', 'Installer', 'C:\\Users\\Alex\\Downloads', 2.3, 140],
  ['node_modules_backup.tar', 'Archive', 'C:\\Users\\Alex\\Projects', 1.6, 285],
  ['Pano_Dolomites.tif', 'Image', 'D:\\Photos\\2025\\Dolomites', 1.2, 445],
  ['IMG_Export_0412.psd', 'Image', 'C:\\Users\\Alex\\Pictures', 0.85, 220],
  ['Steam_Setup_Old.exe', 'Installer', 'D:\\Downloads', 0.6, 357]
].map(([name, type, folder, g, ago]) => ({ name, type, folder, size: g * GB, modified: now - ago * day }));

const dirs = list => list.map(([d, g]) => [d, g * GB]);
const scan = {
  finishedAt: now - 3600000,
  durationMs: 108000,
  files: 412880,
  cancelled: false,
  skippedCount: 3,
  skipped: ['C:\\System Volume Information', 'C:\\Windows\\CSC', 'C:\\Users\\Default\\AppData'],
  bigFiles: big,
  cats: {
    Applications: { dirs: dirs([['C:\\Program Files\\Adobe', 41], ['C:\\Program Files\\JetBrains', 9.8], ['C:\\Program Files\\Other apps', 67.2], ["D:\\SteamLibrary\\steamapps\\common\\Baldur's Gate 3", 93], ['D:\\SteamLibrary\\steamapps\\common\\Cyberpunk 2077', 71], ['C:\\Program Files (x86)\\Microsoft', 22]]) },
    Documents: { dirs: dirs([['C:\\Users\\Alex\\Documents\\Research', 11.2], ['C:\\Users\\Alex\\Documents\\Work', 9.6], ['C:\\Users\\Alex\\Documents\\Personal', 7.2], ['D:\\Projects\\Client', 15.1], ['D:\\Projects\\Side projects', 2.9]]) },
    Downloads: { dirs: dirs([['C:\\Users\\Alex\\Downloads', 74.5], ['C:\\Users\\Alex\\Downloads\\Installers', 21.5], ['D:\\Downloads', 32]]) },
    Pictures: { dirs: dirs([['D:\\Photos\\2025', 41], ['D:\\Photos\\2024', 23], ['D:\\Photos\\Archive', 14.1], ['C:\\Users\\Alex\\Pictures', 16]]) },
    Videos: { dirs: dirs([['D:\\Media\\Videos\\2025', 63], ['D:\\Media\\Videos\\2024', 51], ['D:\\Media\\Videos\\Clips', 28], ['D:\\Projects\\Client\\Renders', 58], ['C:\\Users\\Alex\\Videos\\Captures', 48]]) },
    'Other Files': { dirs: dirs([['E:\\Backups\\Machine images', 38.3], ['E:\\Backups\\Lightroom', 24.7], ['D:\\VMs\\Ubuntu', 32.5], ['D:\\VMs\\Windows Dev', 28.5], ['D:\\Backups', 38.2], ['C:\\Windows', 27.8]]) }
  },
  drives: {
    'C:': { top: dirs([['Users', 148], ['Program Files', 118], ['Windows', 31.4], ['Program Files (x86)', 22], ['(root files)', 20.7]]), deep: dirs([['C:\\Users\\Alex', 140], ['C:\\Program Files\\Adobe', 41], ['C:\\Windows\\WinSxS', 11.6]]) },
    'D:': { top: dirs([['SteamLibrary', 164], ['Media', 98], ['Photos', 62], ['VMs', 61], ['Projects', 25]]), deep: dirs([['D:\\SteamLibrary\\steamapps', 164], ['D:\\Media\\Videos', 142], ['D:\\Photos\\2025', 41], ['D:\\VMs\\Ubuntu', 32.5]]) },
    'E:': { top: dirs([['Backups', 168], ['Media archive', 46], ['Other', 12]]), deep: dirs([['E:\\Backups\\Machine images', 112], ['E:\\Backups\\Lightroom', 24.7]]) }
  }
};
for (const c of Object.values(scan.cats)) c.size = c.dirs.reduce((a, d) => a + d[1], 0);

let settings = { warn: 75, crit: 90, showSys: true };
const listeners = { progress: [], done: [], error: [] };
const sub = (k, cb) => { listeners[k].push(cb); return () => { listeners[k] = listeners[k].filter(x => x !== cb); }; };
let timer = null;

window.diskly = {
  info: async () => ({ host: 'ALEX-DESKTOP', os: 'Windows 11', platform: 'win32', user: 'alex' }),
  drives: async () => drives,
  loadScan: async () => (new URLSearchParams(location.search).has('empty') ? null : scan),
  saveScan: async () => true,
  startScan: async () => {
    const paths = ['C:\\Windows', 'C:\\Program Files', 'C:\\Users\\Alex', 'D:\\SteamLibrary', 'D:\\Media', 'E:\\Backups'];
    let bytes = 0, files = 0;
    const total = 1058 * GB;
    timer = setInterval(() => {
      bytes += total / 60; files += 6800;
      if (bytes >= total) { clearInterval(timer); listeners.done.forEach(f => f({ ...scan, finishedAt: Date.now() })); return; }
      listeners.progress.forEach(f => f({ files, bytes, path: paths[Math.floor((bytes / total) * paths.length)] }));
    }, 80);
    return true;
  },
  cancelScan: async () => { clearInterval(timer); listeners.done.forEach(f => f({ cancelled: true })); return true; },
  onProgress: cb => sub('progress', cb),
  onDone: cb => sub('done', cb),
  onError: cb => sub('error', cb),
  getSettings: async () => settings,
  setSettings: async s => { settings = s; return true; },
  reveal: async () => true,
  del: async items => items.map(p => ({ path: p, ok: true })),
  move: async items => ({ canceled: false, dest: 'D:\\Archive', results: items.map(p => ({ path: p, ok: true })) })
};
