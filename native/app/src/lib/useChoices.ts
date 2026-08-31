// Native (#1832): wolf-/BBB-valgene inn i skjermene.
//
// Alle andre skjermdata er lokale — bundelen fra `cache_entries`, slagene fra
// SQLite. Valgene er det ene unntaket: de bor bare på serveren (ikke i
// sync-køen, ikke i SQLite), så dette er et ekte nettkall midt i en runde.
// Tre valg følger av det:
//
//  1. **Kun for de to formatene som trenger dem.** `choiceSourceFor` svarer
//     `null` for de elleve andre, og da fyrer hooken ingen spørring i det hele
//     tatt. En leaderboard-skjerm for et stableford-spill skal ikke koste et
//     nettkall hvert tiende sekund.
//  2. **Polling, ikke realtime.** `wolf_hole_choices` og
//     `bingo_bango_bongo_holes` står ikke i `supabase_realtime`-publikasjonen
//     (verifisert mot staging og prod), så en `postgres_changes`-binding ville
//     levert ingenting. Intervallet går bare mens skjermen har fokus.
//  3. **Siste vellykkede henting blir stående.** En feilet refetch tømmer
//     ingenting — gammelt er bedre enn borte. Men har INGEN henting lyktes,
//     står svaret tomt, og adapteren sier `missing-choices` i stedet for å
//     bygge en tabell der hvert hull står uavgjort (`ScoringExtras`).
//
// Hooken gir også `refresh` tilbake: hull-skjermen skriver valg, og da skal
// badgen stå riktig med en gang — ikke etter opptil ti sekunder. Det er samme
// henting som pollingen kjører, ikke en ny vei inn i tabellen.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { fetchBingoBangoBongoHoles, fetchWolfChoices } from '../data/choices';
import type { ScoringExtras } from './scoringContext';

/**
 * Nøkternt intervall. Valgene endrer seg noen få ganger per hull, av en
 * medspiller som står ved siden av deg — ikke noe som krever leaderboardets
 * takt. Den pollingen leser SQLite (gratis); denne går på nettet.
 */
export const CHOICES_POLL_MS = 10_000;

/** Hvilken valg-tabell formatet henter halve regnestykket sitt fra. */
export type ChoiceSource = 'wolf' | 'bingo_bango_bongo';

/**
 * Valg-kilden formatet trenger, eller `null` når det ikke trenger noen.
 *
 * Skrevet som et oppslag på `game_mode` og ikke utledet fra noe delt predikat:
 * «henter poeng fra en egen per-hull-tabell» er ikke et begrep motoren har, og
 * en gate som lot som den fulgte et delt begrep ville drevet fra det.
 */
export function choiceSourceFor(gameMode: string): ChoiceSource | null {
  if (gameMode === 'wolf') return 'wolf';
  if (gameMode === 'bingo_bango_bongo') return 'bingo_bango_bongo';
  return null;
}

export interface GameChoices {
  /** Klar til å tres rett inn i `computeGameLeaderboard`. */
  extras: ScoringExtras;
  /** Hent på nytt nå — brukes rett etter at skjermen selv har skrevet et valg. */
  refresh: () => Promise<void>;
}

/**
 * Valgene for spillet, hentet ved fokus og på intervall mens skjermen står
 * åpen.
 *
 * `extras` er et tomt objekt både når «formatet trenger ingen valg» og når
 * «ingen henting har lyktes ennå» — adapteren skiller de to på `game_mode`, så
 * kalleren trenger ikke.
 */
export function useGameChoices(
  gameId: string,
  gameMode: string,
  pollMs: number = CHOICES_POLL_MS,
): GameChoices {
  const source = choiceSourceFor(gameMode);
  const [extras, setExtras] = useState<ScoringExtras>({});

  // Skjermen kan forsvinne mens en spørring er i lufta; da skal svaret falle
  // på gulvet i stedet for å lande i en avmontert komponent.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (source === null) return;
    try {
      const next: ScoringExtras =
        source === 'wolf'
          ? { wolfChoices: await fetchWolfChoices(gameId) }
          : { bingoBangoBongoHoles: await fetchBingoBangoBongoHoles(gameId) };
      if (alive.current) setExtras(next);
    } catch {
      // Fetch-en KASTER ved feil nettopp så den ikke kan forveksles med en tom
      // liste. Vi lar forrige svar stå; har vi ikke noe, sier skjermen fra.
    }
  }, [gameId, source]);

  useFocusEffect(
    useCallback(() => {
      if (source === null) return;
      void refresh();
      const interval = setInterval(() => {
        void refresh();
      }, pollMs);
      return () => clearInterval(interval);
    }, [pollMs, refresh, source]),
  );

  return { extras, refresh };
}
