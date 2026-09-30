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
//  2. **Polling, ikke realtime.** Da appen ble bygget (#1832) sto
//     `wolf_hole_choices` og `bingo_bango_bongo_holes` ikke i
//     `supabase_realtime`-publikasjonen, så en `postgres_changes`-binding
//     ville levert ingenting. Migrasjon 0175 (#1836) legger dem inn; appen
//     poller likevel til en realtime-oppgradering får sin egen kontrakt.
//     Intervallet går bare mens skjermen har fokus.
//  3. **Siste vellykkede henting blir stående.** En feilet refetch tømmer
//     ingenting — gammelt er bedre enn borte. Men har INGEN henting lyktes,
//     står svaret tomt, og adapteren sier `missing-choices` i stedet for å
//     bygge en tabell der hvert hull står uavgjort (`ScoringExtras`).
//
// Hooken gir også `refresh` tilbake: hull-skjermen skriver valg, og da skal
// badgen stå riktig med en gang — ikke etter opptil ti sekunder. Det er samme
// henting som pollingen kjører, ikke en ny vei inn i tabellen.
//
// Nyeste henting vinner (#2094): en poll kan gå ut før lagringen og svare
// etter hentingen lagringen utløste. Hver henting får et løpenummer når den
// går ut, og et svar brukes bare hvis ingen senere henting alt har landet.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { fetchBingoBangoBongoHoles, fetchWolfChoices } from '../data/choices';
import { choiceSourceFor } from './choiceSource';
import type { ScoringExtras } from './scoringContext';

/**
 * Nøkternt intervall. Valgene endrer seg noen få ganger per hull, av en
 * medspiller som står ved siden av deg — ikke noe som krever leaderboardets
 * takt. Den pollingen leser SQLite (gratis); denne går på nettet.
 */
export const CHOICES_POLL_MS = 10_000;

export { choiceSourceFor, choicesNotYetHere, type ChoiceSource } from './choiceSource';

export interface GameChoices {
  /** Klar til å tres rett inn i `computeGameLeaderboard`. */
  extras: ScoringExtras;
  /** Hent på nytt nå — brukes rett etter at skjermen selv har skrevet et valg. */
  refresh: () => Promise<void>;
  /**
   * Siste henting feilet, og ingen henting har lyktes ennå (#2255 PR 3b). Da
   * kommer valgene ikke av seg selv, og skjermen skal si fra i stedet for å
   * vente. Med et tidligere svar står det svaret, og dette er `false`.
   */
  failed: boolean;
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
  /**
   * `null` = et avsluttet spill, som ikke endres: prøv igjen med vanlig
   * intervall bare til første svar er kommet, så stopp (uten nett ved åpning
   * henter skjermen fortsatt av seg selv når nettet er tilbake).
   */
  pollMs: number | null = CHOICES_POLL_MS,
): GameChoices {
  const source = choiceSourceFor(gameMode);
  const [extras, setExtras] = useState<ScoringExtras>({});
  const [failed, setFailed] = useState(false);

  // Skjermen kan forsvinne mens en spørring er i lufta; da skal svaret falle
  // på gulvet i stedet for å lande i en avmontert komponent.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const seq = useRef(0);
  const appliedSeq = useRef(0);

  const refresh = useCallback(async () => {
    if (source === null) return;
    const mySeq = ++seq.current;
    try {
      const next: ScoringExtras =
        source === 'wolf'
          ? { wolfChoices: await fetchWolfChoices(gameId) }
          : { bingoBangoBongoHoles: await fetchBingoBangoBongoHoles(gameId) };
      if (!alive.current || mySeq <= appliedSeq.current) return;
      appliedSeq.current = mySeq;
      setExtras(next);
      setFailed(false);
    } catch {
      // Fetch-en KASTER ved feil nettopp så den ikke kan forveksles med en tom
      // liste. Vi lar forrige svar stå; har vi ikke noe, sier skjermen fra.
      if (alive.current && appliedSeq.current === 0) setFailed(true);
    }
  }, [gameId, source]);

  useFocusEffect(
    useCallback(() => {
      if (source === null) return;
      void refresh();
      const interval = setInterval(() => {
        if (pollMs === null && appliedSeq.current > 0) return;
        void refresh();
      }, pollMs ?? CHOICES_POLL_MS);
      return () => clearInterval(interval);
    }, [pollMs, refresh, source]),
  );

  return { extras, refresh, failed };
}
