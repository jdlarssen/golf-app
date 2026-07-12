import { describe, it, expect } from 'vitest';
import { haversineMeters, type LatLng } from './distance';

/**
 * Type A — pure logic (#1210). Haversine distance in meters between two
 * WGS84 coordinates, R = 6371 km convention. Golf scale is tens–hundreds of
 * meters, so the asserts probe identity, symmetry, a well-known analytic
 * reference (1° latitude ≈ 111 194.9 m) and golf-realistic offsets derived
 * from that reference. Tolerance bands instead of re-deriving the formula in
 * the test (which would just mirror the implementation).
 */

const p = (lat: number, lng: number): LatLng => ({ lat, lng });

// Oslo Golfklubb-ish anchor — a realistic Norwegian course latitude.
const GREEN = p(59.9139, 10.7522);

// 1° latitude on the R=6371km sphere: 6371000 * π/180 = 111 194.93 m.
const METERS_PER_DEG_LAT = 111194.93;

describe('haversineMeters — identity and symmetry', () => {
  it('same point → exactly 0 m (design row: same position as center)', () => {
    expect(haversineMeters(GREEN, GREEN)).toBe(0);
  });

  it('is symmetric: d(a,b) === d(b,a)', () => {
    const tee = p(59.9105, 10.7488);
    expect(haversineMeters(GREEN, tee)).toBe(haversineMeters(tee, GREEN));
  });
});

describe('haversineMeters — analytic references', () => {
  it('1° pure-latitude separation ≈ 111 194.9 m', () => {
    const d = haversineMeters(p(59, 10), p(60, 10));
    expect(d).toBeGreaterThan(111190);
    expect(d).toBeLessThan(111200);
  });

  it.each([
    ['a 150 m approach shot (north offset)', 150],
    ['a 30 m chip (north offset)', 30],
    ['a 999 m cross-course offset', 999],
  ])('golf-scale distance: %s → ~%d m', (_label, meters) => {
    const target = p(GREEN.lat + meters / METERS_PER_DEG_LAT, GREEN.lng);
    const d = haversineMeters(GREEN, target);
    expect(d).toBeGreaterThan(meters - 0.2);
    expect(d).toBeLessThan(meters + 0.2);
  });

  it('longitude-only offset respects latitude scaling (100 m east at 60°N)', () => {
    // 1° longitude at 60°N ≈ 111194.93 * cos(60°) = 55 597.46 m.
    const start = p(60, 10);
    const target = p(60, 10 + 100 / (METERS_PER_DEG_LAT * Math.cos((60 * Math.PI) / 180)));
    const d = haversineMeters(start, target);
    expect(d).toBeGreaterThan(99.8);
    expect(d).toBeLessThan(100.2);
  });
});
