import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { formatPublicName } from '@/lib/names/formatPublicName';
import { getFriendIds } from '@/lib/friends/getFriendIds';
import { buildSocialProof, type GameSocialProof } from './socialProof';

export type { GameSocialProof } from './socialProof';

/**
 * Sosialt-bevis-resolver for join-funnelen (#1193). Gitt ett eller flere spill
 * + den besøkende, returnerer et ekte påmeldings-antall og — kun for innloggede
 * med gjensidige venner påmeldt — capped venne-navn. Batch-formen gjør ÉN
 * roster-spørring + ÉN venne-oppslag for hele lista (Finn turneringer).
 *
 * Admin-client fordi anonyme/ikke-medlemmer ikke har RLS-lesetilgang til
 * `game_players` — sikkerhetsgrensen er SELECT-listen (kun `user_id` +
 * navn/kallenavn) OG at ingenting råttent forlater helperen: bruker-idene og
 * den rå vennelista brukes bare til skjæring serverside, og kun `joinedCount`
 * + ferdig-formaterte navn returneres (samme grense som `getPublicSignupRoster`
 * / felt-whitelisten #1022). Best-effort: query-feil → tomt/nøytralt signal.
 */

type RosterRow = {
  game_id: string;
  user_id: string;
  users: { name: string | null; nickname: string | null } | null;
};

const EMPTY_PROOF: GameSocialProof = {
  joinedCount: 0,
  knownFriendNames: [],
  knownFriendOverflow: 0,
};

/**
 * Batch-oppslag: `gameId → GameSocialProof` for alle oppgitte spill. Spill uten
 * treff (eller ved feil) faller ut av kartet — kalleren bruker `?? EMPTY`.
 */
export async function getGamesSocialProof(
  gameIds: readonly string[],
  viewerUserId: string | null,
): Promise<Record<string, GameSocialProof>> {
  const uniqueIds = [...new Set(gameIds)].filter((id) => id.length > 0);
  if (uniqueIds.length === 0) return {};

  const admin = getAdminClient();
  const { data, error } = await admin
    .from('game_players')
    .select('game_id, user_id, users!game_players_user_id_fkey(name, nickname)')
    .in('game_id', uniqueIds)
    .is('withdrawn_at', null);

  if (error || !data) {
    if (error) console.error('[getGamesSocialProof] roster lookup failed', error);
    return {};
  }

  // Venne-oppslaget skjer én gang for hele batchen, og kun for innloggede.
  const friendSet = new Set(viewerUserId ? await getFriendIds(viewerUserId) : []);

  const rows = data as unknown as RosterRow[];
  const byGame = new Map<string, RosterRow[]>();
  for (const r of rows) {
    const arr = byGame.get(r.game_id);
    if (arr) arr.push(r);
    else byGame.set(r.game_id, [r]);
  }

  const result: Record<string, GameSocialProof> = {};
  for (const id of uniqueIds) {
    const gameRows = byGame.get(id) ?? [];
    const nameById = new Map<string, string | null>();
    for (const r of gameRows) {
      nameById.set(r.user_id, r.users ? formatPublicName(r.users) : null);
    }
    result[id] = buildSocialProof(
      gameRows.map((r) => r.user_id),
      friendSet,
      viewerUserId,
      (uid) => nameById.get(uid) ?? null,
    );
  }
  return result;
}

/** Enkelt-spill-form — tynt skall rundt {@link getGamesSocialProof}. */
export async function getGameSocialProof(
  gameId: string,
  viewerUserId: string | null,
): Promise<GameSocialProof> {
  const map = await getGamesSocialProof([gameId], viewerUserId);
  return map[gameId] ?? EMPTY_PROOF;
}
