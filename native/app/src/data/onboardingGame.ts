// native/app/src/data/onboardingGame.ts
// #2216: spillet på kortet «… venter på deg» i «Fullfør profilen».
//
// Nettsiden (#2350) viser spillet du kom fra (`next=/games/<id>`). Appen har
// ingen `next`, så regelen er det nærmeste spillet du står på: et pågående
// foran et planlagt, og blant de planlagte tidligste start. For en ny invitert
// er det spillet invitasjonen gjaldt, for `finishLogin` har nettopp satt deg
// på lista. Står du ikke på noe spill, vises ikke kortet.
//
// Lest med appens egen klient, altså under RLS som spilleren selv. Spørringen
// er best-effort: kortet er pynt på et steg som skal virke uten det, så en
// feil gir «ingen kort» og en linje i loggen.
import { supabase } from '../supabase';
import {
  ONBOARDING_GAME_STATUSES,
  isOnboardingGameOpen,
} from '../../../../lib/games/onboardingGame';

/** Det kortet viser. */
export interface OnboardingGame {
  gameId: string;
  name: string;
  courseName: string | null;
  teeOffAt: string | null;
  gameMode: string;
}

/** Én rad fra spørringen under. Eksportert for testen av regelen. */
export interface OnboardingGameRow {
  withdrawn_at: string | null;
  games: {
    id: string;
    name: string;
    status: string;
    game_mode: string;
    scheduled_tee_off_at: string | null;
    courses: { name: string } | null;
  };
}

/**
 * Spillet kortet skal vise, eller `null`. Ren funksjon: regelen står her og
 * testes her, spørringen under bare henter radene.
 */
export function pickOnboardingGame(rows: readonly OnboardingGameRow[]): OnboardingGame | null {
  // Regelen har ett hjem på nettsiden (`lib/games/onboardingGame.ts`, #2350).
  // Raden har ingen `source_game_id`: `fetchOnboardingGame` filtrerer alt
  // `.is('games.source_game_id', null)` på serveren, så `null` er sant her.
  const open = rows.filter((row) =>
    isOnboardingGameOpen({
      withdrawn_at: row.withdrawn_at,
      status: row.games.status,
      source_game_id: null,
    }),
  );
  if (open.length === 0) return null;

  const byTeeOff = (a: OnboardingGameRow, b: OnboardingGameRow) => {
    const ta = a.games.scheduled_tee_off_at;
    const tb = b.games.scheduled_tee_off_at;
    if (ta === tb) return 0;
    if (ta === null) return 1;
    if (tb === null) return -1;
    return ta < tb ? -1 : 1;
  };
  const active = open.filter((row) => row.games.status === 'active').sort(byTeeOff);
  const scheduled = open.filter((row) => row.games.status === 'scheduled').sort(byTeeOff);
  const pick = active[0] ?? scheduled[0];

  return {
    gameId: pick.games.id,
    name: pick.games.name,
    courseName: pick.games.courses?.name ?? null,
    teeOffAt: pick.games.scheduled_tee_off_at,
    gameMode: pick.games.game_mode,
  };
}

const SELECT =
  'withdrawn_at, games!inner(id, name, status, game_mode, scheduled_tee_off_at, courses(name))';

/** Hent spillet til kortet. Kaster aldri; en feil gir `null`. */
export async function fetchOnboardingGame(userId: string): Promise<OnboardingGame | null> {
  try {
    const { data, error } = await supabase
      .from('game_players')
      .select(SELECT)
      .eq('user_id', userId)
      .is('withdrawn_at', null)
      .in('games.status', ONBOARDING_GAME_STATUSES)
      .is('games.source_game_id', null)
      .returns<OnboardingGameRow[]>();
    if (error) {
      console.error('[onboardingGame] henting feilet', error.message);
      return null;
    }
    return pickOnboardingGame(data ?? []);
  } catch (err) {
    console.error('[onboardingGame] henting kastet', err);
    return null;
  }
}
