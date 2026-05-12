'use client';

import { useEffect } from 'react';

// Drop at the bottom of any server page you want to time. Fires once the
// server-rendered data has committed to the DOM, so PerfHud can measure
// click → data-ready (in addition to click → first paint of the skeleton).
// Renders nothing.
export function PerfReady() {
  useEffect(() => {
    window.dispatchEvent(new Event('torny-perf-ready'));
  }, []);
  return null;
}
