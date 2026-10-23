// native/app/src/lib/tornyMark.ts
// #2627: Tørny-merket som vektor, til midten av QR-koden.
//
// Merket er app-ikonet (#1985): T-en er en tee, og gullballen hviler på
// tverrliggeren, på en skoggrønn flate. Kilden er master-SVG-ene i
// `native/assets/` (`icon-master-full-bleed.svg`, og
// `docs/design/realized/brand-foundations/assets/brand-mark-icon-only.svg` for
// hjørneradien). Tallene her er kopiert derfra i samme 80 × 80-koordinater, og
// `tornyMark.test.ts` leser masterne og feiler hvis de to sporer av.
//
// **T-en er en sti, ikke tekst.** Masteren tegner T-en som `<text>` i Fraunces
// med optisk størrelse 48, og React Native har ingen variabel font. Stien er
// glyfen «T» fra samme Fraunces-kilde som appens snitt (google/fonts
// `ac502d8e`, se `assets/fonts/README.md`), instansiert med opsz 48, vekt 500
// og de andre aksene på standard (SOFT 0, WONK 1), plassert som masterens
// tekst (midt på x = 40, grunnlinje 65,66, størrelse 50). Laget med fontTools
// 4.66.1 og `SVGPathPen`.
export const MARK_SIZE = 80;

export const TORNY_MARK = {
  /** Hjørneradien i `brand-mark-icon-only.svg` (appen tegner ikonet avrundet). */
  tileRadius: 20,
  /** Flaten: loddrett overgang fra skog til natt-skog. */
  tileTop: '#1B4332',
  tileBottom: '#14201A',
  /** T-en. */
  ink: '#F8F6F0',
  tPath:
    'M30.76 30.66H49.17Q49.99 30.66 50.51 30.43Q51.03 30.19 51.44 29.97Q51.85 29.74 52.29 29.74Q52.89 29.74 53.22 30.04Q53.54 30.35 53.73 31.1L55.4 39.31Q55.52 39.87 55.33 40.22Q55.15 40.57 54.69 40.66Q54.26 40.75 53.93 40.57Q53.59 40.4 53.36 39.91Q52.07 36.84 51.1 35.29Q50.13 33.74 49.15 33.19Q48.17 32.64 46.82 32.64H43.32V62.28Q43.32 62.78 43.62 63.08Q43.93 63.39 44.5 63.53L46.16 63.85Q47.02 64.09 47.02 64.8Q47.02 65.66 45.88 65.66H34.11Q33.53 65.66 33.25 65.42Q32.97 65.19 32.97 64.8Q32.97 64.09 33.83 63.85L35.49 63.53Q36.07 63.39 36.37 63.08Q36.67 62.78 36.67 62.28V32.64H33.16Q31.84 32.64 30.85 33.21Q29.87 33.77 28.9 35.32Q27.93 36.88 26.63 39.91Q26.41 40.4 26.07 40.57Q25.73 40.75 25.3 40.66Q24.85 40.57 24.67 40.22Q24.49 39.87 24.59 39.31L26.25 31.1Q26.44 30.35 26.77 30.04Q27.1 29.74 27.7 29.74Q28.15 29.74 28.54 29.97Q28.93 30.19 29.45 30.43Q29.96 30.66 30.76 30.66Z',
  /** Skyggen under ballen på tverrliggeren. */
  shadow: { cx: 40, cy: 30.14, rx: 4.9, ry: 0.9, fill: '#14201A', opacity: 0.35 },
  /** Gullballen, med masterens skygge og lys som radielle overganger. */
  ball: { cx: 40, cy: 23.34, r: 7, fill: '#C9A961' },
  ballShade: { cx: 0.42, cy: 0.38, r: 0.62, color: '#14201A', from: 0.55, opacity: 0.3 },
  ballLight: { cx: 0.36, cy: 0.3, r: 0.6, color: '#F8F6F0', to: 0.6, opacity: 0.55 },
} as const;
