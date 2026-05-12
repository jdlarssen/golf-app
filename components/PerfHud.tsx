'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

// Enable with `?perf=1` (sticky for the session). Disable with `?perf=0`.
// Measures click → next paint after pathname change, so total user-perceived
// latency. Hidden unless explicitly enabled — has zero impact in normal use.

type NavRecord = { path: string; ms: number };

const PERF_EVENT = 'torny-perf-change';
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

  useEffect(() => {
    if (!enabled) return;
    if (prevPathRef.current === pathname) return;
    const startedAt = clickAtRef.current;
    prevPathRef.current = pathname;
    if (startedAt == null) return;
    // Two RAFs — first commits the new DOM, second fires after paint.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const ms = Math.round(performance.now() - startedAt);
        setLast({ path: pathname, ms });
        clickAtRef.current = null;
      });
    });
  }, [enabled, pathname]);

  if (!enabled || !last) return null;

  const tone = last.ms < 400 ? 'good' : last.ms < 1200 ? 'warn' : 'bad';
  const bg = tone === 'good' ? '#1B4332' : tone === 'warn' ? '#C9A961' : '#8C1E1E';
  const fg = tone === 'warn' ? '#1B4332' : '#F8F6F0';

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
      → {last.path} · {last.ms} ms
    </div>
  );
}
