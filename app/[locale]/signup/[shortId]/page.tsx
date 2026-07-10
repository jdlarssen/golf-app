import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { formatDate, formatTime } from '@/lib/i18n/format';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getGameByShortId } from '@/lib/games/getGameByShortId';
import { localizeGameName } from '@/lib/games/autoGameName';
import { getFriendIds } from '@/lib/friends/getFriendIds';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { LinkButton } from '@/components/ui/Button';
import { gameModeSupportsTeams } from '@/lib/games/registration';
import { isMatchplayMode, countSidePlayers } from '@/lib/games/matchplaySides';
import { resolveRegistrationTypeView } from './registrationTypeView';
import { getTeamCandidates, type TeamCandidate } from '@/lib/users/getTeamCandidates';
import {
  isPubliclyViewable,
  signupSourceFromParam,
} from '@/lib/games/publicSignupVisibility';
import { getPublicSignupRoster } from '@/lib/games/getPublicSignupRoster';
import { PaymentInfo } from '@/components/PaymentInfo';
import { PublicLandingView } from './PublicLandingView';
import { PremiebordCard } from '@/components/PremiebordCard';
import { safeParsePrizes } from '@/lib/games/prizes';
import { RegistrationForm, type MatchplaySideData } from './RegistrationForm';
import { TeamRegistrationForm } from './TeamRegistrationForm';

type Params = Promise<{ shortId: string; locale: string }>;
type SearchParams = Promise<{ src?: string | string[] }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { locale, shortId } = await params;
  const t = await getTranslations({ locale: locale as AppLocale, namespace: 'signup' });

  // #1022: for offentlig synlige spill får link-previews spillnavnet og en
  // invitasjon som og:title/description (og:image kommer fra filkonvensjonen
  // opengraph-image.tsx). Fane-tittelen for innloggede beholdes uendret.
  const game = await getGameByShortId(shortId);
  if (game && isPubliclyViewable(game)) {
    const gameName = localizeGameName(
      game.name,
      game.courses?.name ?? null,
      locale as AppLocale,
    );
    return {
      title: t('metaTitle'),
      description: t('public.ogDescription'),
      openGraph: {
        title: gameName,
        description: t('public.ogDescription'),
      },
    };
  }
  return { title: t('metaTitle') };
}

/**
 * Offentlig landing-side for selv-påmelding (#199 chunk 5).
 *
 * URL: `/signup/[shortId]` der shortId er 8-char base32 fra
 * `games.short_id`-kolonnen. Whitelisted i proxy.ts slik at uautentiserte
 * brukere får besøke siden — vi redirecter dem selv til /login med
 * `next=/signup/[shortId]` så de havner tilbake etter OTP-verify.
 *
 * Branch-logikken kjører serverside i prioritetsrekkefølge:
 *   1. Ikke logget inn + offentlig synlig spill (#1022: scheduled + open/
 *      manual_approval + påmelding ikke stengt) → offentlig landingsside med
 *      «Bli med»-CTA inn i login-flyten. Alle andre uinnloggede → redirect
 *      /login med next-param (#559 — en ugyldig lenke skal gate til login,
 *      ikke 404). `?src=`-parameteren (plakat/offentlig side) følger med
 *      next-parameteren rundt OTP-runden for kilde-attribusjon.
 *   2. Ugyldig/manglende short_id → notFound().
 *   3. (#1176) Profil-løse ser siden — påmeldingen (mutasjonen) gater profil,
 *      ikke visningen. Se registerForOpenGame/attach-actionene.
 *   4. Allerede påmeldt (game_players-rad finnes) → "du er med"-melding.
 *   5. Pending request finnes → "venter på godkjenning"-melding.
 *   6. game.status er active/finished → "påmelding stengt".
 *   7. registration_mode = 'invite_only' → "krever invitasjon"-melding,
 *      med fallback hvis bruker har pending invitation-rad.
 *   8. Lag-only registration_type → "kommer i neste versjon"-placeholder.
 *   9. registration_mode = 'open' → "Meld meg på"-form.
 *   10. registration_mode = 'manual_approval' → "Be om å bli med"-form.
 */
