import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { isPubliclyViewable } from './publicSignupVisibility';
import type { DiscoverableOpenGame } from './getDiscoverableGames';
import type { RegistrationMode } from './registration';

/**
 * Anonym «Finn turneringer»-liste (#1185). Uinnloggede skal kunne SE åpne
 * turneringer FØR login-veggen — gi verdi før du ber (flyt 2, resiprositet).
 *
 * Bruker admin-client (service role) for å bypasse games' medlemskaps-gatede
 * SELECT-policy — samme mønster som `getGameByShortId`/`getDiscoverableGames`.
 * Sikkerhetsgrensen er felt-whitelisten: KUN spill-metadata + banenavn.
 * ALDRI roster, e-post eller handicap — den anonyme lista eksponerer mindre
 * enn den offentlige plakaten (#1022), og per #1193 aldri påmeldings-navn.
 *
 * Synligheten er nøyaktig `isPubliclyViewable` (#1022): status 'scheduled',
 * registration_mode open/manual_approval, påmelding ikke stengt. Predikatet
 * er den ene autoritative regelen (ett hjem): SQL-filteret speiler den for
 * effektivitet, men hver rad gates i tillegg gjennom `isPubliclyViewable` —
 * så et framtidig drift mellom SQL og predikat aldri lekker et spill hit.
 * `status`/`signups_closed_at` hentes kun for å kjøre predikatet og rendres
 * aldri (ikke persondata).
 */
export async function getPublicDiscoverableGames(): Promise<
  DiscoverableOpenGame[]
> {
  const admin = getAdminClient();

  const { data } = await admin
    .from('games')
    .select(
      'id, name, short_id, scheduled_tee_off_at, registration_mode, status, signups_closed_at, courses(name)',
    )
    // Påmeldingsmåten ER synligheten (#357): open + manual_approval er
    // oppdagbare, invite_only er privat. Speiler isPubliclyViewable.
    .eq('status', 'scheduled')
    .in('registration_mode', ['open', 'manual_approval'])
    .is('signups_closed_at', null)
    .order('scheduled_tee_off_at', { ascending: true, nullsFirst: false })
    .limit(50);

  type PublicRow = {
    id: string;
    name: string;
    short_id: string;
    scheduled_tee_off_at: string | null;
    registration_mode: RegistrationMode;
    status: 'draft' | 'scheduled' | 'active' | 'finished';
    signups_closed_at: string | null;
    courses: { name: string } | { name: string }[] | null;
  };

  return (data ?? [])
    .map((row) => row as unknown as PublicRow)
    .filter((row) =>
      isPubliclyViewable({
        status: row.status,
        registration_mode: row.registration_mode,
        signups_closed_at: row.signups_closed_at,
      }),
    )
    .map((row) => {
      const course = Array.isArray(row.courses)
        ? (row.courses[0] ?? null)
        : row.courses;
      return {
        id: row.id,
        name: row.name,
        short_id: row.short_id,
        scheduled_tee_off_at: row.scheduled_tee_off_at,
        course_name: course?.name ?? null,
        // isPubliclyViewable garanterer open | manual_approval her.
        registration_mode: row.registration_mode as 'open' | 'manual_approval',
      };
    });
}
