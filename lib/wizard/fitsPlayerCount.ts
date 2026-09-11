/**
 * fitsPlayerCount — predikat for om et format kan spilles av n spillere.
 *
 * Reglene er utledet fra valideringslogikken i `useGameFormState.ts` og
 * `lib/games/gamePayload.ts`. Single source of truth for wizard-filtreringen
 * (steg 2, Kompis-intent). Ingen UI-avhengigheter — ren logikk.
 *
 * Design-regler:
 *  - Returnerer true hvis DET FINNES ÉN GYLDIG konfigurasjon for antallet.
 *    Eksempel: stableford passer n=2 fordi par-stableford (team_size=2)
 *    er gyldig; det passer også n=1 fordi solo-stableford (team_size=1)
 *    er gyldig.
 *  - Ukjente GameMode-verdier (f.eks. fremtidige formater) gir true
 *    (permissivt) — bedre å vise et format som muligens ikke passer enn å
 *    skjule et som gjør det.
 *  - n=0 gir alltid false.
 */

import type { GameMode } from '@/lib/scoring/modes/types';
import { fitsTeamFormat } from '@/lib/games/teamFormatLimits';

export function fitsPlayerCount(gameMode: GameMode, n: number): boolean {
  if (n <= 0) return false;

  switch (gameMode) {
    // ── 1+ (solo ELLER par/lag-konfiguration finnes) ────────────────────────
    case 'stableford':
    case 'modified_stableford':
    case 'solo_strokeplay':
      return n >= 1;

    // ── Nøyaktig 2 ──────────────────────────────────────────────────────────
    case 'singles_matchplay':
      return n === 2;

    // ── Partall 2–8 (#374: best ball støtter nå 2/4/6/8 spillere) ───────────
    case 'best_ball':
      return n >= 2 && n <= 8 && n % 2 === 0;

    // ── Scramble-familien: krever ≥2 lag for å være en turnering (#467) ─────
    // En scramble er et lag-format. Ett lag er ingen konkurranse, så
    // antall-filteret i Kompis skjuler oppsett med bare ett lag.
    //
    // Lagstørrelsene og taket eies av `lib/games/teamFormatLimits.ts` (#2009):
    // texas/ambrose 2–4 per lag, florida/shamble 3–4, alltid 2–4 lag. Byggbare
    // størrelser er dermed alt fra 4 (2 lag à 2) til 16 (4 lag à 4) som går opp
    // i en støttet lagstørrelse.
    case 'texas_scramble':
    case 'ambrose':
    case 'florida_scramble':
      return fitsTeamFormat(gameMode, n);

    // ── 3–5 (#465: Wolf har ekte 3- og 5-spiller-varianter) ─────────────────
    case 'wolf':
      return n >= 3 && n <= 5;

    // ── Nøyaktig 4 ──────────────────────────────────────────────────────────
    case 'round_robin':
    case 'acey_deucey':
    case 'fourball_matchplay':
    case 'foursomes_matchplay':
    case 'greensome_matchplay':
    case 'chapman_matchplay':
    case 'gruesome_matchplay':
      return n === 4;

    // ── 2–16 (solo-format med carryover/segment-konkurranse) (#460) ─────────
    // Antalls-agnostiske individuelle format: hver spiller konkurrerer i sin
    // egen pott (skins-carryover, nassau-segment, BBB-poeng). 4-grensen var
    // kunstig; 16 er den nye øvre grensen (slot-emisjon er dynamisk).
    case 'nassau':
    case 'skins':
    case 'bingo_bango_bongo':
      return n >= 2 && n <= 16;

    // ── Nøyaktig 3 ──────────────────────────────────────────────────────────
    case 'nines':
      return n === 3;

    // ── shamble: krever ≥2 lag (lag på 3 eller 4) (#469) ────────────────────
    // Samme scramble-familie-prinsipp som #467: ett lag er ingen turnering.
    // Grensene leses fra `teamFormatLimits` som for resten av familien (#2009).
    case 'shamble':
      return fitsTeamFormat(gameMode, n);

    // ── Partall 4+ (lag à 2, minst 2 lag) ───────────────────────────────────
    case 'patsome':
      return n >= 4 && n % 2 === 0;

    // ── Permissivt fallback for fremtidige GameMode-verdier ─────────────────
    // Bevisst IKKE en exhaustiveness-/never-sjekk: GameMode-unionen vokser
    // ofte (nye formater), og de fleste nye modusene er ikke i Kompis-
    // katalogen. En never-assertion her ville brutt Vercel-bygget hver gang
    // en ny GameMode ble lagt til. Permissivt default (true) holder filteret
    // trygt — vi viser heller et format som muligens ikke passer enn å skjule
    // ett som gjør det. Legg til en eksplisitt case over når et nytt Kompis-
    // format har en streng antalls-regel.
    default:
      return true;
  }
}

/**
 * soloPlayerCap — øvre spillertak for solo-formater som har en hard grense.
 *
 * Brukes av selv-påmeldings-action-en (`registerForOpenGame`) for å avvise
 * en N+1-spiller FØR INSERT, slik at publisering aldri blokkeres av
 * `too_many_players_for_mode` fra `buildInsertPayload`.
 *
 * Returnerer:
 *  - tallet maksimale spillere for formater med et øvre tak
 *  - `null` for formater uten relevant tak (unbounded, lag-format, matchplay-
 *    familien — disse har egne side-cap-logikker eller team_size-validering)
 *
 * Verdiene speiler `fitsPlayerCount`-logikken:
 *  - wolf → 5 (støtter 3–5 spillere)
 *  - nines → 3 (nøyaktig 3)
 *  - round_robin → 4 (nøyaktig 4)
 *  - acey_deucey → 4 (nøyaktig 4)
 *  - nassau / skins / bingo_bango_bongo → 16 (#460: utvidet fra 4)
 *
 * Matchplay-familien ekskluderes bevisst — side-kapasitet håndteres av
 * `isMatchplayMode` + den eksisterende tellingen i `registerForOpenGame`.
 */
export function soloPlayerCap(gameMode: GameMode): number | null {
  switch (gameMode) {
    case 'wolf':
      return 5;
    case 'nines':
      return 3;
    case 'round_robin':
    case 'acey_deucey':
      return 4;
    case 'nassau':
    case 'skins':
    case 'bingo_bango_bongo':
      return 16;
    default:
      return null;
  }
}
