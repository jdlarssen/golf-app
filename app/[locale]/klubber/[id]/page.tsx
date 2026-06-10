import { notFound, redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { formatDate } from '@/lib/i18n/format';
import { getServerClient } from '@/lib/supabase/server';
import { getClubDetail } from '@/lib/clubs/getClubDetail';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { LinkButton } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Input } from '@/components/ui/Input';
import { SmartLink } from '@/components/ui/SmartLink';
import { CopyJoinLinkButton } from './CopyJoinLinkButton';
import { ClubLeaguesSection } from './ClubLeaguesSection';
import { ClubCupsSection } from './ClubCupsSection';
import { isClubExpired } from '@/lib/clubs/clubStatus';
import { addMember, decideRequest } from './actions';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  added?: string | string[];
  error?: string | string[];
  email?: string | string[];
  decided?: string | string[];
  role_changed?: string | string[];
}>;

const ROLE_LABELS: Record<'owner' | 'admin' | 'member', string> = {
  owner: 'Eier',
  admin: 'Admin',
  member: 'Medlem',
};

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * /klubber/[id] — club detail page.
 *
 * Shows the member list with role badges. Owner/admin see:
 *   - Add member by email form (reads ?added= / ?error= searchParams for result banner)
 *   - Copy join-link affordance (/klubber/bli-med/[short_id])
 *   - Remove-member links per non-self member → /klubber/[id]/fjern/[userId]
 * All members see a «Forlat klubb» link → /klubber/[id]/forlat (hidden for
 * last-owner since that confirm page would block them anyway; avoid dead path).
 *
 * Part of #442 (Opprett klubb — eierskap + klubb-scoped oppdagbarhet).
 */
