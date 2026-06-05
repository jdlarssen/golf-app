import { notFound, redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getGameByShortId } from '@/lib/games/getGameByShortId';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { LinkButton } from '@/components/ui/Button';
import { MODE_LABELS } from '@/lib/scoring/modes/types';
import { gameModeSupportsTeams } from '@/lib/games/registration';
import { getTeamCandidates, type TeamCandidate } from '@/lib/users/getTeamCandidates';
import { RegistrationForm } from './RegistrationForm';
import { TeamRegistrationForm } from './TeamRegistrationForm';

export const metadata = {
  title: 'Påmelding – Tørny',
};

type Params = Promise<{ shortId: string }>;

/**
 * Offentlig landing-side for selv-påmelding (#199 chunk 5).
 *
 * URL: `/signup/[shortId]` der shortId er 8-char base32 fra
 * `games.short_id`-kolonnen. Whitelisted i proxy.ts slik at uautentiserte
 * brukere får besøke siden — vi redirecter dem selv til /login med
 * `next=/signup/[shortId]` så de havner tilbake etter OTP-verify.
 *
 * Branch-logikken kjører serverside i prioritetsrekkefølge:
 *   1. Ugyldig/manglende short_id → notFound().
 *   2. Ikke logget inn → redirect /login med next-param.
 *   3. Mangler profil_completed_at → redirect /complete-profile.
 *   4. Allerede påmeldt (game_players-rad finnes) → "du er med"-melding.
 *   5. Pending request finnes → "venter på godkjenning"-melding.
 *   6. game.status er active/finished → "påmelding stengt".
 *   7. registration_mode = 'invite_only' → "krever invitasjon"-melding,
 *      med fallback hvis bruker har pending invitation-rad.
 *   8. Lag-only registration_type → "kommer i neste versjon"-placeholder.
 *   9. registration_mode = 'open' → "Meld meg på"-form.
 *   10. registration_mode = 'manual_approval' → "Be om å bli med"-form.
 */
