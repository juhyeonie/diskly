import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'motion/react';
import { Icon } from './icon.jsx';
import { Portal, useLatest, spring, snappy, shouldDismiss, useModalBackdrop } from './motion.jsx';
import { ACCENT, AMBER, RED, GREEN, TYPES, fmt, fdate, buildTree } from './lib.js';

/* ------------------------------ shared ------------------------------ */
const typeOf = t => TYPES[t] || TYPES.Other;
const sorter = (key, dir) => (a, b) => {
  const x = a[key], y = b[key];
  return typeof x === 'string' ? x.localeCompare(y) * dir : (x - y) * dir;
};
const plural = (n, one, many = one + 's') => `${n.toLocaleString()} ${n === 1 ? one : many}`;
// Enter/Space activate a non-button element the same way a click does.
const activate = fn => e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };
const flexC = { display: 'flex', alignItems: 'center' };

function Path({ children, style, className = '' }) {
  return <span className={'path ' + className} title={children} style={style}><bdi>{children}</bdi></span>;
}

function FileIcon({ type, size = 14, box = 30 }) {
  const t = typeOf(type);
  return <span aria-hidden className="icon-tile" style={{ width: box, height: box, color: t.c }}><Icon name={t.i} size={size} sw={1.85} /></span>;
}

function Meter({ pct, color, h = 5 }) {
  return (
    <div role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} style={{ height: h, borderRadius: h / 2, background: 'rgba(255,255,255,0.07)', overflow: 'hidden', flex: '1 1 auto', minHeight: h }}>
      <div className="bar-fill" style={{ transform: `scaleX(${pct / 100})`, background: color }} />
    </div>
  );
}

/* Grouped section, Apple-style: the title sits outside the surface it names. */
function Section({ id, title, action, children, style }) {
  return (
    <section aria-labelledby={id} style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0, alignSelf: 'stretch', ...style }}>
      <div style={{ ...flexC, justifyContent: 'space-between', gap: 12, minHeight: 30 }}>
        <h2 id={id} className="t-title3">{title}</h2>{action}
      </div>
      {children}
    </section>
  );
}

/* Segmented control. The thumb is one element that springs between options. */
function Segmented({ id, label, options, value, onChange, tabs = false, lg = false }) {
  return (
    <div className={'seg' + (lg ? ' lg' : '')} role={tabs ? 'tablist' : 'radiogroup'} aria-label={label}>
      <LayoutGroup id={id}>
        {options.map(o => {
          const on = o.value === value;
          return (
            <button key={o.value} role={tabs ? 'tab' : 'radio'} {...(tabs ? { 'aria-selected': on } : { 'aria-checked': on })} onClick={() => onChange(o.value)}>
              {on && <motion.span layoutId="thumb" className="seg-thumb" transition={spring} />}
              {o.content || o.label}
            </button>
          );
        })}
      </LayoutGroup>
    </div>
  );
}

function Switch({ checked, onChange, labelledBy }) {
  return (
    <button className="switch" role="switch" aria-checked={checked} aria-labelledby={labelledBy} onClick={() => onChange(!checked)} style={{ justifyContent: checked ? 'flex-end' : 'flex-start' }}>
      <motion.span layout transition={spring} className="switch-knob" />
    </button>
  );
}

