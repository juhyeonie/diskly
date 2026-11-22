export const ACCENT = '#8f9bff', AMBER = '#e8ad52', RED = '#f2706a', GREEN = '#5fc795', NEUTRAL = '#b4b8c4';

export const TYPES = {
  Video: { i: 'FileVideo', c: 'oklch(0.76 0.11 340)' },
  Archive: { i: 'FileArchive', c: 'oklch(0.76 0.11 290)' },
  'Disk image': { i: 'Disc', c: 'oklch(0.76 0.11 250)' },
  Installer: { i: 'Package', c: 'oklch(0.76 0.11 195)' },
  Document: { i: 'FileText', c: 'oklch(0.76 0.11 220)' },
  Image: { i: 'FileImage', c: 'oklch(0.76 0.11 150)' },
  Audio: { i: 'FileAudio', c: 'oklch(0.76 0.11 270)' },
  System: { i: 'FileCog', c: '#8b8e97' },
  Other: { i: 'File', c: '#8b8e97' }
};

export const CAT_HUES = {
  Applications: 'oklch(0.72 0.11 268)',
  Documents: 'oklch(0.76 0.09 210)',
  Downloads: 'oklch(0.70 0.10 305)',
  Pictures: 'oklch(0.76 0.09 165)',
  Videos: 'oklch(0.74 0.09 350)',
  'Other Files': '#5d6068'
};
const CAT_ORDER = ['Applications', 'Documents', 'Downloads', 'Pictures', 'Videos', 'Other Files'];

const GB = 1024 ** 3;
export const fmt = b => {
  const g = b / GB;
  if (g >= 1000) return (g / 1024).toFixed(2) + ' TB';
  if (g >= 100) return Math.round(g) + ' GB';
  if (g >= 1) return g.toFixed(1) + ' GB';
  const mb = b / 1024 ** 2;
  if (mb >= 1) return Math.round(mb) + ' MB';
  return Math.round(b / 1024) + ' KB';
};
export const fmtGB = g => fmt(g * GB);
export const fdate = ms => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
export const tint = c => (c === RED ? 'rgba(242,112,106,0.1)' : c === AMBER ? 'rgba(232,173,82,0.1)' : 'rgba(255,255,255,0.05)');

export const PAGES = {
  overview: ['Overview', 'Storage capacity and free space across this PC'],
  drives: ['Drives', 'Capacity, usage and health for each drive'],
  breakdown: ['Storage Breakdown', 'What kinds of files use your space, and where they are'],
  large: ['Large Files', 'Find and review the biggest files on your drives'],
  settings: ['Settings', 'Warning thresholds and scan options'],
  states: ['States gallery', 'Loading, empty, error and success states used across Diskly']
};

export function driveView(d, settings) {
  const title = d.kind === 'network' ? `${d.label || 'Network'} (${d.id}:)` : `${d.label || 'Local Disk'} (${d.id}:)`;
  const typeLine = d.kind === 'network' ? 'Network drive' + (d.ok ? '' : ' · Disconnected')
    : d.kind === 'removable' ? 'Removable drive' : d.system ? 'Internal · System drive' : 'Internal drive';
  const icon = d.kind === 'network' ? 'Server' : d.kind === 'removable' ? 'Usb' : 'HardDrive';
  if (!d.ok) return { ...d, title, typeLine, icon, offline: true, color: '#6f727a' };
  const used = d.total - d.free;
  const pct = Math.round((used / d.total) * 100);
  const level = pct >= settings.crit ? 'crit' : pct >= settings.warn ? 'warn' : 'ok';
  const color = level === 'crit' ? RED : level === 'warn' ? AMBER : NEUTRAL;
  return {
    ...d, title, typeLine, icon, offline: false, used, pct, level, color, tint: tint(color), isAlert: level !== 'ok',
    pctColor: level === 'ok' ? '#8b8e97' : color,
    statusTxt: level === 'crit' ? 'Critically low' : level === 'warn' ? 'Running low' : 'used',
    alertTxt: level === 'crit' ? 'Critically low' : 'Running low',
    border: level === 'crit' ? 'rgba(242,112,106,0.28)' : 'rgba(255,255,255,0.06)',
    freeTxt: fmt(d.free), usedTxt: fmt(used), totalTxt: fmt(d.total)
  };
}

// Build a folder tree from [dir, bytes] entries, collapsing single-child chains.
export function buildTree(dirs) {
  const root = { name: '', size: 0, own: 0, kids: new Map() };
  for (const [dir, size] of dirs) {
    let n = root;
    n.size += size;
    for (const seg of dir.split('\\').filter(Boolean)) {
      let k = n.kids.get(seg);
      if (!k) { k = { name: seg, size: 0, own: 0, kids: new Map() }; n.kids.set(seg, k); }
      k.size += size;
      n = k;
    }
    n.own += size;
  }
  // `path` is the full folder path (for revealing in Explorer); `name` is what the row shows.
  const collapse = (n, parentPath) => {
    let node = n, name = n.name;
    while (node.kids.size === 1 && node.own === 0) {
      node = [...node.kids.values()][0];
      name += '\\' + node.name;
    }
    const path = parentPath ? parentPath + '\\' + name : name;
    const shown = /^[A-Za-z]:$/.test(name) ? name + '\\' : name;
    return { name: shown, path: /^[A-Za-z]:$/.test(path) ? path + '\\' : path, size: node.size, own: node.own, children: [...node.kids.values()].map(k => collapse(k, path)) };
  };
  return root.kids.size ? [...root.kids.values()].map(k => collapse(k, '')) : [];
}

export function buildCats(scan) {
  if (!scan) return [];
  const list = CAT_ORDER.filter(n => scan.cats[n]).map(n => ({
    name: n, hue: CAT_HUES[n], size: scan.cats[n].size, dirs: scan.cats[n].dirs
  }));
  return list;
}

export function relTime(ms) {
  const d = new Date(ms), now = new Date();
  const t = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return 'Today, ' + t;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
