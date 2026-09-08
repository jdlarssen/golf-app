import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { CupJoinReadError, type CupJoinReadName } from './cupJoinErrors';
import type { CupJoinFacts } from './joinValidation';

/**
 * Samler faktaene `evaluateCupJoin`/`evaluateCupLeave` trenger for én spiller og
 * én delbar påmeldingslenke (#1490).
 *
 * Delt av BEGGE call-sites: siden (`/cup/bli-med/[shortId]`) som velger hvilken
 * tilstand den rendrer, og server-actionene som avviser før de skriver. Ett hjem
 * for lesingen betyr at knappen aldri kan vises på et grunnlag actionen ikke
 * kjenner igjen (AGENTS.md-felle 4).
 *
 * Leses med service-role: en ikke-medlem kan hverken se en klubb-cup (RLS 0089)
 * eller andres deltakerrader — og vakten må se dem for å kunne avvise riktig.
 * Autorisasjonen ligger i beslutningen, ikke i lesetilgangen.
 *
 * Én regel for alle fem lesingene: en lesefeil er en feil, aldri en tom liste
 * (#1863). Før dette ble `participantRes.error` ignorert, så en DB-hikke ga
 * `participantCount: 0` + `alreadyJoined: false` — altså `can_join`, og
 * deltaker-taket var omgått. Nå kastes `CupJoinReadError`: siden lar den gå til
 * error-grensa (Prøv igjen), actionene oversetter den til `read_failed`.
 */

export type CupJoinCup = {
  id: string;
  name: string;
  status: string;
  group_id: string | null;
  created_by: string;
  team_1_name: string;
  team_2_name: string;
};

export type CupJoinContext = {
  cup: CupJoinCup | null;
  facts: CupJoinFacts;
};

const MISSING_CUP_FACTS: CupJoinFacts = {
  cupExists: false,
  status: null,
  groupId: null,
  creatorIsAdmin: false,
  profileCompleted: false,
  isClubMember: false,
  participantCount: 0,
  alreadyJoined: false,
};

/**
 * Logg feilen der den skjedde (`which` sier hvilken lesing som røk), og kast
 * videre. Returtypen `never` lar call-siten kalle den som et uttrykk.
 */
function failRead(
  which: CupJoinReadName,
  shortId: string,
  userId: string,
  error: unknown,
): never {
  console.error('[cup] getCupJoinContext read failed', {
    shortId,
    userId,
    which,
    error,
  });
  throw new CupJoinReadError(which);
}

export async function getCupJoinContext(
  shortId: string,
  userId: string,
): Promise<CupJoinContext> {
  const admin = getAdminClient();

  const { data: cup, error: cupError } = await admin
    .from('tournaments')
    .select('id, name, status, group_id, created_by, team_1_name, team_2_name')
    .eq('short_id', shortId)
    .maybeSingle<CupJoinCup>();

  // En lesefeil er ikke «cupen finnes ikke» — uten dette ble en Supabase-hikke
  // til `notFound()` på siden, altså en 404 for en cup som finnes.
  if (cupError) failRead('cup', shortId, userId, cupError);
  if (!cup) return { cup: null, facts: MISSING_CUP_FACTS };

  const [creatorRes, meRes, participantRes, membershipRes] = await Promise.all([
    admin
      .from('users')
      .select('is_admin')
      .eq('id', cup.created_by)
      .maybeSingle<{ is_admin: boolean }>(),
    admin
      .from('users')
      .select('profile_completed_at')
      .eq('id', userId)
      .maybeSingle<{ profile_completed_at: string | null }>(),
    admin
      .from('tournament_participants')
      .select('user_id')
      .eq('tournament_id', cup.id),
    cup.group_id
      ? admin
          .from('group_members')
          .select('role')
          .eq('group_id', cup.group_id)
          .eq('user_id', userId)
          .maybeSingle()
      : // `error: null` er ikke pynt: uten den ville union-typen mangle `.error`,
        // og feilsjekken under ikke kompilere.
        Promise.resolve({ data: null, error: null }),
  ]);

  // Alle fire behandles likt. `creator`/`me`/`membership` feilet før «lukket»,
  // men med feil beskjed (`profile_incomplete`/`not_member` for en DB-hikke) —
  // én regel er enklere å forsvare enn tre.
  const reads = [
    ['creator', creatorRes],
    ['me', meRes],
    ['participants', participantRes],
    ['membership', membershipRes],
  ] as const;
  for (const [which, res] of reads) {
    if (res.error) failRead(which, shortId, userId, res.error);
  }

  // Kun `error != null` kaster — en tom deltakerliste uten feil er en helt
  // gyldig cup (`participantCount: 0`), og `?? []` blir belte og seler.
  const participantIds = new Set(
    (participantRes.data ?? []).map((r) => r.user_id as string),
  );

  return {
    cup,
    facts: {
      cupExists: true,
      status: cup.status,
      groupId: cup.group_id,
      creatorIsAdmin: creatorRes.data?.is_admin === true,
      profileCompleted: meRes.data?.profile_completed_at != null,
      isClubMember: membershipRes.data != null,
      participantCount: participantIds.size,
      alreadyJoined: participantIds.has(userId),
    },
  };
}
