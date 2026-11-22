import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/*
 * Springs, not durations. Two presets, in Apple's terms:
 *  - `spring`: critically damped (no bounce) — the default for anything the UI moves on its own.
 *  - `flick`:  a touch of bounce — only after a gesture that carried momentum (drag release).
 * A spring has no fixed duration; `duration` here is Motion's perceptual "response".
 */
export const spring = { type: 'spring', bounce: 0, duration: 0.35 };
export const snappy = { type: 'spring', bounce: 0, duration: 0.25 };
export const flick = { type: 'spring', bounce: 0.18, duration: 0.4 };
export const instant = { duration: 0 };

/*
 * Where a flick will come to rest, using the same exponential deceleration as scrolling
 * (Apple's projection from "Designing Fluid Interfaces"). Velocity in px/s.
 */
export function project(velocity, decelerationRate = 0.998) {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/* Dismiss decision for a drag: judged by where the gesture is going, not where it was let go. */
export function shouldDismiss(offset, velocity, distance) {
  return offset + project(velocity) > distance / 2;
}

/*
 * Keeps an element mounted while it animates out, and reports a data-state for CSS.
 * Used for the tooltip, whose motion is a plain CSS transition.
 */
export function usePresence(open, exitMs = 160) {
  const [mounted, setMounted] = useState(open);
  const [state, setState] = useState(open ? 'open' : 'closed');

  useEffect(() => {
    if (open) { setMounted(true); return undefined; }
    if (!mounted) return undefined;
    setState('closing');
    const t = setTimeout(() => { setMounted(false); setState('closed'); }, exitMs);
    return () => clearTimeout(t);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (mounted && open && state !== 'open') {
      void document.body.offsetHeight;
      setState('open');
    }
  }, [mounted, open, state]);

  return [mounted, state];
}

/* Remembers the last non-empty value so exiting content doesn't blank out mid-animation. */
export function useLatest(value) {
  const ref = useRef(value);
  if (value) ref.current = value;
  return ref.current;
}

export function Portal({ children }) {
  return createPortal(children, document.body);
}

/* While a modal is up, the page behind it recedes (CSS keys off this attribute). */
export function useModalBackdrop(open) {
  useEffect(() => {
    if (!open) return undefined;
    document.documentElement.dataset.modal = 'true';
    return () => { delete document.documentElement.dataset.modal; };
  }, [open]);
}