export default async function KlubbDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const locale = await getLocale();

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const detail = await getClubDetail(supabase, id, user.id);
  if (!detail) notFound();

  const { club, members, myRole, pendingRequests } = detail;
  const isAdmin = myRole === 'owner' || myRole === 'admin';

  // #480: klubbens ligaer. RLS («leagues select scoped») lar medlemmer se
  // klubb-scopede rader; oppretting/styring er klubb-admin (knapp nedenfor).
  const { data: clubLeagues } = await supabase
    .from('leagues')
    .select('id, name, status')
    .eq('group_id', id)
    .order('created_at', { ascending: false });

  // #524: klubbens cuper. RLS («tournaments select scoped») lar medlemmer se
  // klubb-scopede rader; oppretting/styring er klubb-admin (knapp nedenfor).
  const { data: clubCups } = await supabase
    .from('tournaments')
    .select('id, name, status')
    .eq('group_id', id)
    .order('created_at', { ascending: false });

  // #50: en utløpt klubb (frossen avtale) tar ikke imot nye medlemmer eller
  // spill. Vi fryser legg-til-medlem, del-lenke og «sett opp runde», og viser
  // et utløpt-banner. Medlemsstyring (roller, fjern, forlat) er fortsatt mulig.
  const frozen = isClubExpired(club.valid_until);

  // Determine whether to show leave link (hide for the only owner).
  const ownerCount = members.filter((m) => m.role === 'owner').length;
  const iSoleOwner = myRole === 'owner' && ownerCount === 1;

  const addedEmail = first(sp.added);
  const errorCode = first(sp.error);
  const errorEmail = first(sp.email);
  const decidedCode = first(sp.decided);
  const roleChanged = first(sp.role_changed);

  const errorMessages: Record<string, string> = {
    not_found: errorEmail
      ? `Fant ingen Tørny-bruker med e-posten ${errorEmail}. Be dem opprette konto først.`
      : 'Fant ingen Tørny-bruker med den e-posten. Be dem opprette konto først.',
    already: errorEmail
      ? `${errorEmail} er allerede medlem i klubben.`
      : 'Denne personen er allerede med i klubben.',
    not_auth: 'Du har ikke tilgang til å legge til medlemmer.',
    email_req: 'Fyll inn en e-postadresse.',
    full: club.member_cap
      ? `Klubben er full (maks ${club.member_cap} medlemmer).`
      : 'Klubben er full.',
    expired: 'Klubben er utløpt. Ta kontakt på klubb@tornygolf.no for å fornye.',
    unknown: 'Noe gikk galt. Prøv igjen.',
  };

  const decidedMessages: Record<string, { tone: 'success' | 'error'; text: string }> = {
    approved: { tone: 'success', text: 'Godkjent. Personen er nå medlem av klubben.' },
    rejected: { tone: 'success', text: 'Forespørselen ble avslått.' },
    not_auth: { tone: 'error', text: 'Du kan ikke avgjøre denne forespørselen.' },
    already: { tone: 'error', text: 'Forespørselen var allerede avgjort.' },
    not_found: { tone: 'error', text: 'Fant ikke forespørselen. Den kan ha blitt trukket tilbake.' },
    club_full: {
      tone: 'error',
      text: club.member_cap
        ? `Klubben er full (maks ${club.member_cap} medlemmer). Forespørselen står fortsatt åpen.`
        : 'Klubben er full. Forespørselen står fortsatt åpen.',
    },
    club_expired: {
      tone: 'error',
      text: 'Klubben er utløpt. Forespørselen kan ikke godkjennes før avtalen fornyes.',
    },
    unknown: { tone: 'error', text: 'Noe gikk galt. Prøv igjen.' },
  };

  const joinUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://tornygolf.no'}/klubber/bli-med/${club.short_id}`;

  return (
    <AppShell>
      <TopBar backHref="/klubber" kicker={club.name} />
      <PageHeader title={club.name} />

      {addedEmail && (
        <div className="mb-6">
          <Banner tone="success">{addedEmail} er lagt til i klubben.</Banner>
        </div>
      )}

      {errorCode && (
        <div className="mb-6">
          <Banner tone="error">
            {errorMessages[errorCode] ?? 'Noe gikk galt. Prøv igjen.'}
          </Banner>
        </div>
      )}

      {decidedCode && decidedMessages[decidedCode] && (
        <div className="mb-6">
          <Banner tone={decidedMessages[decidedCode].tone}>
            {decidedMessages[decidedCode].text}
          </Banner>
        </div>
      )}

      {roleChanged && (
        <div className="mb-6">
          <Banner tone="success">Rollen er oppdatert.</Banner>
        </div>
      )}

      {frozen && (
        <div className="mb-6">
          <Banner tone="warning">
            Denne klubben er utløpt. Ta kontakt på klubb@tornygolf.no for å
            fornye avtalen. Pågående runder spilles ferdig som normalt.
          </Banner>
        </div>
      )}

      {/* Pending join requests — visible only to owner/admin */}
      {isAdmin && pendingRequests.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            Forespørsler ({pendingRequests.length})
          </h2>
          <div className="space-y-2">
            {pendingRequests.map((req) => (
              <Card key={req.id} className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-sans text-[15px] font-medium text-text">
                      {req.requesterName}
                    </span>
                    <span className="font-sans text-xs text-muted">
                      {formatDate(req.requestedAt, locale, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <form action={decideRequest}>
                      <input type="hidden" name="requestId" value={req.id} />
                      <input type="hidden" name="groupId" value={club.id} />
                      <input type="hidden" name="approve" value="true" />
                      <SubmitButton
                        className="min-h-[44px] px-4 text-sm"
                        pendingLabel="Godkjenner …"
                      >
                        Godkjenn
                      </SubmitButton>
                    </form>
                    <form action={decideRequest}>
                      <input type="hidden" name="requestId" value={req.id} />
                      <input type="hidden" name="groupId" value={club.id} />
                      <input type="hidden" name="approve" value="false" />
                      <SubmitButton
                        variant="secondary"
                        className="min-h-[44px] px-4 text-sm"
                        pendingLabel="Avviser …"
                      >
                        Avslå
                      </SubmitButton>
                    </form>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Members list */}
      <section className="mb-8">
        <h2 className="mb-3 font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          Medlemmer ({members.length}
          {club.member_cap != null ? ` / ${club.member_cap}` : ''})
        </h2>
        <div className="space-y-2">
          {members.map((member) => (
            <Card key={member.userId} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate font-sans text-[15px] font-medium text-text">
                  {member.name}
                  {member.userId === user.id && (
                    <span className="ml-1.5 text-muted font-normal">(deg)</span>
                  )}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full border border-border px-2.5 py-0.5 font-sans text-xs text-muted">
                    {ROLE_LABELS[member.role]}
                  </span>
                  {myRole === 'owner' && member.userId !== user.id && (
                    <SmartLink
                      href={`/klubber/${club.id}/rolle/${member.userId}`}
                      className="min-h-[44px] flex items-center font-sans text-xs text-primary hover:underline"
                    >
                      Endre rolle
                    </SmartLink>
                  )}
                  {isAdmin && member.userId !== user.id && (
                    <SmartLink
                      href={`/klubber/${club.id}/fjern/${member.userId}`}
                      className="min-h-[44px] flex items-center font-sans text-xs text-danger hover:underline"
                    >
                      Fjern
                    </SmartLink>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Klubbens ligaer (#480) — alle medlemmer ser lista; owner/admin oppretter. */}
      <ClubLeaguesSection
        leagues={clubLeagues ?? []}
        clubId={club.id}
        canCreate={isAdmin && !frozen}
        canManage={isAdmin}
      />

      {/* Klubbens cuper (#524) — alle medlemmer ser lista; owner/admin oppretter. */}
      <ClubCupsSection
        cups={clubCups ?? []}
        clubId={club.id}
        canCreate={isAdmin && !frozen}
        canManage={isAdmin}
      />

      {/* Create a game scoped to this club (any member) — frozen when expired. */}
      {!frozen && (
        <section className="mb-8">
          <LinkButton href={`/opprett-spill?klubb=${club.id}`} full>
            Sett opp en runde for klubben
          </LinkButton>
        </section>
      )}

      {/* Admin controls — hidden when the club is frozen (no new members). */}
      {isAdmin && !frozen && (
        <>
          {/* Add member by email */}
          <section className="mb-8">
            <h2 className="mb-3 font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
              Legg til medlem
            </h2>
            <Card>
              <form action={addMember} className="space-y-4">
                <input type="hidden" name="groupId" value={club.id} />
                <Input
                  id="member-email"
                  name="email"
                  type="email"
                  label="E-postadresse"
                  placeholder="navn@eksempel.no"
                  autoComplete="email"
                  hint="Personen må ha Tørny-konto fra før."
                />
                <SubmitButton className="w-full" pendingLabel="Legger til …">
                  Legg til
                </SubmitButton>
              </form>
            </Card>
          </section>

          {/* Join link */}
          <section className="mb-8">
            <h2 className="mb-3 font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
              Del klubb-lenke
            </h2>
            <Card className="space-y-2">
              <p className="font-sans text-sm text-muted">
                Del denne lenken. Den som åpner den kan be om å bli med, og du
                godkjenner eller avslår.
              </p>
              <CopyJoinLinkButton joinUrl={joinUrl} />
            </Card>
          </section>
        </>
      )}

      {/* Leave club */}
      {!iSoleOwner && (
        <section className="mt-2">
          <SmartLink
            href={`/klubber/${club.id}/forlat`}
            className="block rounded-full border border-border bg-surface px-4 py-3 text-center font-sans text-[13px] font-medium text-danger min-h-[44px] flex items-center justify-center"
          >
            Forlat klubb
          </SmartLink>
        </section>
      )}
    </AppShell>
  );
}
