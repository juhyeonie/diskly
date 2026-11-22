import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Icon } from './icon.jsx';
import { AMBER, RED, GREEN, PAGES, fdate, driveView, buildCats } from './lib.js';
import { MotionConfig, LayoutGroup, AnimatePresence, motion } from 'motion/react';
import { usePresence, useLatest, Portal, spring, snappy, flick, instant, shouldDismiss } from './motion.jsx';
import { OverviewPage, DrivesPage, BreakdownPage, LargePage, SettingsPage, StatesPage } from './pages.jsx';

const NAV = [
  ['overview', 'Overview', 'LayoutDashboard'],
  ['drives', 'Drives', 'HardDrive'],
  ['breakdown', 'Storage Breakdown', 'PieChart'],
  ['large', 'Large Files', 'Files'],
  ['settings', 'Settings', 'Settings2']
];

const api = window.diskly;

export default function App() {
  const [page, setPage] = useState('overview');
  const [w, setW] = useState(window.innerWidth);
  const [info, setInfo] = useState({ host: '', os: '' });
  const [rawDrives, setRawDrives] = useState([]);
  const [drivesLoaded, setDrivesLoaded] = useState(false);
  const [scan, setScan] = useState(null);
  const [settings, setSettingsState] = useState({ warn: 75, crit: 90, showSys: true });
  const [prog, setProg] = useState(null); // {files, bytes, path}
  const [toast, setToast] = useState(null); // {msg, tone}
  const [drive, setDrive] = useState(null);
  const [cat, setCat] = useState(0);
  const [largeFocus, setLargeFocus] = useState(null);
  const toastT = useRef();
  const scrollRef = useRef(null);
  const [scrolled, setScrolled] = useState(false);
  const scanning = !!prog;

  const showToast = useCallback((msg, tone = 'ok') => {
    clearTimeout(toastT.current);
    setToast({ msg, tone });
    toastT.current = setTimeout(() => setToast(null), tone === 'error' ? 7000 : 4500);
  }, []);

  const toastRef = useRef(null);
  toastRef.current = toast;
  useEffect(() => {
    const onVis = () => {
      clearTimeout(toastT.current);
      if (!document.hidden && toastRef.current) toastT.current = setTimeout(() => setToast(null), 2500);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Compact-sidebar tooltip: waits on the first hover, then opens instantly while the user
  // sweeps across neighbouring icons.
  const [tip, setTip] = useState(null);
  const [tipInstant, setTipInstant] = useState(false);
  const tipT = useRef(); const tipOpen = useRef(false); const tipClosedAt = useRef(0);
  const showTip = useCallback((e, label, kbd) => {
    const r = e.currentTarget.getBoundingClientRect();
    const d = { label, kbd, top: r.top + r.height / 2 };
    clearTimeout(tipT.current);
    if (tipOpen.current || Date.now() - tipClosedAt.current < 300) { setTipInstant(true); tipOpen.current = true; setTip(d); }
    else { setTipInstant(false); tipT.current = setTimeout(() => { tipOpen.current = true; setTip(d); }, 450); }
  }, []);
  const hideTip = useCallback(() => {
    clearTimeout(tipT.current);
    if (tipOpen.current) tipClosedAt.current = Date.now();
    tipOpen.current = false;
    setTip(null);
  }, []);

  const loadDrives = useCallback(async () => {
    const d = await api.drives();
    setRawDrives(d);
    setDrivesLoaded(true);
    return d;
  }, []);

  useEffect(() => {
    const onR = () => setW(window.innerWidth);
    window.addEventListener('resize', onR);
    api.info().then(setInfo);
    api.getSettings().then(s => setSettingsState(s));
    api.loadScan().then(s => { if (s) setScan(s); });
    loadDrives();
    const off1 = api.onProgress(p => setProg(p));
    const off2 = api.onDone(r => {
      setProg(null);
      if (r.cancelled) { showToast('Scan cancelled. Your previous results are unchanged.'); return; }
      setScan(r);
      loadDrives();
      showToast(`Scan finished: ${r.files.toLocaleString()} files checked` + (r.skippedCount ? `, ${r.skippedCount} protected folders skipped.` : '.'));
    });
    const off3 = api.onError(e => { setProg(null); showToast('The scan stopped unexpectedly: ' + e, 'error'); });
    return () => { window.removeEventListener('resize', onR); off1(); off2(); off3(); };
  }, [loadDrives, showToast]);

  // Keyboard navigation moves the indicator instantly — it's repeated too often to animate.
  const [navInstant, setNavInstant] = useState(false);
  const go = useCallback((p, viaKey = false) => {
    setNavInstant(viaKey);
    setPage(p);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setScrolled(false);
  }, []);

  useEffect(() => {
    const onKey = e => {
      if (!e.ctrlKey || e.altKey || e.metaKey) return;
      const n = +e.key;
      if (n >= 1 && n <= NAV.length) { e.preventDefault(); go(NAV[n - 1][0], true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  const setSettings = useCallback(patch => {
    setSettingsState(s => { const n = { ...s, ...patch }; api.setSettings(n); return n; });
  }, []);

  const startScan = useCallback(async () => {
    if (scanning) return;
    const d = await loadDrives();
    const roots = d.filter(x => x.ok && x.kind !== 'network').map(x => x.root);
    if (!roots.length) { showToast('No local drives are available to scan.', 'error'); return; }
    setProg({ files: 0, bytes: 0, path: roots[0] });
    await api.startScan(roots);
  }, [scanning, loadDrives, showToast]);

  const drives = useMemo(() => rawDrives.map(d => driveView(d, settings)), [rawDrives, settings]);
  const okDrives = drives.filter(d => !d.offline);
  const cats = useMemo(() => buildCats(scan), [scan]);
  const selDrive = drives.find(d => d.id === drive) || drives[0];
  const alerts = okDrives.filter(d => d.isAlert);
  const worst = alerts.some(d => d.level === 'crit') ? RED : AMBER;

  const totalBytes = okDrives.reduce((a, d) => a + d.total, 0);
  const usedBytes = okDrives.reduce((a, d) => a + d.used, 0);
  const scanTarget = okDrives.filter(d => d.kind !== 'network').reduce((a, d) => a + d.used, 0);
  const scanPct = prog ? Math.min(99, Math.round((prog.bytes / Math.max(1, scanTarget)) * 100)) : 0;

  const bigFiles = useMemo(() => (scan ? scan.bigFiles.map(f => ({
    ...f, path: f.folder.replace(/[\\/]$/, '') + '\\' + f.name, drive: f.folder.slice(0, 2).toUpperCase()
  })) : []), [scan]);
  const [removed, setRemoved] = useState({});
  const files = useMemo(() => bigFiles.filter(f => !removed[f.path]), [bigFiles, removed]);
  const removeFiles = useCallback(paths => {
    setRemoved(r => { const n = { ...r }; paths.forEach(p => { n[p] = true; }); return n; });
    setScan(s => {
      if (!s) return s;
      const n = { ...s, bigFiles: s.bigFiles.filter(f => !paths.includes(f.folder.replace(/[\\/]$/, '') + '\\' + f.name)) };
      api.saveScan(n);
      return n;
    });
    loadDrives();
  }, [loadDrives]);

  const openFile = useCallback(p => { setLargeFocus(p); go('large'); }, [go]);


  const compact = w < 1100;
  const [tipMounted, tipState] = usePresence(!!tip && compact, tipInstant ? 0 : 125);
  const shownTip = useLatest(tip);
  useEffect(() => { if (!compact) hideTip(); }, [compact, hideTip]);
  const [pt, pd] = PAGES[page];
  const lastTxt = scan ? (new Date(scan.finishedAt).toDateString() === new Date().toDateString() ? 'today, ' : fdate(scan.finishedAt) + ', ') + new Date(scan.finishedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null;

  const ctx = {
    page, setPage: go, drives, okDrives, selDrive, setDrive, cats, cat, setCat, scan, settings, setSettings, totalBytes, usedBytes,
    files, removeFiles, startScan, scanning, prog, scanPct, showToast, compact, api, info, drivesLoaded, loadDrives,
    openFile, largeFocus, setLargeFocus
  };

  // The selection pill is one element that springs between items; keyboard jumps are instant.
  const navT = navInstant ? instant : spring;
  const navItem = (id, label, icon, kbd, badge = 0) => (
    <button key={id} className={'nav' + (page === id ? ' on' : '')} aria-label={compact ? label : undefined}
      onMouseEnter={compact ? e => showTip(e, label, kbd) : undefined} onMouseLeave={compact ? hideTip : undefined}
      aria-current={page === id ? 'page' : undefined} aria-keyshortcuts={kbd ? kbd.replace('Ctrl ', 'Control+') : undefined}
      onClick={() => { hideTip(); go(id); }}>
      {page === id && <motion.span layoutId="nav-pill" className="nav-pill" transition={navT} />}
      <span className="nav-icon" style={{ position: 'relative', display: 'flex', transition: 'color 150ms ease' }}>
        <Icon name={icon} />
        {compact && badge > 0 && <span style={{ position: 'absolute', right: -3, top: -2, width: 7, height: 7, borderRadius: '50%', background: worst, boxShadow: '0 0 0 1.5px var(--window)' }} />}
      </span>
      {!compact && <span>{label}</span>}
      {!compact && kbd && !badge && <kbd className="nav-kbd">{kbd}</kbd>}
      {!compact && badge > 0 && <span className="badge" title={`${badge} ${badge === 1 ? 'drive is' : 'drives are'} running low`} style={{ background: worst === RED ? 'var(--red-tint)' : 'rgba(232,173,82,0.13)', color: worst }}>{badge}</span>}
    </button>
  );

  // Toast: swipe right to dismiss, judged by where the flick is heading.
  const [swiped, setSwiped] = useState(false);
  const toastVariants = {
    hidden: { opacity: 0, y: 28, scale: 0.98 },
    shown: { opacity: 1, y: 0, x: 0, scale: 1, transition: spring },
    exit: sw => (sw ? { x: 460, opacity: 0, transition: flick } : { opacity: 0, y: 20, scale: 0.98, transition: snappy })
  };

  return (
    <MotionConfig reducedMotion="user">
    <div className="app" style={{ display: 'flex', height: '100vh', width: '100%', overflow: 'hidden' }}>
      <aside className="sidebar" style={{ width: compact ? 60 : 224 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 36, padding: '0 10px', marginBottom: 18 }}>
          <div aria-hidden style={{ width: 24, height: 24, borderRadius: 7, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', border: '2.5px solid #12142a' }} />
          </div>
          {!compact && <span className="t-title3" style={{ fontSize: 15 }}>Diskly</span>}
        </div>
        <LayoutGroup id="sidebar">
          <nav aria-label="Main" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {NAV.map(([id, label, icon], i) => navItem(id, label, icon, `Ctrl ${i + 1}`, id === 'drives' ? alerts.length : 0))}
          </nav>
          <div style={{ height: 1, background: 'var(--line)', margin: '14px 6px' }} />
          {navItem('states', 'States gallery', 'LayoutGrid')}
        </LayoutGroup>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, background: compact ? 'transparent' : 'rgba(255,255,255,0.03)' }} title={info.host}>
          <div style={{ position: 'relative', color: 'var(--text-2)', display: 'flex' }}>
            <Icon name="Monitor" />
            <span style={{ position: 'absolute', right: -3, bottom: -2, width: 7, height: 7, borderRadius: '50%', background: GREEN, boxShadow: '0 0 0 1.5px var(--window)' }} />
          </div>
          {!compact && (
            <div style={{ minWidth: 0 }}>
              <div className="t-cap ell" style={{ fontWeight: 600, color: 'var(--text)' }}>{info.host || 'This PC'}</div>
              <div className="t-cap faint">{info.os}</div>
            </div>
          )}
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
        <div ref={scrollRef} className="stage" onScroll={e => { const v = e.currentTarget.scrollTop > 4; if (v !== scrolled) setScrolled(v); }} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          <header className="chrome" data-scrolled={scrolled} style={{ padding: '14px 36px' }}>
            <div style={{ maxWidth: 1240, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 16, minHeight: 40, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <h1 className="t-title2" style={{ margin: 0 }}>{pt}</h1>
              <div className="t-sub mute">{pd}</div>
            </div>
            {scanning ? (
              <div role="status" aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 280 }}>
                <div className="t-cap mute" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span className="path" style={{ fontFamily: 'inherit', fontSize: 'inherit' }} title={prog.path}><bdi>{prog.path}</bdi></span>
                  <span className="num" style={{ color: 'var(--text)', whiteSpace: 'nowrap' }}>{prog.files.toLocaleString()} files · {scanPct}%</span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: '100%', transform: `scaleX(${scanPct / 100})`, transformOrigin: 'left center', background: 'var(--accent)', transition: 'transform 200ms linear' }} />
                </div>
              </div>
            ) : (
              <div className="t-cap faint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="Clock" size={13} /><span style={{ whiteSpace: 'nowrap' }}>{lastTxt ? 'Scanned ' + lastTxt : 'Not scanned yet'}</span>
              </div>
            )}
            <button className={'btn lg' + (scanning || scan ? '' : ' primary')} onClick={scanning ? () => api.cancelScan() : startScan}>
              <motion.span key={scanning ? 'stop' : scan ? 'rescan' : 'scan'} initial={{ opacity: 0.3, filter: 'blur(2px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} transition={{ duration: 0.2, ease: 'easeOut' }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name={scanning ? 'X' : scan ? 'RefreshCw' : 'ScanSearch'} size={13} sw={2} />{scanning ? 'Stop scan' : scan ? 'Rescan' : 'Scan drives'}
              </motion.span>
            </button>
            </div>
          </header>
          <div style={{ padding: '20px 36px 48px' }}>
            <div key={page} style={{ maxWidth: 1240, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28, minWidth: 0 }}>
              {page === 'overview' && <OverviewPage {...ctx} />}
              {page === 'drives' && <DrivesPage {...ctx} />}
              {page === 'breakdown' && <BreakdownPage {...ctx} />}
              {page === 'large' && <LargePage {...ctx} />}
              {page === 'settings' && <SettingsPage {...ctx} />}
              {page === 'states' && <StatesPage {...ctx} />}
            </div>
          </div>
        </div>
      </main>

      <div aria-live="polite" role="status" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{toast ? toast.msg : ''}</div>
      {tipMounted && shownTip && (
        <Portal>
          <div className="tip" role="presentation" data-state={tipState} data-instant={tipInstant} style={{ top: shownTip.top }}>
            {shownTip.label}{shownTip.kbd && <kbd style={{ fontSize: 11 }}>{shownTip.kbd}</kbd>}
          </div>
        </Portal>
      )}
      <AnimatePresence custom={swiped} onExitComplete={() => setSwiped(false)}>
        {toast && (
          <motion.div key={toast.msg + toast.tone} className="toast-wrap material" custom={swiped} variants={toastVariants} initial="hidden" animate="shown" exit="exit"
            drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={{ left: 0.06, right: 0.9 }}
            onDragStart={() => clearTimeout(toastT.current)}
            onDragEnd={(e, i) => {
              if (shouldDismiss(i.offset.x, i.velocity.x, 420)) { setSwiped(true); setToast(null); }
              else toastT.current = setTimeout(() => setToast(null), 2500);
            }}
            onMouseEnter={() => clearTimeout(toastT.current)} onMouseLeave={() => { toastT.current = setTimeout(() => setToast(null), 2500); }}
            style={{ display: 'flex', alignItems: 'flex-start', gap: 10, width: 400, maxWidth: 'calc(100vw - 40px)', padding: '12px 12px 12px 14px', cursor: 'grab', touchAction: 'pan-y' }}>
            <span style={{ color: toast.tone === 'error' ? RED : GREEN, display: 'flex', flexShrink: 0, marginTop: 1 }}><Icon name={toast.tone === 'error' ? 'AlertCircle' : 'CheckCircle2'} size={16} /></span>
            <span className="t-sub" style={{ flex: 1, textWrap: 'pretty', color: 'var(--text)' }}>{toast.msg}</span>
            <button className="btn ghost" aria-label="Dismiss" style={{ height: 22, width: 22, padding: 0, marginTop: -2 }} onPointerDownCapture={e => e.stopPropagation()} onClick={() => setToast(null)}><Icon name="X" size={13} /></button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </MotionConfig>
  );
}