function SortHeader({ cols, sortKey, dir, onSort }) {
  return cols.map(c => (
    <button key={c[0]} className="th t-cap" onClick={() => onSort(c[0])} aria-sort={sortKey === c[0] ? (dir > 0 ? 'ascending' : 'descending') : 'none'}
      style={{ ...flexC, gap: 4, border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap', justifyContent: c[2], color: sortKey === c[0] ? 'var(--text)' : 'var(--text-2)' }}>
      {c[1]}{sortKey === c[0] && <span style={{ color: ACCENT, display: 'flex' }}><Icon name={dir > 0 ? 'ArrowUp' : 'ArrowDown'} size={11} sw={2.25} /></span>}
    </button>
  ));
}

const useSort = (initial = 'size') => {
  const [sortKey, setSortKey] = useState(initial);
  const [dir, setDir] = useState(-1);
  const onSort = key => { if (sortKey === key) setDir(-dir); else { setSortKey(key); setDir(key === 'size' || key === 'modified' ? -1 : 1); } };
  return { sortKey, dir, onSort };
};

/* Empty state that teaches: what this area shows, and the one action that fills it. */
function NoScan({ startScan, scanning, prog, title, text }) {
  if (scanning) {
    return (
      <div style={{ padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
        <span style={{ color: ACCENT, display: 'flex' }}><Icon name="Loader2" size={22} className="spin" style={{ animation: 'dk-spin 0.7s linear infinite' }} /></span>
        <div className="t-head">Scanning your drives…</div>
        <div className="t-sub mute num">{prog ? plural(prog.files, 'file') + ' checked so far' : 'Starting'}. Results appear here when it finishes.</div>
      </div>
    );
  }
  return (
    <div style={{ padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
      <div className="icon-tile" style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--accent-tint)', color: ACCENT, marginBottom: 6 }}><Icon name="ScanSearch" size={19} /></div>
      <div className="t-head">{title}</div>
      <div className="t-sub mute" style={{ maxWidth: 340, textWrap: 'pretty' }}>{text}</div>
      <button className="btn primary lg" style={{ marginTop: 10 }} onClick={startScan}><Icon name="ScanSearch" size={13} />Scan drives</button>
      <div className="t-cap faint" style={{ marginTop: 2 }}>Read-only. Nothing is changed or uploaded.</div>
    </div>
  );
}

/* One clear next step when a drive is filling up. */
function Callout({ d, onAct, actLabel }) {
  const crit = d.level === 'crit';
  return (
    <div style={{ ...flexC, gap: 12, padding: '12px 18px 12px 20px', background: crit ? 'rgba(242,112,106,0.08)' : 'rgba(232,173,82,0.07)', borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
      <span style={{ color: d.color, display: 'flex' }}><Icon name="AlertTriangle" size={16} sw={2} /></span>
      <span className="t-sub" style={{ flex: 1, minWidth: 220 }}><b style={{ fontWeight: 600 }}>{d.title} is {crit ? 'critically low' : 'running low'}.</b> <span className="mute">{d.freeTxt} left, {d.pct}% full.</span></span>
      <button className="btn" onClick={onAct}><Icon name="Files" size={13} />{actLabel}</button>
    </div>
  );
}

/* ------------------------------ Overview ------------------------------ */
// Drive rows rise in only the first time they appear in a session; after that they're just there.
let rowsArrived = false;

export function OverviewPage({ drives, okDrives, totalBytes, usedBytes, cats, scan, files, settings, setPage, setDrive, setCat, startScan, scanning, prog, drivesLoaded, loadDrives, openFile, showToast }) {
  const [stagger] = useState(() => !rowsArrived);
  useEffect(() => { if (drivesLoaded) rowsArrived = true; }, [drivesLoaded]);
  const free = totalBytes - usedBytes;
  const usedPct = totalBytes ? Math.round((usedBytes / totalBytes) * 100) : 0;
  const offline = drives.length - okDrives.length;
  const worst = okDrives.filter(d => d.isAlert).sort((a, b) => b.pct - a.pct)[0];
  const palette = ['#8f9bff', '#7280e6', '#5b66c2', '#474f9a'];
  const segs = okDrives.map((d, i) => ({ id: d.id, name: d.title, usedTxt: d.usedTxt, w: totalBytes ? (d.used / totalBytes) * 100 : 0, color: d.isAlert ? d.color : palette[i % palette.length] }));
  const top = files.filter(f => settings.showSys || f.type !== 'System').sort((a, b) => b.size - a.size).slice(0, 6);
  const catTotal = cats.reduce((a, c) => a + c.size, 0);
  const retry = async () => { const d = await loadDrives(); const bad = d.some(x => !x.ok); showToast(bad ? 'Still unable to reach the network drive. Check the connection and sign-in.' : 'Network drive reconnected.', bad ? 'error' : 'ok'); };
  const rise = i => (stagger ? { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { ...spring, delay: 0.05 + i * 0.04 } } : {});
  const openDrive = id => { setDrive(id); setPage('drives'); };

  return (
    <>
      <section aria-label="Storage on this PC" className="group" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '30px 30px 24px', display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px 24px', flexWrap: 'wrap' }}>
            <div>
              <div className="t-label">Available on this PC</div>
              {drivesLoaded ? (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
                  <span className="t-display">{fmt(free)}</span>
                  <span className="t-title3 mute" style={{ fontWeight: 500 }}>free of {fmt(totalBytes)}</span>
                </div>
              ) : <div className="skel" style={{ height: 56, width: 300, marginTop: 10 }} />}
            </div>
            <div className="t-sub mute num" style={{ paddingBottom: 6 }}>{usedPct}% used · {plural(okDrives.length, 'drive')}{offline ? ` · ${offline} offline` : ''}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', height: 12, borderRadius: 6, background: 'rgba(255,255,255,0.07)', overflow: 'hidden', gap: 2 }}>
              {segs.map(g => <div key={g.id} title={`${g.name} · ${g.usedTxt} used`} style={{ width: g.w + '%', background: g.color }} />)}
            </div>
            <div className="t-cap mute" style={{ ...flexC, gap: '6px 18px', flexWrap: 'wrap' }}>
              {segs.map(g => <span key={g.id} style={{ ...flexC, gap: 6, whiteSpace: 'nowrap' }}><span style={{ width: 8, height: 8, borderRadius: 3, background: g.color }} />{g.name}<span className="num" style={{ color: 'var(--text)' }}>{g.usedTxt}</span></span>)}
              <span style={{ ...flexC, gap: 6, whiteSpace: 'nowrap' }}><span style={{ width: 8, height: 8, borderRadius: 3, background: 'rgba(255,255,255,0.14)' }} />Free<span className="num" style={{ color: 'var(--text)' }}>{fmt(free)}</span></span>
            </div>
          </div>
        </div>
        {worst && <Callout d={worst} onAct={() => setPage('large')} actLabel="Free up space" />}
        <div style={{ borderTop: '1px solid var(--line)', '--inset-l': '66px' }}>
          {!drivesLoaded && [0, 1, 2].map(i => <div key={i} className="lrow" style={{ minHeight: 62 }}><div className="skel" style={{ width: 34, height: 34 }} /><div className="skel" style={{ height: 14, width: 180 }} /><div className="skel" style={{ height: 5, flex: 1 }} /></div>)}
          {drives.map((d, i) => d.offline ? (
            <motion.div key={d.id} className="lrow" style={{ minHeight: 62 }} {...rise(i)}>
              <span className="icon-tile" style={{ width: 34, height: 34, background: 'transparent', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)', color: 'var(--text-3)' }}><Icon name="ServerOff" size={16} /></span>
              <div style={{ flex: '0 1 230px', minWidth: 0 }}><div className="t-head ell" style={{ color: 'var(--text-soft)' }}>{d.title}</div><div className="t-cap faint ell">Not reachable · <bdi style={{ fontFamily: 'var(--mono)' }}>{d.path || d.root}</bdi></div></div>
              <div style={{ flex: 1 }} />
              <button className="btn" onClick={retry}><Icon name="RefreshCw" size={12} />Try again</button>
              <button className="btn ghost" onClick={() => openDrive(d.id)}>Details</button>
            </motion.div>
          ) : (
            <motion.button key={d.id} className="lrow" style={{ minHeight: 62 }} {...rise(i)} onClick={() => openDrive(d.id)}
              aria-label={`${d.title}: ${d.freeTxt} free of ${d.totalTxt}, ${d.pct}% used${d.isAlert ? ', ' + d.alertTxt : ''}`}>
              <span className="icon-tile" style={{ width: 34, height: 34, color: 'var(--text-soft)' }}><Icon name={d.icon} size={16} /></span>
              <div style={{ flex: '0 1 230px', minWidth: 0 }}><div className="t-head ell">{d.title}</div><div className="t-cap faint ell">{d.typeLine}</div></div>
              <div style={{ flex: 1, minWidth: 60, ...flexC }}><Meter pct={d.pct} color={d.color} h={6} /></div>
              <div style={{ width: 120, textAlign: 'right' }}><div className="t-head num">{d.freeTxt} <span className="mute" style={{ fontWeight: 400 }}>free</span></div><div className="t-cap num" style={{ color: d.pctColor }}>{d.pct}% · {d.statusTxt}</div></div>
              <span className="faint" style={{ display: 'flex' }}><Icon name="ChevronRight" size={15} /></span>
            </motion.button>
          ))}
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(400px,100%),1fr))', gap: 28, alignItems: 'stretch' }}>
        <Section id="h-largest" title="Largest files" action={scan && <button className="btn link" onClick={() => setPage('large')}>Show all<Icon name="ChevronRight" size={13} /></button>}>
          <div className="group" style={{ '--inset-l': '62px', flex: 1, display: 'flex', flexDirection: 'column' }}>
            {!scan && <NoScan startScan={startScan} scanning={scanning} prog={prog} title="Find the files taking up the most space" text="A scan lists every file of 100 MB or more across your local drives, biggest first." />}
            {top.map(f => (
              <div key={f.path} role="button" tabIndex={0} className="lrow click" style={{ minHeight: 54, flex: 1 }} onClick={() => openFile(f.path)} onKeyDown={activate(() => openFile(f.path))}>
                <FileIcon type={f.type} />
                <div style={{ flex: 1, minWidth: 0 }}><div className="t-body ell">{f.name}</div><Path className="faint">{f.folder}</Path></div>
                <span className="t-head num" style={{ whiteSpace: 'nowrap' }}>{fmt(f.size)}</span>
                <span className="faint" style={{ display: 'flex' }}><Icon name="ChevronRight" size={15} /></span>
              </div>
            ))}
            {scan && top.length === 0 && <div className="t-sub mute" style={{ padding: 28, textAlign: 'center' }}>No files of 100 MB or more were found.</div>}
          </div>
        </Section>

          <Section id="h-using" title="What's using space" action={scan && <span className="t-sub mute num">{fmt(catTotal)}</span>}>
            <div className="group" style={{ overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
              {!scan ? <NoScan startScan={startScan} scanning={scanning} prog={prog} title="See space by file type" text="Apps, videos, downloads and more, each with the folders behind them." /> : (
                <>
                  <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2, margin: '16px 18px 6px' }}>
                    {cats.map(c => <div key={c.name} title={`${c.name} · ${fmt(c.size)}`} style={{ width: (c.size / catTotal) * 100 + '%', background: c.hue }} />)}
                  </div>
                  <div style={{ '--inset-l': '38px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                    {cats.map((c, i) => (
                      <button key={c.name} className="lrow" style={{ minHeight: 40, flex: 1 }} onClick={() => { setCat(i); setPage('breakdown'); }}>
                        <span style={{ width: 9, height: 9, borderRadius: 3, background: c.hue, flexShrink: 0 }} />
                        <span className="t-body ell" style={{ flex: 1 }}>{c.name}</span>
                        <span className="t-body num">{fmt(c.size)}</span>
                        <span className="t-cap faint num" style={{ width: 40, textAlign: 'right' }}>{Math.round((c.size / catTotal) * 1000) / 10}%</span>
                        <span className="faint" style={{ display: 'flex' }}><Icon name="ChevronRight" size={14} /></span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </Section>
      </div>
    </>
  );
}

/* ------------------------------- Drives ------------------------------- */
export function DrivesPage({ drives, selDrive: sd, setDrive, scan, startScan, scanning, prog, showToast, api, loadDrives, drivesLoaded, setPage }) {
  if (!drivesLoaded) return <section className="group" style={{ padding: 28 }}><div className="skel" style={{ height: 34, width: 320, marginBottom: 20 }} /><div className="skel" style={{ height: 160 }} /></section>;
  if (!sd) return <section className="group t-sub mute" style={{ padding: 40, textAlign: 'center' }}>No drives were found on this PC.</section>;
  const sc = scan && scan.drives[sd.id + ':'];
  const folders = sc ? sc.top.map(([n, s]) => ({ name: n, size: s })) : [];
  const maxF = folders[0] ? folders[0].size : 1;
  const props = [['Volume label', sd.label || '—'], ['File system', sd.fs || '—'], ['Type', sd.kind === 'network' ? 'Network' : sd.kind === 'removable' ? 'Removable' : 'Fixed disk'], ['Root', sd.root]];
  const retry = async () => { const d = await loadDrives(); const now = d.find(x => x.id === sd.id); showToast(now && now.ok ? `${sd.title} reconnected.` : `Still unable to reach ${sd.path || sd.root}.`, now && now.ok ? 'ok' : 'error'); };

  return (
    <>
      <div style={{ overflowX: 'auto', margin: '-4px', padding: 4 }}>
        <Segmented id="drive-tabs" label="Drives" tabs lg value={sd.id} onChange={setDrive}
          options={drives.map(d => ({ value: d.id, content: <><span style={{ width: 7, height: 7, borderRadius: '50%', background: d.color }} />{d.title}<span className="faint num" style={{ fontWeight: 400 }}>{d.offline ? 'Offline' : d.freeTxt}</span></> }))} />
      </div>

      {sd.offline ? (
        <section className="group" style={{ padding: '64px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 8 }}>
          <div className="icon-tile" style={{ width: 46, height: 46, borderRadius: 13, background: 'var(--red-tint)', color: RED, marginBottom: 8 }}><Icon name="ServerOff" size={20} /></div>
          <h2 className="t-title3">{sd.title} can't be reached</h2>
          <div className="t-sub mute" style={{ maxWidth: 420, textWrap: 'pretty' }}>Diskly couldn't connect to <bdi style={{ fontFamily: 'var(--mono)', color: 'var(--text-soft)' }}>{sd.path || sd.root}</bdi>. Check that the network location is online and that you're signed in, then try again.</div>
          <button className="btn lg" style={{ marginTop: 12 }} onClick={retry}><Icon name="RefreshCw" size={13} />Try again</button>
        </section>
      ) : (
        <>
          <section aria-label={`${sd.title} capacity`} className="group" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '28px 30px', display: 'flex', flexDirection: 'column', gap: 22 }}>
              <div style={{ ...flexC, gap: 14 }}>
                <span className="icon-tile" style={{ width: 44, height: 44, borderRadius: 12, color: 'var(--text-soft)' }}><Icon name={sd.icon} size={21} /></span>
                <div style={{ flex: 1, minWidth: 0 }}><div className="t-title3 ell">{sd.title}</div><div className="t-sub faint">{sd.typeLine}</div></div>
                {sd.isAlert && <span className="t-cap" style={{ ...flexC, gap: 5, fontWeight: 600, color: sd.color, background: sd.tint, borderRadius: 7, padding: '4px 9px', whiteSpace: 'nowrap' }}><Icon name="AlertTriangle" size={12} sw={2} />{sd.alertTxt}</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}><span className="t-display" style={{ fontSize: '3rem' }}>{sd.freeTxt}</span><span className="t-title3 mute" style={{ fontWeight: 500 }}>free of {sd.totalTxt}</span></div>
                <span className="t-title3 num" style={{ color: sd.pctColor }}>{sd.pct}% used</span>
              </div>
              <Meter pct={sd.pct} color={sd.color} h={10} />
              <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 16 }}>
                {[['Used', sd.usedTxt], ['Free', sd.freeTxt], ['Capacity', sd.totalTxt]].map(c => (
                  <div key={c[0]}><dt className="t-label">{c[0]}</dt><dd className="t-title3 num" style={{ margin: '4px 0 0' }}>{c[1]}</dd></div>
                ))}
              </dl>
            </div>
            {sd.isAlert && <Callout d={sd} onAct={() => setPage('large')} actLabel="Review large files" />}
          </section>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(380px,100%),1fr))', gap: 28, alignItems: 'start' }}>
            <Section id="h-folders" title="Top-level folders">
              <div className="group" style={{ '--inset-l': '46px' }}>
                {!sc && <NoScan startScan={startScan} scanning={scanning} prog={prog} title="See which folders fill this drive" text="Scan to measure every top-level folder on this drive." />}
                {folders.map(fo => (
                  <div key={fo.name} className="lrow" style={{ minHeight: 50, flexWrap: 'wrap', gap: '4px 12px', padding: '9px 18px' }}>
                    <span className="mute" style={{ display: 'flex', width: 16 }}><Icon name="Folder" size={15} /></span>
                    <span className="t-body ell" style={{ flex: 1, minWidth: 0 }}>{fo.name}</span>
                    <span className="num" style={{ whiteSpace: 'nowrap' }}><span className="t-head">{fmt(fo.size)}</span><span className="t-cap faint"> · {Math.round((fo.size / sd.used) * 100)}%</span></span>
                    <div style={{ flexBasis: '100%', paddingLeft: 28, display: 'flex' }}><Meter pct={(fo.size / maxF) * 100} color={ACCENT} h={3} /></div>
                  </div>
                ))}
              </div>
            </Section>
            <Section id="h-details" title="Details">
              <dl className="group" style={{ margin: 0 }}>
                {props.map(p => <div key={p[0]} className="lrow" style={{ justifyContent: 'space-between' }}><dt className="t-body mute">{p[0]}</dt><dd className="t-body" style={{ margin: 0 }}>{p[1]}</dd></div>)}
                <div className="lrow" style={{ justifyContent: 'space-between', alignItems: 'flex-start', padding: '13px 18px', gap: 24 }}><dt className="t-body mute">Health</dt><dd className="t-sub faint" style={{ margin: 0, textAlign: 'right', maxWidth: 260 }}>Not reported. Diskly reads capacity only, not SMART data.</dd></div>
              </dl>
            </Section>
          </div>

          {sc && sc.deep.length > 0 && (
            <Section id="h-large-folders" title="Largest folders" action={<span className="t-cap faint">Opens in File Explorer</span>}>
              <div className="group" style={{ '--inset-l': '46px' }}>
                {sc.deep.map(([p, s]) => (
                  <button key={p} className="lrow" onClick={() => api.reveal(p)}>
                    <span className="faint" style={{ display: 'flex', width: 16 }}><Icon name="FolderOpen" size={15} /></span>
                    <Path style={{ flex: 1, minWidth: 0, color: 'var(--text-soft)' }}>{p}</Path>
                    <span className="t-head num">{fmt(s)}</span>
                    <span className="faint" style={{ display: 'flex' }}><Icon name="ExternalLink" size={13} /></span>
                  </button>
                ))}
              </div>
            </Section>
          )}
        </>
      )}
    </>
  );
}

/* ----------------------------- Breakdown ----------------------------- */
export function BreakdownPage({ cats, cat, setCat, scan, startScan, scanning, prog, api, compact }) {
  const [path, setPath] = useState([]);
  const [sortBy, setSortBy] = useState('size');
  const c = cats[Math.min(cat, cats.length - 1)];
  const tree = useMemo(() => (c ? { name: c.name, size: c.size, children: buildTree(c.dirs) } : null), [c]);
  if (!scan || !c) return <section className="group"><NoScan startScan={startScan} scanning={scanning} prog={prog} title="See what kinds of files use your space" text="A scan sorts everything into apps, documents, downloads, pictures, videos and other files, and shows the folders behind each." /></section>;
  const total = cats.reduce((a, x) => a + x.size, 0);
  let node = tree;
  const crumbs = [{ label: c.name, depth: 0 }];
  path.forEach((ix, k) => { node = node.children[ix]; crumbs.push({ label: node.name.split('\\').filter(Boolean).pop() || node.name, depth: k + 1 }); });
  const kids = (node.children || []).map((n, ix) => ({ n, ix })).sort((a, b) => sortBy === 'size' ? b.n.size - a.n.size : a.n.name.localeCompare(b.n.name));
  const maxKid = Math.max(1, ...kids.map(k => k.n.size));
  const pick = i => { setCat(i); setPath([]); };

  return (
    <>
      <section className="group" style={{ padding: '28px 30px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <div className="t-label">Scanned</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginTop: 8 }}><span className="t-display" style={{ fontSize: '2.75rem' }}>{fmt(total)}</span><span className="t-title3 mute" style={{ fontWeight: 500 }}>in {cats.length} categories</span></div>
        </div>
        <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', gap: 2 }}>
          {cats.map((x, i) => <button key={x.name} onClick={() => pick(i)} aria-label={`${x.name}, ${fmt(x.size)}`} title={`${x.name} · ${fmt(x.size)}`} style={{ width: (x.size / total) * 100 + '%', background: x.hue, opacity: x === c ? 1 : 0.35, cursor: 'pointer', border: 'none', padding: 0, transition: 'opacity 200ms ease' }} />)}
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: compact ? 'minmax(0,1fr)' : 'minmax(230px,270px) minmax(0,1fr)', gap: 28, alignItems: 'start' }}>
        <Section id="h-cats" title="Categories" style={{ position: compact ? 'static' : 'sticky', top: 84 }}>
          <div className="group" style={{ padding: 6 }}>
            <LayoutGroup id="cats">
              {cats.map((x, i) => {
                const on = x === c;
                return (
                  <button key={x.name} aria-pressed={on} onClick={() => pick(i)} style={{ position: 'relative', isolation: 'isolate', ...flexC, gap: 10, width: '100%', height: 40, padding: '0 12px', border: 'none', background: 'transparent', borderRadius: 9, cursor: 'pointer', textAlign: 'left' }}>
                    {on && <motion.span layoutId="cat-pill" transition={spring} style={{ position: 'absolute', inset: 0, borderRadius: 9, background: 'rgba(255,255,255,0.07)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)', zIndex: -1 }} />}
                    <span style={{ width: 9, height: 9, borderRadius: 3, background: x.hue, flexShrink: 0 }} />
                    <span className="t-body" style={{ flex: 1, fontWeight: on ? 600 : 400 }}>{x.name}</span>
                    <span className="t-sub num" style={{ color: on ? 'var(--text)' : 'var(--text-2)' }}>{fmt(x.size)}</span>
                  </button>
                );
              })}
            </LayoutGroup>
          </div>
        </Section>

        <Section id="h-folders" title="Folders" action={<Segmented id="sort" label="Sort folders" value={sortBy} onChange={setSortBy} options={[{ value: 'size', label: 'Size' }, { value: 'name', label: 'Name' }]} />}>
        <div aria-label={`${c.name} folders`} className="group" style={{ overflow: 'hidden', minWidth: 0 }}>
          <div style={{ ...flexC, gap: 12, padding: '8px 12px', minHeight: 48, borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
            <nav aria-label="Folder path" style={{ ...flexC, gap: 2, flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
              {path.length > 0 && <button className="btn ghost icon" aria-label="Up one level" style={{ height: 28, width: 28 }} onClick={() => setPath(path.slice(0, -1))}><Icon name="ArrowLeft" size={15} /></button>}
              {crumbs.map((b, i) => (
                <span key={i} style={{ ...flexC, gap: 2 }}>
                  {i > 0 && <span className="faint" style={{ display: 'flex' }}><Icon name="ChevronRight" size={13} /></span>}
                  <button className="btn ghost" aria-current={i === crumbs.length - 1 ? 'location' : undefined} onClick={() => setPath(path.slice(0, b.depth))}
                    style={{ height: 28, padding: '0 8px', color: i === crumbs.length - 1 ? 'var(--text)' : undefined, fontWeight: i === crumbs.length - 1 ? 600 : 400 }}>{b.label}</button>
                </span>
              ))}
            </nav>
          </div>
          <div style={{ '--inset-l': '46px' }}>
            {kids.slice(0, 200).map(({ n, ix }) => {
              const drill = n.children.length > 0;
              const open = () => (drill ? setPath([...path, ix]) : api.reveal(n.path));
              return (
                <div key={n.path} role="button" tabIndex={0} className="lrow click" onClick={open} onKeyDown={activate(open)} title={drill ? `Open ${n.name}` : `Show ${n.path} in File Explorer`} style={{ minHeight: 48 }}>
                  <span className="mute" style={{ display: 'flex', width: 16, flexShrink: 0 }}><Icon name={drill ? 'Folder' : 'FolderOpen'} size={15} /></span>
                  <bdi title={n.path} className="t-body ell" style={{ flex: 1, minWidth: 0 }}>{n.name}</bdi>
                  <div style={{ width: 'clamp(60px,18%,160px)', display: 'flex' }}><Meter pct={(n.size / maxKid) * 100} color={c.hue} h={4} /></div>
                  <span className="t-head num" style={{ width: 72, textAlign: 'right' }}>{fmt(n.size)}</span>
                  <span className="t-cap faint num" style={{ width: 44, textAlign: 'right' }}>{Math.round((n.size / c.size) * 1000) / 10}%</span>
                  <span className="faint" style={{ display: 'flex', width: 15, justifyContent: 'flex-end' }}><Icon name={drill ? 'ChevronRight' : 'ExternalLink'} size={drill ? 15 : 12} /></span>
                </div>
              );
            })}
            {kids.length === 0 && <div className="t-sub mute" style={{ padding: 32, textAlign: 'center' }}>No subfolders here.</div>}
          </div>
        </div>
        </Section>
      </div>
    </>
  );
}

/* ------------------------------- Large ------------------------------- */
const MIN_STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 20];
const PANEL_W = 336;

/*
 * Irreversible action, so it asks for intent: the fill wipes across slowly and linearly while
 * held, and snaps back fast on release. On completion the label turns into a check before the
 * delete runs, so the moment of commitment is visible. Pointer or Space/Enter held down.
 */
function HoldButton({ onConfirm, children, ms = 1500 }) {
  const [holding, setHolding] = useState(false);
  const [done, setDone] = useState(false);
  const t = useRef();
  const confirmRef = useRef(onConfirm); confirmRef.current = onConfirm;
  const start = () => {
    if (done) return;
    clearTimeout(t.current); setHolding(true);
    t.current = setTimeout(() => { setHolding(false); setDone(true); t.current = setTimeout(() => confirmRef.current(), 320); }, ms);
  };
  const stop = () => { if (done) return; clearTimeout(t.current); setHolding(false); };
  useEffect(() => () => clearTimeout(t.current), []);
  return (
    <button type="button" className="btn lg hold" data-holding={holding} data-done={done} style={{ '--hold': ms + 'ms', minWidth: 148 }}
      aria-label="Delete permanently. Press and hold to confirm."
      onPointerDown={e => { if (e.button === 0) { e.currentTarget.setPointerCapture(e.pointerId); start(); } }}
      onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}
      onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); start(); } }}
      onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') stop(); }}
      onBlur={stop} onClick={e => e.preventDefault()}>
      <span className="hold-fill" aria-hidden />
      <AnimatePresence mode="popLayout" initial={false}>
        {done ? (
          <motion.span key="done" className="label" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', bounce: 0.35, duration: 0.35 }}><Icon name="Check" size={15} sw={2.5} />Deleting</motion.span>
        ) : (
          <motion.span key="hold" className="label" exit={{ opacity: 0, scale: 0.9 }} transition={snappy}>{children}</motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

export function LargePage({ files, settings, removeFiles, startScan, scanning, prog, scan, showToast, api, compact, largeFocus: focus, setLargeFocus: setFocus }) {
  const [q, setQ] = useState('');
  const [minIdx, setMinIdx] = useState(() => {
    const f = files.find(x => x.path === focus);
    const ok = MIN_STEPS.map((s, i) => [s, i]).filter(([s]) => !f || s * 1024 ** 3 <= f.size);
    return Math.min(3, ok.length ? ok[ok.length - 1][1] : 0);
  });
  const [types, setTypes] = useState([]);
  const { sortKey, dir, onSort } = useSort();
  const [sel, setSel] = useState({});
  const [confirm, setConfirm] = useState(false);
  const [mode, setMode] = useState('recycle');
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef(null);
  const focusRowRef = useRef(null);
  useModalBackdrop(confirm);

  const pool = files.filter(f => settings.showSys || f.type !== 'System');
  const minB = MIN_STEPS[minIdx] * 1024 ** 3;
  const lq = q.toLowerCase();
  const sizeOk = pool.filter(f => f.size >= minB && (!lq || f.name.toLowerCase().includes(lq) || f.folder.toLowerCase().includes(lq)));
  const list = sizeOk.filter(f => !types.length || types.includes(f.type)).sort(sorter(sortKey, dir));
  const present = Object.keys(TYPES).filter(t => pool.some(f => f.type === t));
  const selFiles = files.filter(f => sel[f.path]);
  const selSize = selFiles.reduce((a, f) => a + f.size, 0);
  const hasSys = selFiles.some(f => f.type === 'System');
  const allChecked = list.length > 0 && list.every(f => sel[f.path]);
  const someChecked = !allChecked && list.some(f => sel[f.path]);
  const ff = files.find(f => f.path === focus);
  const dlg = useLatest(confirm ? { files: selFiles, size: selSize } : null);
  const grid = '18px minmax(0,2.2fr) 84px minmax(0,1.8fr) 76px 96px';
  const cols = [['name', 'Name', 'flex-start'], ['type', 'Type', 'flex-start'], ['folder', 'Folder', 'flex-start'], ['size', 'Size', 'flex-end'], ['modified', 'Modified', 'flex-end']];
  const chips = [{ label: 'All types', count: sizeOk.length, active: !types.length, icon: null, click: () => setTypes([]) },
    ...present.map(t => ({ label: t, icon: typeOf(t).i, count: sizeOk.filter(f => f.type === t).length, active: types.includes(t), click: () => setTypes(types.includes(t) ? types.filter(x => x !== t) : [...types, t]) }))];

  useEffect(() => { if (focusRowRef.current) focusRowRef.current.scrollIntoView({ block: 'nearest' }); }, []);
  useEffect(() => {
    const onKey = e => {
      if (e.key !== 'Escape') return;
      if (confirm) { if (!busy) setConfirm(false); } else if (focus) setFocus(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirm, busy, focus, setFocus]);

  const doDelete = async () => {
    setBusy(true);
    const res = await api.del(selFiles.map(f => f.path), mode === 'perm');
    setBusy(false);
    setConfirm(false);
    const ok = res.filter(r => r.ok).map(r => r.path);
    const bad = res.filter(r => !r.ok);
    if (ok.length) {
      removeFiles(ok); // rows collapse out through AnimatePresence
      setSel({});
      if (ff && ok.includes(ff.path)) setFocus(null);
      const msg = `${plural(ok.length, 'file')} ${mode === 'perm' ? 'deleted' : 'moved to the Recycle Bin'}, ${fmt(selFiles.filter(f => ok.includes(f.path)).reduce((a, f) => a + f.size, 0))} freed.`;
      showToast(msg + (bad.length ? ` ${plural(bad.length, 'file')} couldn't be removed: ${bad[0].error}` : ''), bad.length ? 'error' : 'ok');
    } else if (bad.length) showToast(`Couldn't delete ${bad.length === 1 ? 'the file' : 'the files'}: ${bad[0].error}. Close any app using it and try again.`, 'error');
  };
  const doMove = async () => {
    const r = await api.move(selFiles.map(f => f.path));
    if (r.canceled) return;
    const ok = r.results.filter(x => x.ok).map(x => x.path);
    const bad = r.results.filter(x => !x.ok);
    if (ok.length) { removeFiles(ok); setSel({}); }
    if (ok.length) showToast(`Moved ${plural(ok.length, 'file')} to ${r.dest}.` + (bad.length ? ` ${bad.length} couldn't be moved: ${bad[0].error}` : ''), bad.length ? 'error' : 'ok');
    else showToast(`Couldn't move ${bad.length === 1 ? 'the file' : 'the files'}: ${bad[0] && bad[0].error}.`, 'error');
  };
  const toggle = p => setSel(s => ({ ...s, [p]: !s[p] }));

  if (!scan) return <section className="group"><NoScan startScan={startScan} scanning={scanning} prog={prog} title="Find large files to clean up" text="A scan lists every file of 100 MB or more. Review them here, then open, move or delete the ones you don't need." /></section>;

  const reserve = ff && !compact;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingRight: reserve ? PANEL_W + 16 : 0 }}>
      <div style={{ ...flexC, gap: 10, flexWrap: 'wrap' }}>
        <label className="field" style={{ flex: 1, minWidth: 200, maxWidth: 340 }}>
          <Icon name="Search" size={14} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name or folder" aria-label="Search large files" />
          {q && <button className="btn ghost" aria-label="Clear search" style={{ height: 22, width: 22, padding: 0 }} onClick={() => setQ('')}><Icon name="X" size={12} /></button>}
        </label>
        <label className="field t-sub" style={{ gap: 10, color: 'var(--text-2)' }}>
          <span>At least</span>
          <input type="range" min="0" max={MIN_STEPS.length - 1} step="1" value={minIdx} onChange={e => setMinIdx(+e.target.value)} aria-valuetext={fmt(minB)} style={{ width: 120, accentColor: ACCENT, flex: 'none' }} />
          <span className="num" style={{ color: 'var(--text)', fontWeight: 600, minWidth: 52 }}>{fmt(minB)}</span>
        </label>
        <div style={{ flex: 1 }} />
        <span className="t-sub mute num">{plural(list.length, 'file')} · <b style={{ color: 'var(--text)', fontWeight: 600 }}>{fmt(list.reduce((a, f) => a + f.size, 0))}</b></span>
      </div>
      <div role="group" aria-label="Filter by type" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {chips.map(ch => (
          <button key={ch.label} className={'chip' + (ch.active ? ' on' : '')} aria-pressed={ch.active} onClick={ch.click}>
            {ch.icon && <Icon name={ch.icon} size={12} />}{ch.label}<span className="faint num">{ch.count}</span>
          </button>
        ))}
      </div>

      <section aria-label="Large files" className="group" style={{ overflow: 'hidden', position: 'relative' }}>
        <div style={{ display: 'grid', gridTemplateColumns: grid, gap: 14, alignItems: 'center', padding: '11px 18px', borderBottom: '1px solid var(--line)' }}>
          <input type="checkbox" aria-label="Select all shown files" checked={allChecked} ref={el => { if (el) el.indeterminate = someChecked; }}
            onChange={() => { const n = { ...sel }; list.forEach(f => { n[f.path] = !allChecked; }); setSel(n); }} style={{ accentColor: ACCENT, margin: 0, width: 15, height: 15 }} />
          <SortHeader cols={cols} sortKey={sortKey} dir={dir} onSort={onSort} />
        </div>
        <div style={{ maxHeight: 'calc(100vh - 300px)', minHeight: 140, overflowY: 'auto', paddingBottom: selFiles.length ? 76 : 0, '--inset-l': '50px' }}>
          <AnimatePresence initial={false}>
            {list.slice(0, 500).map(f => {
              const on = focus === f.path;
              return (
                <motion.div key={f.path} ref={on ? focusRowRef : undefined} role="row" aria-selected={on} tabIndex={0} className={'lrow click' + (on ? ' row-sel' : '')}
                  exit={{ opacity: 0, height: 0, minHeight: 0, transition: snappy }}
                  onClick={() => setFocus(f.path)} onKeyDown={e => { if (e.key === 'Enter') setFocus(f.path); if (e.key === ' ') { e.preventDefault(); toggle(f.path); } }}
                  style={{ display: 'grid', gridTemplateColumns: grid, gap: 14, height: 46, minHeight: 46, overflow: 'hidden', borderRadius: 0 }}>
                  <input type="checkbox" aria-label={`Select ${f.name}`} checked={!!sel[f.path]} onChange={() => toggle(f.path)} onClick={e => e.stopPropagation()} tabIndex={-1} style={{ accentColor: ACCENT, margin: 0, width: 15, height: 15 }} />
                  <span style={{ ...flexC, gap: 10, minWidth: 0 }}>
                    <FileIcon type={f.type} size={13} box={26} /><span title={f.name} className="t-body ell">{f.name}</span>
                    {f.type === 'System' && <span title="Protected system file" className="faint" style={{ display: 'flex', flexShrink: 0 }}><Icon name="Lock" size={11} /></span>}
                  </span>
                  <span className="t-sub mute ell">{f.type}</span>
                  <Path className="mute">{f.folder}</Path>
                  <span className="t-head num" style={{ textAlign: 'right' }}>{fmt(f.size)}</span>
                  <span className="t-sub mute" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{fdate(f.modified)}</span>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {list.length === 0 && (
            <div style={{ padding: '52px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
              <div className="icon-tile mute" style={{ width: 40, height: 40, borderRadius: 11, marginBottom: 6 }}><Icon name="SearchX" size={18} /></div>
              <div className="t-head">No files match these filters</div>
              <div className="t-sub mute" style={{ maxWidth: 340, textWrap: 'pretty' }}>Nothing of {fmt(minB)} or more matches{q ? ` “${q}”` : ''}{types.length ? ` in ${types.join(', ')}` : ''}. Lower the size or clear the filters.</div>
              <button className="btn lg" style={{ marginTop: 10 }} onClick={() => { setMinIdx(0); setTypes([]); setQ(''); }}>Clear filters</button>
            </div>
          )}
        </div>

        {/* Floating action bar: appears with a selection, over the list it acts on. */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 14, display: 'flex', justifyContent: 'center', pointerEvents: 'none', padding: '0 14px' }}>
          <AnimatePresence>
            {selFiles.length > 0 && (
              <motion.div className="material" role="toolbar" aria-label="Selected files" initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98, transition: snappy }} transition={spring}
                style={{ pointerEvents: 'auto', ...flexC, gap: 6, padding: '7px 7px 7px 16px', borderRadius: 14, flexWrap: 'wrap', maxWidth: '100%' }}>
                <span className="t-sub num" style={{ marginRight: 8, color: 'var(--text)' }}>{plural(selFiles.length, 'file')} · <b style={{ fontWeight: 600 }}>{fmt(selSize)}</b>{hasSys && <span style={{ color: AMBER }}> · includes system files</span>}</span>
                <button className="btn ghost" onClick={() => setSel({})}>Clear</button>
                <button className="btn" onClick={() => api.reveal(selFiles[0].path)}><Icon name="FolderOpen" size={13} />Show</button>
                <button className="btn" disabled={hasSys} onClick={doMove}><Icon name="FolderInput" size={13} />Move to…</button>
                <button className="btn danger" disabled={hasSys} title={hasSys ? 'Protected system files cannot be deleted here' : undefined} onClick={() => { setMode('recycle'); setConfirm(true); }}><Icon name="Trash2" size={13} />Delete…</button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>
      {!selFiles.length && <div className="t-cap faint">Tick files to move or delete them. Space toggles the focused row, Enter opens its details.</div>}

      {/* Details: a floating sheet. Drag it right (or flick) to dismiss; it resists being pulled left. */}
      <AnimatePresence>
        {ff && (
          <motion.aside key="details" aria-label="File details" className="material"
            initial={{ x: PANEL_W + 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: PANEL_W + 40, opacity: 0 }} transition={spring}
            drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={{ left: 0.05, right: 1 }} dragMomentum={false}
            onDragEnd={(e, i) => { if (shouldDismiss(i.offset.x, i.velocity.x, PANEL_W)) setFocus(null); }}
            style={{ position: 'fixed', right: 16, top: 90, bottom: 16, width: PANEL_W, maxWidth: 'calc(100vw - 92px)', zIndex: 30, padding: '22px 22px 22px 26px', display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto', cursor: 'grab', touchAction: 'pan-y' }}>
            <span className="grabber" aria-hidden />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <FileIcon type={ff.type} size={20} box={44} />
              <button className="btn ghost icon" aria-label="Close details" title="Close (Esc)" onPointerDownCapture={e => e.stopPropagation()} onClick={() => setFocus(null)}><Icon name="X" size={15} /></button>
            </div>
            <div>
              <div className="t-head" style={{ wordBreak: 'break-all' }}>{ff.name}</div>
              <div className="t-title1 num" style={{ marginTop: 6 }}>{fmt(ff.size)}</div>
            </div>
            <dl style={{ margin: 0, display: 'flex', flexDirection: 'column' }}>
              {[['Type', ff.type], ['Location', ff.folder, true], ['Modified', fdate(ff.modified)]].map(r => (
                <div key={r[0]} style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 0', borderTop: '1px solid var(--line)' }}>
                  <dt className="t-label">{r[0]}</dt>
                  <dd className="t-sub" style={{ margin: 0, ...(r[2] ? { fontFamily: 'var(--mono)', fontSize: '0.71875rem', wordBreak: 'break-all', color: 'var(--text-soft)' } : {}) }}>{r[1]}</dd>
                </div>
              ))}
            </dl>
            {ff.type === 'System' && (
              <div className="t-sub mute" style={{ display: 'flex', gap: 8, padding: '11px 13px', borderRadius: 10, background: 'rgba(255,255,255,0.05)' }}>
                <span style={{ display: 'flex', flexShrink: 0, marginTop: 1 }}><Icon name="Lock" size={13} /></span>
                <span style={{ textWrap: 'pretty' }}>Managed by Windows. Change it from System settings instead of deleting it.</span>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 'auto' }} onPointerDownCapture={e => e.stopPropagation()}>
              <button className="btn lg" onClick={() => api.reveal(ff.path)}><Icon name="ExternalLink" size={13} />Show in File Explorer</button>
              {ff.type !== 'System' && <button className="btn ghost" onClick={() => toggle(ff.path)}>{sel[ff.path] ? 'Remove from selection' : 'Add to selection'}</button>}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Delete dialog: materializes (blur + scale) while the page behind it recedes. */}
      <AnimatePresence onExitComplete={() => setMode('recycle')}>
        {confirm && dlg && (
          <Portal key="dlg">
            <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.15 } }} transition={{ duration: 0.2 }}
              onMouseDown={e => { if (e.target === e.currentTarget && !busy) setConfirm(false); }}>
              <motion.div role="alertdialog" aria-modal="true" aria-labelledby="del-title" aria-describedby="del-desc" className="material"
                initial={{ opacity: 0, scale: 0.94, filter: 'blur(8px)' }} animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }} exit={{ opacity: 0, scale: 0.97, filter: 'blur(4px)', transition: snappy }} transition={spring}
                onAnimationStart={() => { if (cancelRef.current) cancelRef.current.focus(); }}
                style={{ width: 460, maxWidth: '100%', borderRadius: 18, overflow: 'hidden' }}>
                <div style={{ padding: '24px 24px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div><h2 id="del-title" className="t-title2" style={{ margin: 0 }}>Delete {plural(dlg.files.length, 'file')}?</h2><div id="del-desc" className="t-sub mute" style={{ marginTop: 3 }}>This frees up {fmt(dlg.size)}.</div></div>
                  <div style={{ display: 'flex', flexDirection: 'column', borderRadius: 10, maxHeight: 150, overflow: 'auto', background: 'rgba(0,0,0,0.22)', boxShadow: 'inset 0 0 0 1px var(--line)' }}>
                    {dlg.files.map(s => <div key={s.path} className="t-sub" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 12px', borderBottom: '1px solid var(--line-soft)' }}><span className="ell" title={s.path}>{s.name}</span><span className="mute num">{fmt(s.size)}</span></div>)}
                  </div>
                  <div role="radiogroup" aria-label="Delete method" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {[['recycle', 'Move to Recycle Bin', 'You can restore them later.', ACCENT], ['perm', 'Delete permanently', "This can't be undone.", RED]].map(([v, t, d, col]) => (
                      <label key={v} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', cursor: 'pointer', padding: '9px 11px', borderRadius: 10, background: mode === v ? 'rgba(255,255,255,0.06)' : 'transparent', transition: 'background-color 150ms ease' }}>
                        <input type="radio" name="del-mode" checked={mode === v} onChange={() => setMode(v)} style={{ accentColor: col, marginTop: 3 }} />
                        <span><span className="t-body" style={{ display: 'block', fontWeight: 500 }}>{t}</span><span className="t-sub faint" style={{ display: 'block' }}>{d}</span></span>
                      </label>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 24px 20px' }}>
                  <button ref={cancelRef} className="btn lg" disabled={busy} onClick={() => setConfirm(false)}>Cancel</button>
                  {mode === 'perm' && !busy ? (
                    <HoldButton onConfirm={doDelete}><Icon name="Trash2" size={13} />Hold to delete</HoldButton>
                  ) : (
                    <button className="btn lg primary" disabled={busy} onClick={doDelete} style={{ minWidth: 148 }}>
                      {busy && <Icon name="Loader2" size={13} style={{ animation: 'dk-spin 0.7s linear infinite' }} />}
                      {busy ? 'Working…' : 'Move to Recycle Bin'}
                    </button>
                  )}
                </div>
              </motion.div>
            </motion.div>
          </Portal>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------ Settings ------------------------------ */
const DEFAULTS = { warn: 75, crit: 90, showSys: true };
export function SettingsPage({ settings, setSettings, scan }) {
  const { warn, crit, showSys } = settings;
  const isDefault = warn === DEFAULTS.warn && crit === DEFAULTS.crit && showSys === DEFAULTS.showSys;
  const row = { padding: '14px 18px', gap: 16, flexWrap: 'wrap', minHeight: 64 };
  const text = (title, desc, id) => <span id={id} style={{ flex: 1, minWidth: 220 }}><span className="t-body" style={{ display: 'block', fontWeight: 500 }}>{title}</span><span className="t-sub mute" style={{ display: 'block', textWrap: 'pretty' }}>{desc}</span></span>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 720 }}>
      <Section id="h-warn" title="Low-space warnings" action={<button className="btn ghost" disabled={isDefault} onClick={() => setSettings(DEFAULTS)}>Reset to defaults</button>}>
        <div className="group">
          <label className="lrow" style={row}>
            {text('Running low', "A drive turns amber once it's this full.")}
            <input type="range" min="50" max="90" step="1" value={warn} onChange={e => setSettings({ warn: Math.min(+e.target.value, crit - 1) })} style={{ width: 170, accentColor: AMBER }} />
            <span className="t-head num" style={{ width: 40, textAlign: 'right', color: AMBER }}>{warn}%</span>
          </label>
          <label className="lrow" style={row}>
            {text('Critically low', "A drive turns red once it's this full.")}
            <input type="range" min="80" max="99" step="1" value={crit} onChange={e => setSettings({ crit: Math.max(+e.target.value, warn + 1) })} style={{ width: 170, accentColor: RED }} />
            <span className="t-head num" style={{ width: 40, textAlign: 'right', color: RED }}>{crit}%</span>
          </label>
        </div>
      </Section>

      <Section id="h-scan" title="Scanning">
        <div className="group">
          <div className="lrow" style={row}>
            {text('Show protected system files', "Include files like hiberfil.sys and pagefile.sys in large-file lists. They can't be deleted from Diskly.", 'sys-label')}
            <Switch checked={showSys} onChange={v => setSettings({ showSys: v })} labelledBy="sys-label" />
          </div>
          <div className="lrow" style={row}>
            {text('What gets scanned', 'Every local and removable drive. Network drives are listed but not scanned, and only files of 100 MB or more are listed individually.')}
          </div>
        </div>
      </Section>

      {scan && scan.skippedCount > 0 && (
        <Section id="h-skipped" title="Skipped folders">
          <div className="group" style={{ padding: '16px 18px', display: 'flex', gap: 12 }}>
            <span style={{ color: AMBER, display: 'flex', marginTop: 1, flexShrink: 0 }}><Icon name="ShieldAlert" size={17} sw={1.9} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="t-head">The last scan skipped {plural(scan.skippedCount, 'protected folder')}</div>
              <div className="t-sub" style={{ color: 'var(--text-soft)', marginTop: 2, textWrap: 'pretty' }}>Windows blocked access, so their sizes aren't in the totals. Run Diskly as administrator to include them.</div>
              {scan.skipped && scan.skipped.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column' }}>
                  {scan.skipped.slice(0, 5).map(p => <div key={p} className="mute" style={{ ...flexC, gap: 8, padding: '7px 0', borderTop: '1px solid var(--line)' }}><Icon name="Lock" size={12} /><Path>{p}</Path></div>)}
                  {scan.skipped.length > 5 && <div className="t-cap faint" style={{ paddingTop: 6 }}>and {plural(scan.skippedCount - 5, 'more folder')}</div>}
                </div>
              )}
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}

/* ---------------------------- States gallery ---------------------------- */
export function StatesPage({ setPage }) {
  const sCard = { padding: 24, display: 'flex', flexDirection: 'column', gap: 14 };
  const list = rows => rows.map(([ic, color, text, right], i) => (
    <div key={i} className="t-sub" style={{ ...flexC, gap: 8, padding: '9px 0', borderTop: '1px solid var(--line)', color: color === 'var(--text-2)' ? color : undefined }}>
      <span style={{ color, display: 'flex' }}><Icon name={ic} size={14} style={ic === 'Loader2' ? { animation: 'dk-spin 0.7s linear infinite' } : undefined} /></span>{text}<span className="faint" style={{ marginLeft: 'auto' }}>{right}</span>
    </div>
  ));
  const tile = (ic, bg, color) => <div className="icon-tile" style={{ width: 40, height: 40, borderRadius: 11, background: bg, color, marginTop: 24, marginBottom: 6 }}><Icon name={ic} size={18} /></div>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(340px,100%),1fr))', gap: 20 }}>
      <section className="group" style={sCard}>
        <div className="t-label">Loading · scanning drives</div>
        <div style={{ ...flexC, gap: 12 }}><div className="icon-tile" style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--accent-tint)', color: ACCENT }}><Icon name="ScanSearch" /></div><div><div className="t-head">Scanning drives…</div><div className="t-sub mute">Drive 2 of 3 · 184,220 files checked</div></div></div>
        <div style={{ display: 'flex' }}><Meter pct={46} color={ACCENT} h={4} /></div>
        <div className="t-cap mute" style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontFamily: 'var(--mono)' }}>D:\Media\Videos\2025</span><span className="num">46%</span></div>
        <div>{list([['CheckCircle2', GREEN, 'Local Disk (C:)', 'Done'], ['Loader2', ACCENT, 'Data (D:)', 'Scanning'], ['Circle', 'var(--text-2)', 'Backup (E:)', 'Waiting']])}</div>
        <button className="btn" style={{ alignSelf: 'flex-start' }}>Stop scan</button>
      </section>
      <section className="group" style={{ ...sCard, gap: 8, alignItems: 'center', textAlign: 'center' }}>
        <div className="t-label" style={{ alignSelf: 'flex-start' }}>Empty · no large files</div>
        {tile('SearchX', 'var(--chip)', 'var(--text-2)')}
        <div className="t-head">No large files found</div>
        <div className="t-sub mute" style={{ maxWidth: 280, textWrap: 'pretty' }}>No files of 10 GB or more on the drives you scanned. Lower the minimum size to see more.</div>
        <button className="btn" style={{ marginTop: 8 }}>Show files over 1 GB</button>
      </section>
      <section className="group" style={sCard}>
        <div className="t-label">Error · access denied</div>
        <div style={{ display: 'flex', gap: 10, padding: '13px 14px', borderRadius: 10, background: 'rgba(232,173,82,0.08)' }}>
          <span style={{ color: AMBER, display: 'flex', marginTop: 1 }}><Icon name="ShieldAlert" sw={1.9} /></span>
          <div style={{ flex: 1 }}><div className="t-head">3 folders were skipped</div><div className="t-sub" style={{ color: 'var(--text-soft)', marginTop: 2, textWrap: 'pretty' }}>Windows blocked access to these protected folders. Their sizes aren't included in totals.</div></div>
        </div>
        <div className="t-cap mute">
          {['C:\\System Volume Information', 'C:\\Windows\\CSC', 'C:\\Users\\Default\\AppData'].map(p => <div key={p} style={{ padding: '8px 0', borderTop: '1px solid var(--line)', ...flexC, gap: 8 }}><Icon name="Lock" size={12} /><Path>{p}</Path></div>)}
        </div>
        <div style={{ display: 'flex', gap: 6 }}><button className="btn primary">Rescan as administrator</button><button className="btn ghost">Dismiss</button></div>
      </section>
      <section className="group" style={{ ...sCard, gap: 8, alignItems: 'center', textAlign: 'center' }}>
        <div className="t-label" style={{ alignSelf: 'flex-start' }}>Error · drive not reachable</div>
        {tile('ServerOff', 'var(--red-tint)', RED)}
        <div className="t-head">NAS (Z:) can't be reached</div>
        <div className="t-sub mute" style={{ maxWidth: 300, textWrap: 'pretty' }}>Diskly couldn't connect to <bdi style={{ fontFamily: 'var(--mono)', color: 'var(--text-soft)' }}>\\NAS-HOME\share</bdi>. Check the network connection, then try again.</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}><button className="btn">Try again</button><button className="btn ghost">Skip this drive</button></div>
      </section>
      <section className="group" style={sCard}>
        <div className="t-label">Success · scan completed</div>
        <div style={{ ...flexC, gap: 12 }}><div className="icon-tile" style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(95,199,149,0.12)', color: GREEN }}><Icon name="CheckCircle2" /></div><div><div className="t-head">Scan completed</div><div className="t-sub mute">Today, 10:42 AM · took 1 min 48 s</div></div></div>
        <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', borderTop: '1px solid var(--line)', paddingTop: 14, gap: 12 }}>
          {[['Drives', '3 of 4'], ['Files checked', '412,880'], ['New large files', '2']].map(c => (
            <div key={c[0]}><dt className="t-label">{c[0]}</dt><dd className="t-title3 num" style={{ margin: '4px 0 0' }}>{c[1]}</dd></div>
          ))}
        </dl>
        <button className="btn primary lg" style={{ alignSelf: 'flex-start' }} onClick={() => setPage('overview')}>View overview</button>
      </section>
    </div>
  );
}
