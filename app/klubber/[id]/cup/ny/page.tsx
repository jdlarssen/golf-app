import { notFound, redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrClubAdmin } from '@/lib/admin/auth';
import { getClubDetail } from '@/lib/clubs/getClubDetail';
import { isClubExpired } from '@/lib/clubs/clubStatus';
import { getCupEligibleFormats } from '@/lib/formats/getFormatsForIntent';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Banner } from '@/components/ui/Banner';
import { CupSetup } from '@/app/admin/games/new/CupSetup';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ error?: string | string[] }>;

// Speiler cup-validerings-kodene fra createTournamentDraft (cup_-prefiks).
const ERROR_MESSAGES: Record<string, string> = {
  cup_name: 'Cup-navnet må være mellom 1 og 80 tegn.',
  cup_team_1: 'Navn på lag 1 må være mellom 1 og 40 tegn.',
  cup_team_2: 'Navn på lag 2 må være mellom 1 og 40 tegn.',
  cup_team_dup: 'Lagene må ha forskjellige navn.',
  cup_points: 'Point-målet må være et positivt tall.',
  cup_allowance: 'Sjekk handicap-andelen for fourball.',
  cup_foursomes_allowance: 'Sjekk handicap-andelen for foursomes.',
  cup_insert_failed: 'Klarte ikke å opprette cupen. Prøv igjen.',
};

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * /klubber/[id]/cup/ny — opprett en klubb-scopet cup (#524, #480 Fase 2).
 *
 * Gatet til klubbens eier/admin (eller global admin) via requireAdminOrClubAdmin.
 * Cupen lagres med group_id = klubben; deltakere/kamper legges til etterpå i
 * generer-wizarden (medlems-sourcet). Gjenbruker `CupSetup` med klubb-kontekst.
 * Frossen klubb → redirect tilbake (speiler «Sett opp runde» / klubb-liga).
 */
export default async function NewKlubbCupPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const errorCode = first((await searchParams).error);
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;

  const supabase = await getServerClient();
  const { userId } = await requireAdminOrClubAdmin(supabase, id);

  const detail = await getClubDetail(supabase, id, userId);
  if (!detail) notFound();
  if (isClubExpired(detail.club.valid_until)) redirect(`/klubber/${id}`);

  const cupEligibleFormats = await getCupEligibleFormats();

  return (
    <AppShell>
      <TopBar backHref={`/klubber/${id}`} kicker={detail.club.name} />
      <BrassRibbon kicker="Ny klubb-cup" />
      <PageHeader
        title="Opprett cup"
        subtitle={`Sett opp en lag-mot-lag-cup for ${detail.club.name}. Kampene legger du til etterpå.`}
      />

      {errorMessage && (
        <div className="mb-4">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}

      <CupSetup
        cupEligibleFormats={cupEligibleFormats}
        groupId={id}
        clubName={detail.club.name}
      />
    </AppShell>
  );
}
