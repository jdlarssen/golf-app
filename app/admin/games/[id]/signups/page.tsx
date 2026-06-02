import { notFound } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrTrustedCreator } from '@/lib/admin/auth';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { Banner } from '@/components/ui/Banner';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { MiniRibbon } from '@/components/ui/MiniRibbon';
import { SmartLink } from '@/components/ui/SmartLink';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { PåmeldingerClient } from './PåmeldingerClient';
import type { RequestStatus, RequestRow, TabKey } from './types';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  tab?: string | string[];
  status?: string | string[];
  error?: string | string[];
}>;

const STATUS_BANNERS: Record<string, string> = {
  approved: '✓ Påmeldingen er godkjent. Spilleren er lagt til rosteren.',
  rejected: '✓ Påmeldingen er avvist. Spilleren får varsel.',
};

const ERROR_MESSAGES: Record<string, string> = {
  not_pending:
    'Forespørselen er allerede avgjort av en annen administrator. Last siden på nytt.',
  game_locked:
    'Spillet er startet eller avsluttet. Påmeldinger kan ikke endres lenger.',
  not_authorized: 'Du har ikke tilgang til å avgjøre påmeldinger på dette spillet.',
  db_update: 'Klarte ikke å lagre avgjørelsen. Prøv igjen.',
  db_players: 'Klarte ikke å legge spilleren til rosteren. Prøv igjen.',
  db_cascade: 'Klarte ikke å hente lag-medlemmene. Prøv igjen.',
  db_team_slot: 'Klarte ikke å finne en ledig lag-plass. Prøv igjen.',
  no_team_slot: 'Spillet har ingen ledige lag igjen.',
  reason_too_long: 'Begrunnelsen er for lang (maks 200 tegn).',
};

const TABS: { key: TabKey; label: string; status: RequestStatus }[] = [
  { key: 'pending', label: 'Venter', status: 'pending' },
  { key: 'approved', label: 'Godkjent', status: 'approved' },
  { key: 'rejected', label: 'Avvist', status: 'rejected' },
  { key: 'withdrawn', label: 'Trukket', status: 'withdrawn' },
];

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

type GameRow = {
  id: string;
  name: string;
  short_id: string;
  status: 'draft' | 'scheduled' | 'active' | 'finished';
  registration_mode: 'invite_only' | 'manual_approval' | 'open';
  registration_type: 'solo' | 'team' | 'both';
};

type RawRequestRow = {
  id: string;
  user_id: string;
  status: RequestStatus;
  team_name: string | null;
  is_team_captain: boolean;
  team_request_id: string | null;
  message: string | null;
  rejection_reason: string | null;
  created_at: string;
  decided_at: string | null;
  users: { name: string | null; nickname: string | null; email: string } | null;
};

function toRequestRow(raw: RawRequestRow): RequestRow {
  const baseName = raw.users?.name ?? raw.users?.email ?? '(ukjent spiller)';
  const displayName = raw.users?.nickname
    ? `${baseName} «${raw.users.nickname}»`
    : baseName;
  return {
    id: raw.id,
    userId: raw.user_id,
    status: raw.status,
    displayName,
    teamName: raw.team_name,
    isTeamCaptain: raw.is_team_captain,
    teamRequestId: raw.team_request_id,
    message: raw.message,
    rejectionReason: raw.rejection_reason,
    createdAt: raw.created_at,
    decidedAt: raw.decided_at,
  };
}