export default async function PåmeldingPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { shortId } = await params;
  const { src } = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations('signup');
  const tModes = await getTranslations('modes');

  // #1022: allowlist-validert rå `?src=`-verdi (public|plakat) — beholdes
  // gjennom login-runden og ender som game_players.signup_source ved insert.
  const srcRaw =
    typeof src === 'string' && signupSourceFromParam(src) != null ? src : null;

  // /signup ligger i PUBLIC_PATH_PATTERN (proxy.ts slipper alle gjennom), så
  // vi gater selv her. Spill-oppslaget skjer FØR auth-grenen fordi offentlig
  // synlige spill (#1022) skal rendre landingsside for uinnloggede — men
  // #559-regelen står: uinnloggede med ugyldig ELLER ikke-synlig lenke sendes
  // til /login med next-param, aldri 404.
  const game = await getGameByShortId(shortId);

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Kilde-attribusjon (#1022): validert `?src=` beholdes i next-parameteren
    // så den overlever OTP-runden og når påmeldings-skjemaet.
    const srcSuffix = srcRaw ? `?src=${srcRaw}` : '';

    if (game && isPubliclyViewable(game)) {
      const roster = await getPublicSignupRoster(game.id);
      return (
        <PublicLandingView
          gameName={localizeGameName(
            game.name,
            game.courses?.name ?? null,
            locale as AppLocale,
          )}
          modeLabel={tModes(game.game_mode as Parameters<typeof tModes>[0])}
          courseName={game.courses?.name ?? null}
          teeOff={
            game.scheduled_tee_off_at
              ? formatTeeOff(game.scheduled_tee_off_at, locale as AppLocale)
              : null
          }
          roster={roster}
          joinHref={`/login?next=${encodeURIComponent(`/signup/${shortId}${srcSuffix}`)}`}
          posterHref={`/signup/${shortId}/plakat`}
          entryFeeKr={game.entry_fee_kr}
          paymentLink={game.payment_link}
          prizes={safeParsePrizes(game.prizes)}
        />
      );
    }

    // next-param URL-encodes per the proxy.ts auth-gate convention
    // (`?next=${encodeURIComponent(...)}`) so /login round-trips it cleanly.
    redirect({
      href: `/login?next=${encodeURIComponent(`/signup/${shortId}${srcSuffix}`)}`,
      locale: locale as AppLocale,
    });
  }

  if (!game) {
    notFound();
  }

  // Bruk admin-client for profil/membership-sjekker. Vi er allerede authed
  // og verifisert via auth.getUser() — admin-bypass er bare for å unngå at
  // RLS skygger over rader vi har lov til å se (game_players SELECT er
  // gated på admin/membership; brukeren er ikke nødvendigvis et medlem ennå).
  const admin = getAdminClient();

  // #1176: vi henter fortsatt profil-raden (email brukes i invite_only-sjekken
  // + kaptein-visningen nedenfor), men gater IKKE visningen på
  // profile_completed_at lenger — en profil-løs, invitert spiller skal se hva
  // de er invitert til. Selve påmeldingen (registerForOpenGame / lag-attach)
  // beholder sin egen profil-gate, siden en påmelding eksponerer navnet ditt.
  const { data: profile } = await admin
    .from('users')
    .select('profile_completed_at, email')
    .eq('id', user!.id)
    .maybeSingle<{ profile_completed_at: string | null; email: string }>();

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
  if (game.registration_mode === 'invite_only' && profile!.email) {
    const { data: invitation } = await admin
      .from('invitations')
      .select('id')
      .ilike('email', profile!.email)
      .eq('game_id', game.id)
      .is('accepted_at', null)
      .maybeSingle<{ id: string }>();
    hasPendingInvitation = invitation != null;
  }

  const gameLocked = game.status === 'active' || game.status === 'finished';
  // #543: påmeldingen er stengt manuelt av arrangøren, men spillet er
  // fortsatt planlagt. Stengt vises etter allerede-påmeldt-sjekken (brukere
  // som allerede er med, skal komme til spill-siden som vanlig) men FØR
  // søknadsprosessen. game_locked prioriteres over signups_closed.
  const signupsClosed = !gameLocked && game.signups_closed_at != null;
  const isAlreadyRegistered = existingPlayer != null;
  const hasOpenPendingRequest =
    existingRequest != null && existingRequest.status === 'pending';

  // #369: er brukeren en akseptert venn av spill-eieren? Brukes til å vise
  // «Meld meg på» i stedet for «Be om å bli med» for manual_approval-spill
  // med let_friends_skip_gate=true. Sjekken hoppes over for andre modi.
  let viewerIsFriend = false;
  if (
    game.registration_mode === 'manual_approval' &&
    game.let_friends_skip_gate === true &&
    game.created_by
  ) {
    const friendIds = await getFriendIds(user!.id);
    viewerIsFriend = friendIds.includes(game.created_by);
  }

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

  // #544: side-velger for åpne matchplay-spill. Henter en slank roster
  // (team_number + bruker-navn) slik at velgeren kan vise hvem som allerede
  // er påmeldt per side og beregne ledige plasser.
  let matchplaySideData: MatchplaySideData | null = null;
  if (
    isMatchplayMode(game.game_mode) &&
    !gameLocked &&
    !isAlreadyRegistered &&
    (game.registration_mode === 'open' || isClubMember || viewerIsFriend)
  ) {
    const { data: rosterRows } = await admin
      .from('game_players')
      .select('team_number, withdrawn_at, users!game_players_user_id_fkey(name, nickname)')
      .eq('game_id', game.id)
      .is('withdrawn_at', null);

    type RosterItem = {
      team_number: number | null;
      withdrawn_at: string | null;
      users: { name: string | null; nickname: string | null } | null;
    };

    const rows: RosterItem[] = (rosterRows ?? []) as unknown as RosterItem[];
    const teamSize = (game.mode_config as { team_size?: number } | null)?.team_size ?? 1;
    const { side1: side1Count, side2: side2Count } = countSidePlayers(rows);

    const nameOf = (r: RosterItem) => {
      const u = r.users;
      if (!u) return null;
      return (u.nickname ?? u.name ?? null);
    };

    matchplaySideData = {
      teamSize,
      side1: {
        count: side1Count,
        playerNames: rows
          .filter((r) => r.team_number === 1)
          .map(nameOf)
          .filter((n): n is string => n != null),
      },
      side2: {
        count: side2Count,
        playerNames: rows
          .filter((r) => r.team_number === 2)
          .map(nameOf)
          .filter((n): n is string => n != null),
      },
    };
  }

  return (
    <AppShell>
      <TopBar backHref="/" back="history" kicker={t('kicker')} />

      <div className="space-y-5">
        <header className="px-1">
          <p className="font-sans text-xs uppercase tracking-[0.12em] text-muted">
            {tModes(game.game_mode as Parameters<typeof tModes>[0])}
          </p>
          <h1 className="mt-1 font-serif text-[28px] font-medium leading-snug tracking-[-0.015em] text-text">
            {localizeGameName(game.name, game.courses?.name ?? null, locale as AppLocale)}
          </h1>
          {game.scheduled_tee_off_at && (
            <p className="mt-1 font-sans text-sm text-muted">
              {t('teeOffLabel')}{' '}
              <time dateTime={game.scheduled_tee_off_at}>
                {formatTeeOff(game.scheduled_tee_off_at, locale as AppLocale)}
              </time>
            </p>
          )}
        </header>

        <PaymentInfo
          entryFeeKr={game.entry_fee_kr}
          paymentLink={game.payment_link}
        />

        {(() => {
          const prizes = safeParsePrizes(game.prizes);
          return prizes.length > 0 ? <PremiebordCard prizes={prizes} /> : null;
        })()}

        <Card>
          {renderBody({
            t,
            tModes,
            game,
            gameLocked,
            signupsClosed,
            isAlreadyRegistered,
            hasOpenPendingRequest,
            hasPendingInvitation,
            isClubMember,
            viewerIsFriend,
            teamCandidates,
            captainEmail: profile!.email,
            matchplaySideData,
            src: srcRaw,
          })}
        </Card>
      </div>
    </AppShell>
  );
}

