import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { isRosterLocked } from '@/lib/games/status';
import type { GameModeConfig } from '@/lib/scoring/modes/types';

/**
 * Kontekst-oppslag for `/login?invite=<token>` (#1169): gitt en invitasjons-
 * token, returner turneringskonteksten kortet over kodeskjemaet skal vise.
 * Bruker admin-client fordi den besøkende er uautentisert (anon har ingen
 * RLS-lesetilgang til `invitations`/`games`) — felt-whitelisten under er
 * sikkerhetsgrensen, samme mønster som `getGameByShortId`.
 *
 * Token er ren VISNINGS-capability: den logger ingen inn og konsumeres ikke.
 * Innholdet er begrenset til det mottakeren allerede vet fra mailen pluss
 * plakat-nivå (bane, tee, tee-off, format) — aldri roster, premier, e-poster
 * eller hcp.
 *
 * Fail-closed: ugyldig/utløpt/akseptert token, token uten game_id, en runde
 * som har startet eller er ferdig (#2212 — innloggingen gir ikke lenger plass,
 * så kortet ville lovet noe som ikke stemmer), eller DB-feil → null. Siden
 * rendres da nøyaktig som uten `?invite=` — aldri 500.
 */

export type InviteLoginContext = {
  /** Spill-id for aggregert sosialt bevis (#1193). Aldri navn til anonyme. */
  gameId: string;
  inviterName: string | null;
  gameName: string;
  gameMode: string;
  /** Format name and rule on the invitation card (#2266). */
  modeConfig: GameModeConfig;
  courseName: string | null;
  /** «{tee} tee» on the card; null when the game has no tee box (0011). */
  teeName: string | null;
  teeOffAt: string | null;
  /** Driver frist-linja på invitasjonskortet (#1179) via inviteExpiryTier på /login. */
  expiresAt: string;
};

type InviteContextRow = {
  expires_at: string;
  inviter: { name: string | null; nickname: string | null } | null;
  games: {
    id: string;
    name: string;
    game_mode: string;
    mode_config: GameModeConfig;
    scheduled_tee_off_at: string | null;
    status: string;
    courses: { name: string } | null;
    tee_box: { name: string } | null;
  } | null;
};

/**
 * Alle invitasjons-tokens skrives med `randomUUID()`, så alt annet er
 * garantert miss — avvis før DB-runden. Delt hjem for regelen: både
 * login-siden og `sendCode`-videreføringen gater på denne.
 */
const INVITE_TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isInviteToken(value: string): boolean {
  return INVITE_TOKEN_RE.test(value);
}

export async function getInviteLoginContext(
  token: string,
): Promise<InviteLoginContext | null> {
  if (!isInviteToken(token)) return null;

  try {
    const admin = getAdminClient();
    const { data, error } = await admin
      .from('invitations')
      .select(
        'expires_at, inviter:users!invitations_invited_by_fkey(name, nickname), games:game_id(id, name, game_mode, mode_config, scheduled_tee_off_at, status, courses(name), tee_box:tee_boxes!games_tee_box_id_fkey(name))',
      )
      .eq('token', token)
      .is('accepted_at', null)
      .not('game_id', 'is', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle<InviteContextRow>();

    if (error) {
      console.error('[getInviteLoginContext] lookup failed', error);
      return null;
    }
    if (!data?.games) return null;
    if (isRosterLocked(data.games.status)) return null;

    const inviterName =
      data.inviter?.name?.trim() || data.inviter?.nickname?.trim() || null;

    return {
      gameId: data.games.id,
      inviterName,
      gameName: data.games.name,
      gameMode: data.games.game_mode,
      modeConfig: data.games.mode_config,
      courseName: data.games.courses?.name ?? null,
      teeName: data.games.tee_box?.name ?? null,
      teeOffAt: data.games.scheduled_tee_off_at,
      expiresAt: data.expires_at,
    };
  } catch (err) {
    console.error('[getInviteLoginContext] lookup threw', err);
    return null;
  }
}
