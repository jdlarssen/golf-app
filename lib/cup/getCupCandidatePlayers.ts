import 'server-only';
import type { getServerClient } from '@/lib/supabase/server';
import { getClubMemberOptionsForClub } from '@/lib/clubs/getClubMemberOptionsForClub';
import { getFriendPlayerOptions } from '@/lib/friends/getFriendPlayerOptions';

type ServerSupabase = Awaited<ReturnType<typeof getServerClient>>;

type UserRow = {
  id: string;
  name: string | null;
  nickname: string | null;
  hcp_index: number | string;
  profile_completed_at: string | null;
  gender: 'mens' | 'ladies' | null;
};

/**
 * Én kandidat-spiller for en cup — kilden til både Spillere-rommet (#1472) og
 * generer-veiviserens roster (#524/#526). Dette er typens ENE hjem;
 * `GenerateMatches` re-eksporterer den så eksisterende importører av
 * `./GenerateMatches` er uendret.
 */
export type WizardPlayer = {
  id: string;
  displayName: string;
  hcpIndex: number;
  // #1441 (F3c) — optional: kun satt når kilde-queriet valgte kolonnen (alle
  // tre spiller-kilder gjør det nå).
  gender?: 'mens' | 'ladies' | null;
  // #1441 (owner-QA, F3f): true for venner uten fullført profil
  // (`profile_completed_at IS NULL`) — rendres som en IKKE-valgbar rad, aldri
  // tildelbar til et lag (se `getFriendPlayerOptions`s `pending`-felt). Alltid
  // `false`/`undefined` for klubb-medlem- og admin-spillerlistene — de filtrerer
  // pending bort før noen ser dem (kun venne-kilden fikk denne synligheten).
  pending?: boolean;
};

/**
 * Kandidat-spillerne for en cup, etter cupens kontekst (#524/#526/#464). Trukket
 * ut av `GenerateMatches.tsx` (#1472) så Spillere-rommet og generer-veiviseren
 * deler ÉN kilde:
 *  - klubb-cup (`groupId` satt) → KUN klubbens medlemmer (pending filtrert bort).
 *  - personlig cup, global admin → alle profil-fullførte brukere (sekretariat).
 *  - personlig cup, vanlig skaper → skaperens venner + skaperen selv; pending
 *    venner beholdes MED `pending: true` (ikke-valgbare i UI-et).
 *
 * `userId`/`isAdmin` er kallerens rolle-kontekst (samme som `getRoleContext`
 * gir) — kilden følger HVEM som ser lista, akkurat som før uttrekket.
 */
export async function getCupCandidatePlayers(
  supabase: ServerSupabase,
  opts: { groupId: string | null; userId: string; isAdmin: boolean },
): Promise<WizardPlayer[]> {
  const { groupId, userId, isAdmin } = opts;

  if (groupId) {
    // Klubb-cup → kun medlemmer.
    const members = await getClubMemberOptionsForClub(groupId);
    return members
      .filter((m) => !m.pending)
      .map((m) => ({
        id: m.id,
        displayName: m.nickname?.trim() || m.name?.trim() || 'Ukjent spiller',
        hcpIndex: m.hcp_index,
        gender: m.gender,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'no'));
  }

  if (isAdmin) {
    // Personlig cup, global admin → alle profil-fullførte brukere.
    const usersResult = await supabase
      .from('users')
      .select('id, name, nickname, hcp_index, profile_completed_at, gender')
      .order('name', { ascending: true, nullsFirst: true })
      .returns<UserRow[]>();
    if (usersResult.error) throw usersResult.error;
    return (usersResult.data ?? [])
      .filter((u) => u.profile_completed_at !== null)
      .map((u) => ({
        id: u.id,
        displayName: u.nickname?.trim() || u.name?.trim() || 'Ukjent spiller',
        hcpIndex: Number(u.hcp_index),
        gender: u.gender,
      }));
  }

  // Personlig cup, vanlig skaper → skaperens venner + skaperen selv (#464).
  // Skaperen selv hentes direkte (alltid synlig for seg selv via RLS); venner
  // via admin-client-helperen så de ikke faller ut av users-RLS-en.
  const [friends, selfResult] = await Promise.all([
    getFriendPlayerOptions(userId),
    supabase
      .from('users')
      .select('id, name, nickname, hcp_index, profile_completed_at, gender')
      .eq('id', userId)
      .maybeSingle<UserRow>(),
  ]);
  const byId = new Map<string, WizardPlayer>();
  const self = selfResult.data;
  if (self && self.profile_completed_at !== null) {
    byId.set(self.id, {
      id: self.id,
      displayName:
        self.nickname?.trim() || self.name?.trim() || 'Ukjent spiller',
      hcpIndex: Number(self.hcp_index),
      gender: self.gender,
    });
  }
  for (const f of friends) {
    if (byId.has(f.id)) continue;
    // #1441 (owner-QA, F3f): pending venner (profil ikke fullført) beholdes som
    // en ikke-valgbar rad (`pending: true`) i stedet for å filtreres bort, så
    // organisatoren ser hvem som må dyttes på. `hcp_index` på en pending rad er
    // schema-default (54.0), aldri en ekte verdi.
    byId.set(f.id, {
      id: f.id,
      displayName: f.nickname?.trim() || f.name?.trim() || 'Ukjent spiller',
      hcpIndex: f.hcp_index,
      gender: f.gender,
      pending: f.pending,
    });
  }
  return [...byId.values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, 'no'),
  );
}