function renderBody({
  t,
  tModes,
  game,
  gameLocked,
  signupsClosed,
  isAlreadyRegistered,
  hasOpenPendingRequest,
  hasPendingInvitation,
  isClubMember,
  viewerIsFriend,
  teamCandidates,
  captainEmail,
  matchplaySideData,
  src,
}: {
  t: ReturnType<typeof getTranslations<'signup'>> extends Promise<infer R> ? R : never;
  tModes: ReturnType<typeof getTranslations<'modes'>> extends Promise<infer R> ? R : never;
  game: NonNullable<Awaited<ReturnType<typeof getGameByShortId>>>;
  gameLocked: boolean;
  signupsClosed: boolean;
  isAlreadyRegistered: boolean;
  hasOpenPendingRequest: boolean;
  hasPendingInvitation: boolean;
  isClubMember: boolean;
  viewerIsFriend: boolean;
  teamCandidates: TeamCandidate[];
  captainEmail: string | null;
  matchplaySideData: MatchplaySideData | null;
  src: string | null;
}) {
  if (isAlreadyRegistered) {
    return (
      <div className="space-y-4">
        <Banner tone="success">{t('alreadyRegisteredBanner')}</Banner>
        <LinkButton href={`/games/${game.id}`} full>
          {t('goToGameButton')}
        </LinkButton>
      </div>
    );
  }

  if (hasOpenPendingRequest) {
    return (
      <Banner tone="info">
        {t('pendingRequestBanner')}
      </Banner>
    );
  }

  if (gameLocked) {
    return (
      <Banner tone="warning">
        {t('gameLockedBanner', {
          status: game.status === 'active' ? t('gameLockedActive') : t('gameLockedFinished'),
        })}
      </Banner>
    );
  }

  // #543: arrangøren har stengt påmeldingen manuelt — viser en melding uten
  // skjema. Gjelder scheduled spill der arrangøren gjør siste justeringer.
  if (signupsClosed) {
    return (
      <Banner tone="info">
        {t('signupsClosedBanner')}
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
          {t('clubMemberDirectIntro')}
        </p>
        <RegistrationForm
          mode="open"
          shortId={game.short_id}
          sideData={matchplaySideData}
          src={src}
        />
      </div>
    );
  }

  // #369: er du venn av arrangøren og spillet har «Slipp venner direkte inn»
  // aktivert, kan du melde deg på direkte selv om modus er manual_approval.
  if (
    viewerIsFriend &&
    game.registration_mode === 'manual_approval' &&
    game.let_friends_skip_gate === true &&
    game.registration_type === 'solo'
  ) {
    return (
      <div className="space-y-4">
        <p className="font-sans text-sm leading-relaxed text-text">
          {t('friendSkipGateIntro')}
        </p>
        <RegistrationForm
          mode="open"
          shortId={game.short_id}
          sideData={matchplaySideData}
          src={src}
        />
      </div>
    );
  }

  if (game.registration_mode === 'invite_only') {
    if (hasPendingInvitation) {
      return (
        <div className="space-y-4">
          <Banner tone="info">
            {t('inviteHasPendingBanner')}
          </Banner>
          <LinkButton href="/innboks" full variant="secondary">
            {t('goToInboxButton')}
          </LinkButton>
        </div>
      );
    }
    // Lag-spill via invitasjon (#685): invite_only er den private modusen, så en
    // uinvitert kan ikke melde seg på selv — det er meningen. Banneret forklarer
    // hva de skal gjøre (be arrangøren invitere laget). Tidligere var det en
    // stille blindvei uten vei videre; nå får de en knapp tilbake til forsiden.
    if (game.registration_type === 'team') {
      return (
        <div className="space-y-4">
          <Banner tone="info">
            {t('inviteTeamOnlyBanner')}
          </Banner>
          <LinkButton href="/" full variant="secondary">
            {t('notFoundButton')}
          </LinkButton>
        </div>
      );
    }
    // Gjør blindveien til en handling (#368): du har lenken, så du kan be
    // arrangøren om plass. Gjenbruker forespørsel-flyten — `requestApproval`
    // godtar nå invite_only. Spillet forblir uoppdagbart i «Finn turneringer».
    return (
      <div className="space-y-4" data-testid="invite-only-banner">
        <p className="font-sans text-sm leading-relaxed text-text">
          {t('inviteNotInvitedIntro')}
        </p>
        <RegistrationForm mode="manual_approval" shortId={game.short_id} />
      </div>
    );
  }

  // Lag-/solo-flyt (#466): hvilken form vi viser avhenger av registration_type
  // OG om modusen har lag-konsept. 'both' tillater eksplisitt solo, så en
  // solo-format med 'both' faller til solo-formen i stedet for en blindvei —
  // ellers blir et slikt spill umulig å melde seg på via lenken.
  const typeView = resolveRegistrationTypeView(
    game.registration_type,
    gameModeSupportsTeams(game.game_mode),
  );

  if (typeView.kind === 'team_unsupported_mode') {
    return (
      <Banner tone="warning">
        {t('teamUnsupportedModeBanner', {
          mode: tModes(game.game_mode as Parameters<typeof tModes>[0]),
        })}
      </Banner>
    );
  }

  if (typeView.kind === 'team_form') {
    const teamSize = game.mode_config?.team_size ?? 4;
    if (teamSize < 2) {
      return (
        <Banner tone="warning">
          {t('badTeamSizeBanner')}
        </Banner>
      );
    }
    return (
      <div className="space-y-4">
        <p className="font-sans text-sm leading-relaxed text-text">
          {t('teamFormIntro')}
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

  // typeView.kind === 'solo_form' — registration_type 'solo', eller 'both' på
  // en modus uten lag-konsept.
  const mode = game.registration_mode === 'open' ? 'open' : 'manual_approval';
  return (
    <div className="space-y-4">
      {/* For matchplay + open mode, sideData drives the side-picker which replaces
          the standard intro text — we skip the generic text in that case. */}
      {!(mode === 'open' && matchplaySideData) && (
        <p className="font-sans text-sm leading-relaxed text-text">
          {mode === 'open'
            ? t('soloOpenIntro')
            : t('soloManualIntro')}
        </p>
      )}
      <RegistrationForm
        mode={mode}
        shortId={game.short_id}
        sideData={mode === 'open' ? matchplaySideData : null}
        src={src}
      />
    </div>
  );
}

/**
 * Format ISO-timestamp as «8. mai 2026, 14:30» in the active locale, with
 * European 24-hour time. Falls back to the raw string if Intl throws
 * (should never happen for valid ISO strings).
 */
function formatTeeOff(iso: string, locale: AppLocale): string {
  try {
    const datePart = formatDate(iso, locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const timePart = formatTime(iso, locale, {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${datePart}, ${timePart}`;
  } catch {
    return iso;
  }
}
