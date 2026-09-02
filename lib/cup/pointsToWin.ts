/**
 * Poengmålet for en cup — hvor mange poeng et lag trenger for å vinne.
 *
 * Regelen er halvparten av de tilgjengelige poengene + 0,5: det laveste
 * antallet motstanderen ikke kan møte, selv om de tar alt som er igjen.
 * Én match = ett poeng, delt match = et halvt til hver.
 *
 * Målet utledes ved cup-start (#1142), ikke ved opprettelse: matchene
 * genereres i /generer mens cupen er draft, så antallet finnes rett og slett
 * ikke før start. Fram til da bærer `tournaments.points_to_win` NULL.
 *
 * Egen modul fordi `lib/cup/actions.ts` er `'use server'` — der er kun async
 * exports lov, og denne skal kunne testes direkte.
 */
export function derivePointsToWin(matchCount: number): number {
  return matchCount / 2 + 0.5;
}

/** Dagens 1/½-default (#1441, D8) — samme verdier som computeCupLeaderboard
 * faller tilbake til når en cup mangler win_points/tie_points.
 *
 * Eksportert i #1902: tre steder må nå defaulte en cup-rad som bærer NULL i
 * `win_points`/`tie_points` (startTournament, synk-helperen, og denne fila
 * selv). Tre litteral-par ville vært tre hjem for én regel
 * (AGENTS.md-felle 4). */
export const DEFAULT_WIN_POINTS = 1;
export const DEFAULT_TIE_POINTS = 0.5;

/**
 * Vektbar variant av `derivePointsToWin` (#1441, D8). Arrangøren av splittet
 * cup-dag setter egne poengvekter (denne dagen: seier 5, delt 2 til hvert
 * lag) — med den vektingen betaler en delt match MINDRE enn en seier, så
 * «halvparten av totalen» slutter å bety «det motstanderen ikke kan nå» (selve
 * poenget med formelen i `derivePointsToWin`). Løsningen er å ikke sette et
 * mål i det hele tatt: `points_to_win = NULL` skjuler «først til X»-UI-en, og
 * vinneren avgjøres ved `finishTournament` (som allerede takler NULL, #1142).
 *
 * Når vektene er nøyaktig standard (1 for seier, 0,5 for delt) delegeres til
 * `derivePointsToWin` uendret — eksisterende cuper oppfører seg identisk.
 *
 * Ren funksjon; F3b kaller denne fra `startTournament` (ikke denne fasen).
 */
export function derivePointsToWinWeighted(
  matchCount: number,
  winPoints: number,
  tiePoints: number,
): number | null {
  if (!hasDefaultCupWeights(winPoints, tiePoints)) return null;
  return derivePointsToWin(matchCount);
}

/**
 * Har cupen dagens 1/½-vekter — altså: gir den et «først til X» i det hele
 * tatt (#1441 D8)?
 *
 * Trukket ut i #1902 fordi svaret nå styrer to ting til: om arrangøren blir
 * spurt om planlagt antall kamper i uttaks-rommet, og om synk-helperen skal
 * skrive et mål. Uten ett hjem ville «avviker fra default» stått skrevet tre
 * steder og drevet fra hverandre (AGENTS.md-felle 4).
 */
export function hasDefaultCupWeights(winPoints: number, tiePoints: number): boolean {
  return winPoints === DEFAULT_WIN_POINTS && tiePoints === DEFAULT_TIE_POINTS;
}

/**
 * Effektiv total kamper for poengmålet (#1902).
 *
 * `points_to_win` ble satt én gang, ved start, fra de kampene som fantes
 * akkurat da. Kaptein-uttaket (#1884) åpner økt 2 og 3 MENS cupen er aktiv, så
 * en Ryder Cup som starter med 8 av 28 kamper fikk målet 4,5 — og et lag kunne
 * krones etter dag 1. Arrangøren oppgir derfor planlagt antall kamper totalt,
 * og målet regnes av det.
 *
 * Planlagt er et GULV, aldri et tak: blir det flere kamper enn planlagt,
 * flytter målet seg opp av seg selv (sikkerhetsnettet i eierbeslutningen).
 * Blir det færre, står målet der arrangøren satte det — et for høyt tall betyr
 * bare at ingen krones underveis og at `finishTournament` avgjør på poeng.
 *
 * `null` planlagt = ikke oppgitt → faktisk antall, bit for bit som før fiksen.
 * Det gjelder hver eneste cup uten kapteiner, og alle cuper fra før #1902.
 */