export default async function PåmeldingerPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const supabase = await getServerClient();
  await requireAdminOrTrustedCreator(supabase);

  const { data: game, error: gameError } = await supabase
    .from('games')
    .select(
      'id, name, short_id, status, registration_mode, registration_type',
    )
    .eq('id', id)
    .single<GameRow>();
  if (gameError || !game) notFound();

  const tabKey = (first(sp.tab) as TabKey | undefined) ?? 'pending';
  const activeTab = TABS.find((t) => t.key === tabKey) ?? TABS[0];

  // Hent forespørsler for valgt fane. Vi henter brukerkolonner via FK-joinen
  // slik at vi kan vise navn/nickname uten en ekstra round-trip per rad.
  const { data: rawRequests, error: requestsError } = await supabase
    .from('game_registration_requests')
    .select(
      'id, user_id, status, team_name, is_team_captain, team_request_id, message, rejection_reason, created_at, decided_at, users(name, nickname, email)',
    )
    .eq('game_id', id)
    .eq('status', activeTab.status)
    .order('created_at', { ascending: true })
    .returns<RawRequestRow[]>();

  if (requestsError) {
    console.error('[påmeldinger] requests fetch failed', requestsError);
  }

  const requests = (rawRequests ?? []).map(toRequestRow);

  // Tab-tellere så fanene viser counts. Én SELECT med count=exact per status
  // ville vært 4 round-trips; vi velger heller en lett aggregert query.
  const { data: countRows } = await supabase
    .from('game_registration_requests')
    .select('status')
    .eq('game_id', id)
    .returns<{ status: RequestStatus }[]>();

  const counts: Record<RequestStatus, number> = {
    pending: 0,
    approved: 0,
    rejected: 0,
    withdrawn: 0,
  };
  for (const row of countRows ?? []) {
    counts[row.status] += 1;
  }

  const userId = await getProxyVerifiedUserId();
  const statusBanner = STATUS_BANNERS[first(sp.status) ?? ''];
  const errorCode = first(sp.error);
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;

  const gameLocked = game.status === 'active' || game.status === 'finished';
  const isInviteOnly = game.registration_mode === 'invite_only';

  return (
    <AdminShell>
      <TopBar
        backHref={`/admin/games/${id}`}
        kicker="Påmeldinger"
        userId={userId}
      />

      <BrassRibbon kicker="Selv-påmelding" />

      <div className="px-1">
        <h1 className="font-serif text-[26px] font-medium leading-snug tracking-[-0.015em] text-text">
          Påmeldinger
        </h1>
        <p className="mt-1 font-sans text-xs text-muted">{game.name}</p>
      </div>

      {(statusBanner || errorMessage) && (
        <div className="mt-4 space-y-2">
          {statusBanner && <Banner tone="success">{statusBanner}</Banner>}
          {errorMessage && <Banner tone="error">{errorMessage}</Banner>}
        </div>
      )}

      {isInviteOnly && (
        <div className="mt-4">
          <Banner tone="info">
            Dette spillet er invitasjonsbasert og dukker ikke opp i Finn
            turneringer. Folk som har lenken kan likevel be om å bli med.
            Forespørslene havner her, så du kan godkjenne eller avslå.
          </Banner>
        </div>
      )}

      {/* Filter-tabs */}
      <nav className="mt-5 -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {TABS.map((t) => {
          const isActive = t.key === activeTab.key;
          return (
            <SmartLink
              key={t.key}
              href={`/admin/games/${id}/signups?tab=${t.key}`}
              className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium tracking-tight transition-colors ${
                isActive
                  ? 'bg-primary text-white dark:text-bg'
                  : 'border border-border bg-surface text-text hover:bg-primary-soft'
              }`}
            >
              <span>{t.label}</span>
              <span
                className={`tabular-nums ${isActive ? 'text-white/70 dark:text-bg/70' : 'text-muted'}`}
              >
                {counts[t.status]}
              </span>
            </SmartLink>
          );
        })}
      </nav>

      <section className="mt-4">
        <MiniRibbon>{activeTab.label}</MiniRibbon>
        <div
          className="overflow-hidden rounded-xl border border-border bg-surface"
          style={{ boxShadow: '0 1px 2px rgba(26, 46, 31, 0.03)' }}
        >
          <PåmeldingerClient
            gameId={id}
            requests={requests}
            tab={activeTab.key}
            locked={gameLocked}
          />
        </div>
      </section>
    </AdminShell>
  );
}
