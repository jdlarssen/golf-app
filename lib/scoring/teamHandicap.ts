// Lag-handicapet i scramble-familien (Texas, Ambrose, Florida), per lag (#2569).
//
// `mode_config.team_handicap_pct` er prosent av SUMMEN av lagets banehandicap,
// regnet for `mode_config.team_size` (#2009, #2566). Arrangøren tenker i
// prosent av lagets SNITT, og det tallet skal gjelde alle lag i spillet. Når
// et lag har én spiller mindre (forfall, eller 11 påmeldte i et 4-mannsspill),
// er summen mindre, men snittet er det samme. Prosenten av summen skaleres
// derfor med konfigurert ÷ faktisk størrelse:
//
//   prosent av snitt = sumPct × konfigurert
//   lag-HCP          = round(sum × sumPct × konfigurert ÷ (faktisk × 100))
//
// Eksempel: 80 % av snittet i et 4-mannsspill er lagret som 20. Laget på 3 med
// 10/20/30 har snitt 20 og får 16, ikke 12.
//
// Fullt lag gir nøyaktig det gamle uttrykket, så jevne lag er bit-like med før.
// Texas' NGF-tabell (15 % av summen à 3) byttes IKKE inn for det korte laget:
// det får arrangørens prosent av snittet, som alle andre lag.
//
// Motoren (`computeScramble`), scorekortet og hullsiden leser alle herfra.

/**
 * Lagets handicap i scramble-familien. `sumPct` er lagret prosent av summen
 * for `configuredTeamSize`; `actualTeamSize` er hvor mange laget faktisk har.
 */
export function scrambleTeamHandicap(
  combinedCourseHandicap: number,
  sumPct: number,
  configuredTeamSize: number,
  actualTeamSize: number,
): number {
  if (actualTeamSize <= 0) return 0;
  if (
    actualTeamSize === configuredTeamSize ||
    !Number.isInteger(configuredTeamSize) ||
    configuredTeamSize <= 0
  ) {
    return Math.round((combinedCourseHandicap * sumPct) / 100);
  }
  return Math.round(
    (combinedCourseHandicap * sumPct * configuredTeamSize) / (actualTeamSize * 100),
  );
}