export function resolveCupMatchTotal(
  actualMatches: number,
  plannedMatchCount: number | null,
): number {
  return Math.max(actualMatches, plannedMatchCount ?? 0);
}

/**
 * Tullverdi-vakten på `tournaments.planned_match_count` — samme tall som
 * CHECK-en `tournaments_planned_match_count_range` i migrasjon 0173 (#1902).
 *
 * ⚠️ Dette er IKKE match-taket. Det ekte taket bor i ./limits.ts
 * (`MAX_PERSONAL_CUP_MATCHES`) og gjelder kun personlige cuper; klubb-cuper og
 * global admin er uncapped (#526). Denne grensa finnes bare for at en avsporet
 * tastetrykk-rekke ikke skal nå databasen — den ligger derfor godt over alt
 * noen kan finne på å arrangere.
 *
 * Endres den her, må CHECK-en endres i samme commit (AGENTS.md-felle 4);
 * avstemmingstesten i pointsToWin.test.ts leser migrasjonen og går rød ellers.
 */
export const MAX_PLANNED_MATCH_COUNT = 400;

/**
 * Parser arrangørens «planlagt antall kamper» fra uttaks-rommets tallfelt
 * (#1902).
 *
 * `floor` er det laveste tallet som gir mening akkurat nå: kampene cupen alt
 * har, pluss plassene i åpnede, ikke-avdekkede økter — aldri under 2, siden
 * `startTournament` nekter å starte en cup med færre. Et tall under gulvet er
 * en skrivefeil, ikke et ønske om å kutte kamper som alt er satt opp.
 *
 * Planlagt er et GULV for målet, aldri et tak for øktene: et tall HØYERE enn
 * gulvet er hele poenget (28 planlagt mens 3 er satt opp).
 *
 * Returnerer `null` for alt som ikke er et helt tall innenfor
 * `[floor, MAX_PLANNED_MATCH_COUNT]` — kalleren svarer da med feilkoden
 * `lineup_planned_total` og skriver ingenting.
 */
export function parsePlannedMatchCount(
  raw: string,
  floor: number,
): number | null {
  const cleaned = raw.trim();
  // Eksplisitt tom-sjekk FØR Number(): `Number('')` er 0, som er et helt tall
  // og ville sluppet gjennom som «arrangøren skrev null kamper».
  if (cleaned === '') return null;
  const n = Number(cleaned);
  if (!Number.isInteger(n)) return null;
  if (n < floor || n < 2) return null;
  if (n > MAX_PLANNED_MATCH_COUNT) return null;
  return n;
}

/**
 * Parser `tournaments.win_points` fra et form-felt (#1441, D8 — F3b sitt
 * ansvar, se `derivePointsToWinWeighted`s JSDoc). Tom streng → `undefined`
 * (kalleren utelater feltet fra inserten; DB-default 1 fra migrasjon 0153
 * gjelder da). Et tall som ikke tilfredsstiller CHECK-en (`win_points > 0`)
 * → `null` (valideringsfeil — kalleren redirecter til en feilkode).
 *
 * Speiler `parseAllowancePct` (./allowance.ts) sin tom/gyldig/ugyldig-
 * kontrakt, men uten en `defaultPct`-parameter: tomt felt her betyr «bruk
 * DB-default», ikke «bruk en konkret verdi appen fyller inn selv».
 */
export function parseWinPoints(raw: string): number | null | undefined {
  const cleaned = raw.trim();
  if (cleaned === '') return undefined;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * Parser `tournaments.tie_points` (#1441, D8). Samme
 * tom/gyldig/ugyldig-kontrakt som `parseWinPoints`, men CHECK-en er
 * `tie_points >= 0` (en delt match kan lovlig gi null poeng, i motsetning
 * til en seier).
 */
export function parseTiePoints(raw: string): number | null | undefined {
  const cleaned = raw.trim();
  if (cleaned === '') return undefined;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}
