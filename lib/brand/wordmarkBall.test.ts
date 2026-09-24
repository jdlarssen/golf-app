/**
 * Trap #4 agreement test (AGENTS.md): the ball on the T has two homes that are
 * not code — `native/assets/wordmark-master.svg` draws it at font-size 100 for
 * the mail header's PNG, while BrandMark and the Satori lockup read the em
 * ratios in `wordmarkBall.ts`. A change to one without the other would put the
 * ball in a different spot in the mail than on the web; this fails first.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

import { BALL_CENTER_X_EM, BALL_DIAMETER_EM, T_CAP_HEIGHT_EM } from './wordmarkBall';

const MASTER = path.resolve(__dirname, '../../native/assets/wordmark-master.svg');

function attr(tag: string, name: string): number {
  const m = tag.match(new RegExp(`\\s${name}="([\\d.-]+)"`));
  if (!m) throw new Error(`wordmark-master.svg: ${name} missing on ${tag}`);
  return Number(m[1]);
}

describe('wordmark-master.svg agrees with lib/brand/wordmarkBall.ts', () => {
  const svg = fs.readFileSync(MASTER, 'utf-8');
  const text = svg.match(/<text[^>]*>Tørny<\/text>/)?.[0];
  const circle = svg.match(/<circle[^>]*\/>/)?.[0];
  if (!text || !circle) throw new Error('wordmark-master.svg: expected one <text>Tørny</text> and one <circle>');

  const fontSize = attr(text, 'font-size');
  const originX = attr(text, 'x');
  const baseline = attr(text, 'y');
  const r = attr(circle, 'r');
  const cx = attr(circle, 'cx');
  const cy = attr(circle, 'cy');

  it('draws the ball at the same diameter, centre and cap height', () => {
    expect({
      diameter: (2 * r) / fontSize,
      centerX: (cx - originX) / fontSize,
      restsAt: (baseline - (cy + r)) / fontSize,
    }).toEqual({
      diameter: BALL_DIAMETER_EM,
      centerX: BALL_CENTER_X_EM,
      restsAt: T_CAP_HEIGHT_EM,
    });
  });
});
