// Worker thread: walks the given roots and aggregates sizes. Never modifies anything.
const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');

const { roots, minSize, topN } = workerData;
const MAX_DEPTH_KEEP = 6;
const CONCURRENCY = 24;

const EXT = {
  Video: 'mp4 mkv mov avi wmv webm m4v flv mpg mpeg',
  Audio: 'mp3 wav flac aac ogg m4a wma aiff',
  Image: 'jpg jpeg png gif bmp tif tiff psd raw cr2 nef arw dng heic webp svg ai',
  Archive: 'zip rar 7z tar gz bz2 xz tgz cab',
  'Disk image': 'iso vdi vmdk vhd vhdx img wim dmg qcow2',
  Installer: 'exe msi msix appx',
  Document: 'pdf doc docx xls xlsx ppt pptx txt csv md json xml odt rtf db sqlite'
};
const EXT_TYPE = {};
for (const [t, list] of Object.entries(EXT)) for (const e of list.split(' ')) EXT_TYPE[e] = t;
const SYSTEM_FILES = new Set(['pagefile.sys', 'hiberfil.sys', 'swapfile.sys']);

function fileType(name, ext) {
  if (SYSTEM_FILES.has(name.toLowerCase())) return 'System';
  return EXT_TYPE[ext] || 'Other';
}

function category(full, type) {
  const p = full.toLowerCase();
  if (type === 'System' || p.includes('\\windows\\') || p.includes('\\$recycle.bin') || p.includes('\\programdata\\')) return 'Other Files';
  if (p.includes('\\downloads\\')) return 'Downloads';
  if (p.includes('\\program files') || p.includes('\\steamapps\\') || p.includes('\\appdata\\local\\programs') || p.includes('\\windowsapps\\')) return 'Applications';
  if (type === 'Video') return 'Videos';
  if (type === 'Image') return 'Pictures';
  if (type === 'Document') return 'Documents';
  return 'Other Files';
}

const cats = {}; // name -> {size, dirs: Map}
const driveFolders = {}; // 'C:' -> {top: Map, deep: Map}
const driveUsed = {};
const big = [];
const skipped = new Map();
let files = 0;
let bytes = 0;
let cancelled = false;
let lastReport = 0;
let currentPath = '';

parentPort.on('message', m => { if (m === 'cancel') cancelled = true; });

function rolled(dir) {
  const parts = dir.split(path.sep);
  return parts.length > MAX_DEPTH_KEEP + 1 ? parts.slice(0, MAX_DEPTH_KEEP + 1).join(path.sep) : dir;
}

function add(map, key, n) { map.set(key, (map.get(key) || 0) + n); }

function record(dir, name, size, mtimeMs) {
  files++;
  bytes += size;
  const ext = path.extname(name).slice(1).toLowerCase();
  const type = fileType(name, ext);
  const full = dir + (dir.endsWith(path.sep) ? '' : path.sep) + name;
  const cat = category(full, type);
  const c = cats[cat] || (cats[cat] = { size: 0, dirs: new Map() });
  c.size += size;
  add(c.dirs, rolled(dir), size);
  const drive = dir.slice(0, 2).toUpperCase();
  const df = driveFolders[drive] || (driveFolders[drive] = { top: new Map(), deep: new Map() });
  driveUsed[drive] = (driveUsed[drive] || 0) + size;
  const parts = dir.split(path.sep);
  add(df.top, parts.length > 1 && parts[1] ? parts[1] : '(root files)', size);
  if (parts.length > 2) add(df.deep, parts.slice(0, 3).join(path.sep), size);
  if (size >= minSize) {
    big.push({ name, folder: dir, size, modified: mtimeMs, type });
    if (big.length > topN * 2) { big.sort((a, b) => b.size - a.size); big.length = topN; }
  }
}

function report(force) {
  const now = Date.now();
  if (!force && now - lastReport < 120) return;
  lastReport = now;
  parentPort.postMessage({ kind: 'progress', files, bytes, path: currentPath });
}

async function walk(root) {
  const stack = [root];
  while (stack.length && !cancelled) {
    const dir = stack.pop();
    currentPath = dir;
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (e) {
      if (e.code === 'EPERM' || e.code === 'EACCES') skipped.set(dir, true);
      continue;
    }
    const fileEntries = [];
    for (const en of entries) {
      if (en.isSymbolicLink()) continue;
      if (en.isDirectory()) stack.push(path.join(dir, en.name));
      else if (en.isFile()) fileEntries.push(en);
    }
    for (let i = 0; i < fileEntries.length && !cancelled; i += CONCURRENCY) {
      const batch = fileEntries.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async en => {
        try {
          const st = await fs.promises.lstat(path.join(dir, en.name));
          record(dir, en.name, st.size, st.mtimeMs);
        } catch (_) { /* file vanished or unreadable */ }
      }));
    }
    report(false);
  }
}

(async () => {
  const started = Date.now();
  // Scan roots in parallel (one per drive).
  await Promise.all(roots.map(r => walk(r)));
  big.sort((a, b) => b.size - a.size);
  const topFiles = big.slice(0, topN);
  const result = {
    finishedAt: Date.now(),
    durationMs: Date.now() - started,
    files,
    cancelled,
    cats: Object.fromEntries(Object.entries(cats).map(([k, v]) => [k, { size: v.size, dirs: [...v.dirs.entries()] }])),
    drives: Object.fromEntries(Object.entries(driveFolders).map(([k, v]) => [k, {
      used: driveUsed[k] || 0,
      top: [...v.top.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
      deep: [...v.deep.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    }])),
    bigFiles: topFiles,
    skipped: [...skipped.keys()].slice(0, 50),
    skippedCount: skipped.size
  };
  parentPort.postMessage({ kind: 'done', result });
})();
