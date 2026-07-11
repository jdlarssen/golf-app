import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';

/**
 * Kontekst-oppslag for `/login?invite=<token>` (#1169): gitt en invitasjons-
 * token, returner turneringskonteksten kortet over kodeskjemaet skal vise.
 * Bruker admin-client fordi den besøkende er uautentisert (anon har ingen
 * RLS-lesetilgang til `invitations`/`games`) — felt-whitelisten under er
 * sikkerhetsgrensen, samme mønster som `getGameByShortId`.
 *
 * Token er ren VISNINGS-capability: den logger ingen inn og konsumeres ikke.
 * Innholdet er begrenset til det mottakeren allerede vet fra mailen pluss
 * plakat-nivå (bane/tee-off) — aldri roster, premier, e-poster eller hcp.
 *
 * Fail-closed: ugyldig/utløpt/akseptert token, token uten game_id, eller
 * DB-feil → null. Siden rendres da nøyaktig som uten `?invite=` — aldri 500.
 */

export type InviteLoginContext = {
  /** Spill-id for aggregert sosialt bevis (#1193). Aldri navn til anonyme. */
  gameId: string;
  inviterName: string | null;
  gameName: string;
  gameMode: string;
  courseName: string | null;
  teeOffAt: string | null;
  /** Med i retur-typen for frist-linja (#1179) — vises ikke på kortet ennå. */
  expiresAt: string;
};

type InviteContextRow = {
  expires_at: string;
  inviter: { name: string | null; nickname: string | null } | null;
  games: {
    id: string;
    name: string;
    game_mode: string;
    scheduled_tee_off_at: string | null;
    courses: { name: string } | null;
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
        'expires_at, inviter:users!invitations_invited_by_fkey(name, nickname), games:game_id(id, name, game_mode, scheduled_tee_off_at, courses(name))',
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

    const inviterName =
      data.inviter?.name?.trim() || data.inviter?.nickname?.trim() || null;

    return {
      gameId: data.games.id,
      inviterName,
      gameName: data.games.name,
      gameMode: data.games.game_mode,
      courseName: data.games.courses?.name ?? null,
      teeOffAt: data.games.scheduled_tee_off_at,
      expiresAt: data.expires_at,
    };
  } catch (err) {
    console.error('[getInviteLoginContext] lookup threw', err);
    return null;
  }
}
