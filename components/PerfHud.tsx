'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

// Enable with `?perf=1` (sticky for the session). Disable with `?perf=0`.
// Splits navigation timing into two legs:
//   paint: click → first paint after pathname change (often the skeleton)
//   data : click → <PerfReady /> mounts (server data has rendered)
// Hidden unless explicitly enabled — has zero impact in normal use.

type NavRecord = { path: string; paintMs: number | null; dataMs: number | null };

const PERF_EVENT = 'torny-perf-change';
const READY_EVENT = 'torny-perf-ready';

const subscribe = (cb: () => void) => {
  window.addEventListener(PERF_EVENT, cb);
  return () => window.removeEventListener(PERF_EVENT, cb);
};
const getSnapshot = () => sessionStorage.getItem('torny-perf') === '1';
const getServerSnapshot = () => false;

export function PerfHud() {
  const pathname = usePathname();
  const enabled = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [last, setLast] = useState<NavRecord | null>(null);
  const clickAtRef = useRef<number | null>(null);
  const prevPathRef = useRef<string>(pathname);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const flag = params.get('perf');
    if (flag === '1') {
      sessionStorage.setItem('torny-perf', '1');
      window.dispatchEvent(new Event(PERF_EVENT));
    } else if (flag === '0') {
      sessionStorage.removeItem('torny-perf');
      window.dispatchEvent(new Event(PERF_EVENT));
    }
  }, [pathname]);

  useEffect(() => {
    if (!enabled) return;
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest('a, button');
      if (!el) return;
      clickAtRef.current = performance.now();
    };
    window.addEventListener('click', onClick, true);
    return () => window.removeEventListener('click', onClick, true);
  }, [enabled]);

  // Leg 1: click → first paint (skeleton or page commit)
  useEffect(() => {
    if (!enabled) return;
    if (prevPathRef.current === pathname) return;
    const startedAt = clickAtRef.current;
    prevPathRef.current = pathname;
    if (startedAt == null) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const paintMs = Math.round(performance.now() - startedAt);
        setLast({ path: pathname, paintMs, dataMs: null });
      });
    });
  }, [enabled, pathname]);

  // Leg 2: click → PerfReady mount (server data committed)
  useEffect(() => {
    if (!enabled) return;
    const onReady = () => {
      const startedAt = clickAtRef.current;
      if (startedAt == null) return;
      const dataMs = Math.round(performance.now() - startedAt);
      setLast((prev) => (prev ? { ...prev, dataMs } : prev));
      clickAtRef.current = null;
    };
    window.addEventListener(READY_EVENT, onReady);
    return () => window.removeEventListener(READY_EVENT, onReady);
  }, [enabled]);

  if (!enabled || !last) return null;

  // Tone by the slowest known leg (data if present, else paint).
  const benchmark = last.dataMs ?? last.paintMs ?? 0;
  const tone = benchmark < 400 ? 'good' : benchmark < 1200 ? 'warn' : 'bad';
  const bg = tone === 'good' ? '#1B4332' : tone === 'warn' ? '#C9A961' : '#8C1E1E';
  const fg = tone === 'warn' ? '#1B4332' : '#F8F6F0';

  const paintLabel = last.paintMs == null ? '—' : `${last.paintMs}`;
  const dataLabel = last.dataMs == null ? '—' : `${last.dataMs}`;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'max(12px, env(safe-area-inset-bottom))',
        right: 12,
        zIndex: 9999,
        padding: '6px 12px',
        borderRadius: 999,
        background: bg,
        color: fg,
        fontFamily: 'ui-monospace, SFMono-Regular, monospace',
        fontSize: 12,
        fontVariantNumeric: 'tabular-nums',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        pointerEvents: 'none',
      }}
    >
      → {last.path} · paint {paintLabel} · data {dataLabel} ms
    </div>
  );
}
