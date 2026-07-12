/**
 * Crowdsourced green center (#1210) — pure TS, no I/O (Type A).
 *
 * The center is the median of pin latitudes and longitudes, computed
 * independently per axis. Median (not mean) is the design premise: a single
 * outlier pin — a score entered on the next tee — must not drag the center
 * off the green. Never materialized in the DB; derived on read from the raw
 * green_pins rows (design doc §Datamodell — at hand-count volumes this is
 * free, and re-deriving lets the median self-correct as pins accumulate).
 */

import type { LatLng } from './distance';

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Median center of the given pins; null when there are no pins. */
export function computeGreenCenter(pins: LatLng[]): LatLng | null {
  if (pins.length === 0) return null;
  return {
    lat: median(pins.map((p) => p.lat)),
    lng: median(pins.map((p) => p.lng)),
  };
}
