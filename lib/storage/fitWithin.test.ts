/**
 * #1052 — nedskalerings-matte (Type A) + URL-kontrakten for public-lesing.
 */

import { describe, it, expect } from 'vitest';

import { fitWithin } from './fitWithin';
import { sponsorLogoUrl, SPONSOR_LOGO_BUCKET } from './sponsorLogoUrl';

describe('fitWithin', () => {
  it.each([
    // [w, h, max, expectedW, expectedH]
    [800, 400, 400, 400, 200], // landskap skaleres på lengste kant
    [400, 800, 400, 200, 400], // portrett
    [300, 200, 400, 300, 200], // mindre enn max → aldri oppskalering
    [400, 400, 400, 400, 400], // eksakt grense → uendret
    [1000, 10, 400, 400, 4], // ekstrem aspekt → kortside ≥ 1
    [3, 1000, 400, 1, 400], // avrunding klamper til minst 1px
  ])('fits %ix%i within %i → %ix%i', (w, h, max, ew, eh) => {
    expect(fitWithin(w, h, max)).toEqual({ width: ew, height: eh });
  });

  it('falls back to a max×max square for dimensionless input (SVG uten width/height)', () => {
    expect(fitWithin(0, 0, 400)).toEqual({ width: 400, height: 400 });
    expect(fitWithin(0, 300, 400)).toEqual({ width: 400, height: 400 });
  });
});

describe('sponsorLogoUrl', () => {
  it('builds the public CDN path from the object key', () => {
    expect(sponsorLogoUrl('uid-123/logo.webp')).toBe(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${SPONSOR_LOGO_BUCKET}/uid-123/logo.webp`,
    );
  });
});
