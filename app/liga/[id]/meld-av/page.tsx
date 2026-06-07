import { notFound, redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getLigaSnapshot } from '@/lib/league/getLigaSnapshot';
import { leagueSelfServiceState } from '@/lib/league/selfService';
import type { LeagueStatus } from '@/lib/league/types';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Banner } from '@/components/ui/Banner';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { SmartLink } from '@/components/ui/SmartLink';
import { leaveClubLeague } from '@/lib/league/actions';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ error?: string | string[] }>;

/** Leave-feilkoder fra leave_club_league-RPC-en → norsk melding. */
const LEAVE_ERROR_MESSAGES: Record<string, string> = {
  already_played: 'Du har allerede spilt en runde. Be klubb-admin om å fjerne deg.',
  finished: 'Ligaen er avsluttet.',
  not_member: 'Du er ikke med i denne ligaen.',
  not_club_league: 'Denne ligaen kan du ikke melde deg av selv.',
  leave_failed: 'Noe gikk galt. Prøv igjen.',
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * /liga/[id]/meld-av — dedikert confirm-side for å melde seg av en klubb-liga
 * (#452 Fase 3). Destructive flyt → egen rute (repo-regel: aldri inline-toggle /
 * <details>), speiler /klubber/[id]/forlat.
 *
 * Gates til en bruker som faktisk kan melde seg av (deltaker, klubb-liga, ikke
 * spilt en runde, ikke avsluttet); ellers redirect tilbake til liga-siden.
 */
export default async function MeldAvLigaPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/liga/${id}/meld-av`);

  const snapshot = await getLigaSnapshot(id);
  if (!snapshot) notFound();
  const { league, participants } = snapshot;

  const me = participants.find((p) => p.userId === user.id);
  const { canLeave } = leagueSelfServiceState({
    groupId: league.group_id,
    status: league.status as LeagueStatus,
    isClubMember: false, // irrelevant for canLeave
    isParticipant: me !== undefined,
    hasPlayed: me?.hasPlayed ?? false,
  });
  if (!canLeave) redirect(`/liga/${id}`);

  const errorCode = firstParam(sp.error);
  const errorMessage = errorCode ? LEAVE_ERROR_MESSAGES[errorCode] : undefined;

  return (
    <AppShell>
      <TopBar backHref={`/liga/${id}`} kicker={league.name} />

      {errorMessage && (
        <div className="mb-6">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}

      <div className="space-y-6">
        <div className="px-1">
          <h1 className="mb-2 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
            Meld deg av «{league.name}»?
          </h1>
          <p className="font-sans text-[13px] leading-relaxed text-muted">
            Du tas ut av sesong-tabellen, men kan bli med igjen så lenge ligaen
            ikke har startet.
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          <form action={leaveClubLeague}>
            <input type="hidden" name="league_id" value={league.id} />
            <SubmitButton
              variant="danger"
              className="w-full"
              pendingLabel="Melder deg av …"
            >
              Meld meg av
            </SubmitButton>
          </form>
          <SmartLink
            href={`/liga/${id}`}
            className="rounded-full border border-border bg-surface px-4 py-3 text-center font-sans text-[13px] font-medium text-text min-h-[44px] flex items-center justify-center"
          >
            Avbryt
          </SmartLink>
        </div>
      </div>
    </AppShell>
  );
}
