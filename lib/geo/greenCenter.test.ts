import { describe, it, expect } from 'vitest';
import { computeGreenCenter } from './greenCenter';
import type { LatLng } from './distance';

/**
 * Type A — pure logic (#1210). The crowdsourced green center is the median of
 * pin latitudes and longitudes, computed independently per axis (never
 * materialized — derived on read, design doc §Datamodell). The median is the
 * whole point of the design: a single outlier pin (score entered on the next
 * tee) must not drag the center off the green.
 *
 * Every row here maps to the contract's edge-case table.
 */

const p = (lat: number, lng: number): LatLng => ({ lat, lng });

describe('computeGreenCenter — empty / single / pair', () => {
  it('0 pins → null (no line rendered, chip may show)', () => {
    expect(computeGreenCenter([])).toBeNull();
  });

  it('1 pin → the point itself', () => {
    expect(computeGreenCenter([p(59.9139, 10.7522)])).toEqual({
      lat: 59.9139,
      lng: 10.7522,
    });
  });

  it('2 pins → midpoint (median of two = mean per axis)', () => {
    expect(computeGreenCenter([p(59.913, 10.752), p(59.915, 10.754)])).toEqual({
      lat: 59.914,
      lng: 10.753,
    });
  });
});

describe('computeGreenCenter — outlier robustness (the design premise)', () => {
  it('many clustered pins + one next-tee outlier → median stays in the cluster', () => {
    const cluster = [
      p(59.91388, 10.75218),
      p(59.9139, 10.7522),
      p(59.91392, 10.75222),
      p(59.91391, 10.75219),
    ];
    // The next tee ~200 m away — a pin tapped one hole too late.
    const outlier = p(59.9157, 10.7541);
    const center = computeGreenCenter([...cluster, outlier])!;
    expect(center.lat).toBeGreaterThanOrEqual(59.91388);
    expect(center.lat).toBeLessThanOrEqual(59.91392);
    expect(center.lng).toBeGreaterThanOrEqual(10.75218);
    expect(center.lng).toBeLessThanOrEqual(10.75222);
  });

  it('odd count → exact middle value per axis (no averaging)', () => {
    const center = computeGreenCenter([
      p(59.001, 10.003),
      p(59.002, 10.001),
      p(59.003, 10.002),
    ])!;
    // Axes are sorted independently: lat median 59.002, lng median 10.002.
    expect(center).toEqual({ lat: 59.002, lng: 10.002 });
  });
});

describe('computeGreenCenter — duplicates', () => {
  it('all-identical pins → that point', () => {
    const pin = p(59.9139, 10.7522);
    expect(computeGreenCenter([pin, pin, pin, pin])).toEqual(pin);
  });

  it('duplicating the median pin leaves the center unchanged', () => {
    const pins = [p(59.001, 10.001), p(59.002, 10.002), p(59.003, 10.003)];
    const before = computeGreenCenter(pins)!;
    const after = computeGreenCenter([...pins, p(59.002, 10.002)])!;
    expect(after).toEqual(before);
  });
});
