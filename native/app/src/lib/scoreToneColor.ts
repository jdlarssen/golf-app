// #2385: fargen til en score-tone, delt av formene på hullsiden
// (`FlightRow`) og på scorekortet (`ScoreShape`). Tonen er den delte
// `scoreTone` (under par grønt, par nøytralt, +1 amber, +2 eller verre
// murstein, DESIGN.md), og fargene er temaets, så sollys og mørk drakt følger
// med uten egen kode.
import type { ScoreTone } from '../../../../lib/scoring/scoreTone';
import type { ThemeColors } from '../theme';

/** Streken i formen for en tone. Uten score er den dempet. */
export function scoreToneColor(tone: ScoreTone, colors: ThemeColors): string {
  switch (tone) {
    case 'under':
      return colors.scoreUnderFg;
    case 'par':
      return colors.scoreParFg;
    case 'over1':
      return colors.scoreOver1Fg;
    case 'over2':
      return colors.scoreOver2Fg;
    default:
      return colors.muted;
  }
}