export default async function PåmeldingPage({ params }: { params: Params }) {
  const { shortId } = await params;

  const game = await getGameByShortId(shortId);
  if (!game) {
    notFound();
  }

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/signup/${shortId}`);
  }

  // Bruk admin-client for profil/membership-sjekker. Vi er allerede authed
  // og verifisert via auth.getUser() — admin-bypass er bare for å unngå at
  // RLS skygger over rader vi har lov til å se (game_players SELECT er
  // gated på admin/membership; brukeren er ikke nødvendigvis et medlem ennå).
  const admin = getAdminClient();

  const { data: profile } = await admin
    .from('users')
    .select('profile_completed_at, email')
    .eq('id', user!.id)
    .maybeSingle<{ profile_completed_at: string | null; email: string }>();

  if (!profile?.profile_completed_at) {
    redirect(`/complete-profile?next=/signup/${shortId}`);
  }

  const { data: existingPlayer } = await admin
    .from('game_players')
    .select('game_id')
    .eq('game_id', game.id)
    .eq('user_id', user!.id)
    .maybeSingle<{ game_id: string }>();

  const { data: existingRequest } = await admin
    .from('game_registration_requests')
    .select('id, status')
    .eq('game_id', game.id)
    .eq('user_id', user!.id)
    .maybeSingle<{ id: string; status: 'pending' | 'approved' | 'rejected' | 'withdrawn' }>();

  // #442: er brukeren medlem av spillets klubb? Klubb-medlemmer kan melde seg
  // på klubb-spill direkte uansett registration_mode (medlemskap ER
  // invitasjonen). Den autoritative authz-en gjentas i registerForOpenGame.
  let isClubMember = false;
  if (game.group_id) {
    const { data: clubMembership } = await admin
      .from('group_members')
      .select('user_id')
      .eq('group_id', game.group_id)
      .eq('user_id', user!.id)
      .maybeSingle<{ user_id: string }>();
    isClubMember = clubMembership != null;
  }

  // For invite_only: sjekk om brukeren har en pending invitation-rad
  // (matchende email + game_id). Det gir oss fallback-melding "du har en
  // invitasjon" i stedet for generisk "krever invitasjon".
  let hasPendingInvitation = false;
  if (game.registration_mode === 'invite_only' && profile.email) {
    const { data: invitation } = await admin
      .from('invitations')
      .select('id')
      .ilike('email', profile.email)
      .eq('game_id', game.id)
      .is('accepted_at', null)
      .maybeSingle<{ id: string }>();
    hasPendingInvitation = invitation != null;
  }

  const gameLocked = game.status === 'active' || game.status === 'finished';
  const isAlreadyRegistered = existingPlayer != null;
  const hasOpenPendingRequest =
    existingRequest != null && existingRequest.status === 'pending';

  // Co-player-kandidater til autocomplete i lag-formen (#362). Hentes bare
  // når lag-formen faktisk skal rendres — ellers er det en unødig query.
  const willRenderTeamForm =
    (game.registration_type === 'team' || game.registration_type === 'both') &&
    game.registration_mode !== 'invite_only' &&
    !isAlreadyRegistered &&
    !gameLocked &&
    gameModeSupportsTeams(game.game_mode);
  const teamCandidates: TeamCandidate[] = willRenderTeamForm
    ? await getTeamCandidates(user!.id)
    : [];

  return (
    <AppShell>
      <TopBar backHref="/" back="history" kicker="Påmelding" />

      <div className="space-y-5">
        <header className="px-1">
          <p className="font-sans text-xs uppercase tracking-[0.12em] text-muted">
            {MODE_LABELS[game.game_mode]}
          </p>
          <h1 className="mt-1 font-serif text-[28px] font-medium leading-snug tracking-[-0.015em] text-text">
            {game.name}
          </h1>
          {game.scheduled_tee_off_at && (
            <p className="mt-1 font-sans text-sm text-muted">
              Tee-off:{' '}
              <time dateTime={game.scheduled_tee_off_at}>
                {formatTeeOff(game.scheduled_tee_off_at)}
              </time>
            </p>
          )}
        </header>

        <Card>
          {renderBody({
            game,
            gameLocked,
            isAlreadyRegistered,
            hasOpenPendingRequest,
            hasPendingInvitation,
            isClubMember,
            teamCandidates,
            captainEmail: profile.email,
          })}
        </Card>
      </div>
    </AppShell>
  );
}

function renderBody({
  game,
  gameLocked,
  isAlreadyRegistered,
  hasOpenPendingRequest,
  hasPendingInvitation,
  isClubMember,
  teamCandidates,
  captainEmail,
}: {
  game: NonNullable<Awaited<ReturnType<typeof getGameByShortId>>>;
  gameLocked: boolean;
  isAlreadyRegistered: boolean;
  hasOpenPendingRequest: boolean;
  hasPendingInvitation: boolean;
  isClubMember: boolean;
  teamCandidates: TeamCandidate[];
  captainEmail: string | null;
}) {
  if (isAlreadyRegistered) {
    return (
      <div className="space-y-4">
        <Banner tone="success">Du er allerede påmeldt dette spillet.</Banner>
        <LinkButton href={`/games/${game.id}`} full>
          Gå til spillet
        </LinkButton>
      </div>
    );
  }

  if (hasOpenPendingRequest) {
    return (
      <Banner tone="info">
        Forespørsel sendt — du får varsel når arrangøren har bestemt seg.
      </Banner>
    );
  }

  if (gameLocked) {
    return (
      <Banner tone="warning">
        Påmelding er stengt. Spillet er{' '}
        {game.status === 'active' ? 'i gang' : 'avsluttet'}.
      </Banner>
    );
  }

  // #442: er du medlem av spillets klubb, kan du melde deg på direkte uansett
  // påmeldingsmåte — også invite_only. Solo-flyt; lag-klubb-spill faller
  // gjennom til lag-logikken under.
  if (isClubMember && game.registration_type === 'solo') {
    return (
      <div className="space-y-4">
        <p className="font-sans text-sm leading-relaxed text-text">
          Du er medlem av klubben, så du kan melde deg på direkte.
        </p>
        <RegistrationForm mode="open" shortId={game.short_id} />
      </div>
    );
  }

  if (game.registration_mode === 'invite_only') {
    if (hasPendingInvitation) {
      return (
        <div className="space-y-4">
          <Banner tone="info">
            Du har en invitasjon til dette spillet. Sjekk innboksen din for
            mail med kode, eller åpne /innboks i appen for å godta.
          </Banner>
          <LinkButton href="/innboks" full variant="secondary">
            Gå til innboks
          </LinkButton>
        </div>
      );
    }
    // Lag-spill via invitasjon: solo-forespørsel passer ikke. Behold en
    // informativ melding (team self-request støttes ikke for noen modus ennå).
    if (game.registration_type === 'team') {
      return (
        <Banner tone="info">
          Dette spillet tar imot lag via invitasjon. Be arrangøren invitere
          laget ditt direkte.
        </Banner>
      );
    }
    // Gjør blindveien til en handling (#368): du har lenken, så du kan be
    // arrangøren om plass. Gjenbruker forespørsel-flyten — `requestApproval`
    // godtar nå invite_only. Spillet forblir uoppdagbart i «Finn turneringer».
    return (
      <div className="space-y-4">
        <p className="font-sans text-sm leading-relaxed text-text">
          Du er ikke invitert ennå, men du kan be arrangøren om plass.
        </p>
        <RegistrationForm mode="manual_approval" shortId={game.short_id} />
      </div>
    );
  }

  // Lag-flyt: spill med registration_type 'team' eller 'both' kan ta imot
  // lag-påmelding fra en kaptein. 'both' tillater også solo — vi rendrer
  // begge formene da, men i en MVP-utgave defaulter vi til lag-formen
  // (admin som vil ha solo må eksplisitt bytte til solo i en framtidig
  // toggle — for nå er det lag-flyten som er nytt).
  if (game.registration_type === 'team' || game.registration_type === 'both') {
    if (!gameModeSupportsTeams(game.game_mode)) {
      return (
        <Banner tone="warning">
          Spillmodusen «{MODE_LABELS[game.game_mode]}» har ikke lag-konsept.
          Be arrangøren bytte til solo-påmelding.
        </Banner>
      );
    }
    const teamSize = game.mode_config?.team_size ?? 4;
    if (teamSize < 2) {
      return (
        <Banner tone="warning">
          Lag-størrelsen er ikke riktig satt opp. Be arrangøren sjekke
          innstillingene.
        </Banner>
      );
    }
    return (
      <div className="space-y-4">
        <p className="font-sans text-sm leading-relaxed text-text">
          Du melder på et helt lag som kaptein. Fyll inn lag-navn og
          medspillere — kjente Tørny-brukere får varsel i appen, ukjente
          får mail-invitasjon.
        </p>
        <TeamRegistrationForm
          shortId={game.short_id}
          teamSize={teamSize}
          captainEmail={captainEmail}
          candidates={teamCandidates}
        />
      </div>
    );
  }

  const mode = game.registration_mode === 'open' ? 'open' : 'manual_approval';
  return (
    <div className="space-y-4">
      <p className="font-sans text-sm leading-relaxed text-text">
        {mode === 'open'
          ? 'Trykk «Meld meg på» for å bli med i spillet med en gang.'
          : 'Send en forespørsel til arrangøren. Du får varsel når den er godkjent.'}
      </p>
      <RegistrationForm mode={mode} shortId={game.short_id} />
    </div>
  );
}

/**
 * Format ISO-timestamp som norsk «8. mai 2026, 14:30». Bruker `nb-NO`-locale
 * og europeisk 24-timers tid. Faller tilbake til rå-strengen hvis Intl
 * feiler (skal aldri skje for gyldige ISO-strings).
 */
function formatTeeOff(iso: string): string {
  try {
    const date = new Date(iso);
    const datePart = date.toLocaleDateString('nb-NO', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const timePart = date.toLocaleTimeString('nb-NO', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${datePart}, ${timePart}`;
  } catch {
    return iso;
  }
}
