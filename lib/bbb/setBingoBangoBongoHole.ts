'use server';

import { revalidateTag } from 'next/cache';
import {
  bingoBangoBongoCategoryColumn,
  isBingoBangoBongoCategoryKey,
  type BingoBangoBongoCategoryKey,
} from '@/lib/bbb/mergeBingoBangoBongoCategory';
import type { Database } from '@/lib/database.types';
import { getServerClient } from '@/lib/supabase/server';

type BingoBangoBongoHoleInsert =
  Database['public']['Tables']['bingo_bango_bongo_holes']['Insert'];

export type SetBingoBangoBongoHoleResult =
  | { ok: true }
  | { ok: false; error: SetBingoBangoBongoHoleError };

export type SetBingoBangoBongoHoleError =
  | 'not_authenticated'
  | 'invalid_hole'
  // #1950: `key` is not one of the three categories — an unknown value, or an
  // old client that still sends the whole row — or `userId` is neither null nor
  // a user id. Refused before the DB so it can never write NULLs over a
  // flight-mate's category, nor a row without the category while answering ok.
  | 'invalid_category'
  | 'game_not_found'
  | 'game_finished'
  | 'rls_denied'
  // #1445: transient DB failure on the game lookup — «prøv igjen», not
  // «spillet finnes ikke». BingoBangoBongoEntry renders every non-ok code
  // through the same generic `saveFailed`-melding, so no i18n key is needed.
  | 'db_error';

export interface SetBingoBangoBongoHoleInput {
  gameId: string;
  holeNumber: number;
  /** Kategorien som ble trykket. Bare dens kolonne skrives (#1950). */
  key: BingoBangoBongoCategoryKey;
  /** Mottakeren, eller null når kategorien tømmes («Ingen»). */
  userId: string | null;
}

/**
 * Server-action for å lagre ÉN Bingo Bango Bongo-kategori for ett hull.
 *
 * Delt registrering: alle flight-spillere kan sette/endre raden. RLS-policyen
 * `bbb_holes_write` håndhever dette. Vi sjekker auth her for en tydelig
 * feilkode istedenfor en cryptic Postgres-RLS-feil.
 *
 * Én kategori per kall (#1950): payloaden har bare den trykte kategoriens
 * kolonne pluss `entered_by`, og PostgREST sin ON CONFLICT DO UPDATE setter
 * bare kolonnene i payloaden. To i flighten som registrerer ulike kategorier på
 * samme hull samtidig beholder derfor begge. Første registrering på et hull
 * lager raden med de to andre kategoriene NULL.
 *
 * Forretningsregler:
 *  - hole_number 1..18
 *  - `key` må være en av de tre kategoriene (hvitliste, aldri kolonnenavn fra
 *    klienten)
 *  - Krever autentisert bruker
 *  - Lås ved `games.status === 'finished'` (per kontrakt §5 og §Edge Cases)
 *  - `userId` er nullable: null tømmer kategorien, ellers en ikke-tom streng
 *
 * Etter upsert: revaliderer `game-${gameId}`-tagen så alle cache-konsumenter
 * (getBingoBangoBongoHoles, getGameWithPlayers, scoring) henter fresh data ved
 * neste request.
 *
 * entered_by settes alltid til auth.uid() (audit-spor — hvem som tastet sist).
 */
export async function setBingoBangoBongoHole(
  input: SetBingoBangoBongoHoleInput,
): Promise<SetBingoBangoBongoHoleResult> {
  const { gameId, holeNumber, key, userId } = input;

  if (!Number.isInteger(holeNumber) || holeNumber < 1 || holeNumber > 18) {
    return { ok: false, error: 'invalid_hole' };
  }

  if (!isBingoBangoBongoCategoryKey(key)) {
    return { ok: false, error: 'invalid_category' };
  }

  // The recipient lands in that one column. Anything but null or a user id (a
  // missing field, a number) would build `{ <column>: undefined }`, JSON drops
  // it, and the upsert would write a row without the category yet answer ok.
  // An empty string is refused too: both clients send a player's uuid or null.
  if (userId !== null && (typeof userId !== 'string' || userId === '')) {
    return { ok: false, error: 'invalid_category' };
  }

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: 'not_authenticated' };
  }

  // Lås ved finished — BBB-prestasjoner skal ikke endres etter spillet er avsluttet.
  // Speiler setFoursomesTeeStarter-mønstret (foursomesActions.ts).
  const gameRow = await supabase
    .from('games')
    .select('status')
    .eq('id', gameId)
    .maybeSingle();

  // Error ≠ absence (#1445): only a genuine 0-row result (maybeSingle: data
  // null, error null) means the game is gone. A transient query failure gets
  // its own code so the entry sheet says «prøv igjen» mid-round.
  if (gameRow.error) {
    console.error('[setBingoBangoBongoHole] game lookup failed', {
      gameId,
      error: gameRow.error,
    });
    return { ok: false, error: 'db_error' };
  }
  if (!gameRow.data) {
    return { ok: false, error: 'game_not_found' };
  }
  if (gameRow.data.status === 'finished') {
    return { ok: false, error: 'game_finished' };
  }

  // Upsert på (game_id, hole_number) — primary key på tabellen. Bare den ene
  // kategoriens kolonne er med; de to andre står urørt i en eksisterende rad.
  const row: BingoBangoBongoHoleInsert = {
    game_id: gameId,
    hole_number: holeNumber,
    ...bingoBangoBongoCategoryColumn(key, userId),
    entered_by: user.id,
  };
  const { error } = await supabase
    .from('bingo_bango_bongo_holes')
    .upsert(row, { onConflict: 'game_id,hole_number' });

  if (error) {
    console.error('[setBingoBangoBongoHole] upsert failed', { input, error });
    // RLS-feil og constraint-violations rapporteres alle som rls_denied
    // til UI — fra brukerens perspektiv er det "du har ikke lov til dette".
    return { ok: false, error: 'rls_denied' };
  }

  revalidateTag(`game-${gameId}`, 'max');
  return { ok: true };
}
