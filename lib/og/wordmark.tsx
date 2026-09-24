import {
  BALL_CENTER_X_EM,
  BALL_DIAMETER_EM,
  BALL_SHADING_CSS,
  BALL_SHADING_MIN_PX,
  T_CAP_HEIGHT_EM,
} from '@/lib/brand/wordmarkBall';
import { CHAMP, FOREST } from './palette';

/**
 * Where Satori puts the baseline in a lineHeight-1 line, from its top (em).
 * Satori lays text out on the font's hhea ascent/descent — for Fraunces
 * (0.978 / 0.255) that is (1 + 0.978 − 0.255) / 2 ≈ 0.86, which a render of
 * both weights confirmed (T ink top 0.1425 em from the line top at 500).
 */
const SATORI_BASELINE_EM = 0.86;

/**
 * The «Tørny» wordmark with the ball resting on the T (#1985) for
 * Satori-rendered images — the only such lockup; the signup OG image, the
 * result share card and the Kavalkade cards import it. Same em ratios as
 * BrandMark (`lib/brand/wordmarkBall.ts`), in px because Satori has no
 * baseline-anchored inline-block: the ball is placed from the measured
 * baseline instead, with room reserved above the line so it never clips.
 */
export function OgWordmark({
  fontFamily,
  fontSize,
  fontWeight,
}: {
  fontFamily: string;
  fontSize: number;
  fontWeight: 500 | 600;
}) {
  const d = BALL_DIAMETER_EM * fontSize;
  const clearance =
    Math.max(0, BALL_DIAMETER_EM + T_CAP_HEIGHT_EM - SATORI_BASELINE_EM) * fontSize;
  return (
    <div style={{ display: 'flex', position: 'relative', paddingTop: clearance }}>
      <span style={{ fontFamily, fontSize, fontWeight, color: FOREST, lineHeight: 1 }}>
        Tørny
      </span>
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: (BALL_CENTER_X_EM - BALL_DIAMETER_EM / 2) * fontSize,
          top: clearance + (SATORI_BASELINE_EM - T_CAP_HEIGHT_EM) * fontSize - d,
          width: d,
          height: d,
          borderRadius: d,
          backgroundColor: CHAMP,
          // Spread, not `undefined`: Satori throws on backgroundImage: undefined.
          ...(d >= BALL_SHADING_MIN_PX ? { backgroundImage: BALL_SHADING_CSS } : {}),
        }}
      />
    </div>
  );
}
