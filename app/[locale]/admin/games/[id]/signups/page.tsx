import { first } from '@/lib/url/searchParams';
import { notFound } from 'next/navigation';
import { getTranslations, getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrTrustedCreator } from '@/lib/admin/auth';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { Banner } from '@/components/ui/Banner';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { MiniRibbon } from '@/components/ui/MiniRibbon';
import { SmartLink } from '@/components/ui/SmartLink';
import { PåmeldingerClient } from './PåmeldingerClient';
import type { RequestStatus, RequestRow, TabKey } from './types';
import { localizeGameName } from '@/lib/games/autoGameName';
import type { AppLocale } from '@/i18n/routing';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  tab?: string | string[];
  status?: string | string[];
  error?: string | string[];
}>;

type GameRow = {
  id: string;
  name: string;
  short_id: string;
  status: 'draft' | 'scheduled' | 'active' | 'finished';
  registration_mode: 'invite_only' | 'manual_approval' | 'open';
  registration_type: 'solo' | 'team' | 'both';
  // #624 — banenavn for re-lokalisering av auto-genererte spillnavn.
  courses: { name: string } | null;
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

function toRequestRow(raw: RawRequestRow, unknownPlayer: string): RequestRow {
  const baseName = raw.users?.name ?? raw.users?.email ?? unknownPlayer;
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

  const t = await getTranslations('admin.game.signups');
  const tDetail = await getTranslations('admin.game.detail');
  const locale = (await getLocale()) as AppLocale;

  const supabase = await getServerClient();
  await requireAdminOrTrustedCreator(supabase);

  const { data: game, error: gameError } = await supabase
    .from('games')
    .select(
      'id, name, short_id, status, registration_mode, registration_type, courses(name)',
    )
    .eq('id', id)
    .single<GameRow>();
  if (gameError || !game) notFound();

  const TABS: { key: TabKey; label: string; status: RequestStatus }[] = [
    { key: 'pending', label: t('tabs.pending'), status: 'pending' },
    { key: 'approved', label: t('tabs.approved'), status: 'approved' },
    { key: 'rejected', label: t('tabs.rejected'), status: 'rejected' },
    { key: 'withdrawn', label: t('tabs.withdrawn'), status: 'withdrawn' },
  ];

  const tabKey = (first(sp.tab) as TabKey | undefined) ?? 'pending';
  const activeTab = TABS.find((tab) => tab.key === tabKey) ?? TABS[0];

  // Hent forespørsler for valgt fane. Vi henter brukerkolonner via FK-joinen
  // slik at vi kan vise navn/nickname uten en ekstra round-trip per rad.
  // `game_registration_requests` har TO FK-er til `users` (`user_id` =
  // forespørreren, `decided_by_user_id` = admin som avgjorde). Uten eksplisitt
  // FK-hint blir embedden tvetydig (PostgREST PGRST201) og hele fetchen feiler,
  // så fanen viser null forespørsler. Vi pinner `user_id`-FK-en — det er
  // forespørrerens navn vi rendrer i `toRequestRow`.
  const { data: rawRequests, error: requestsError } = await supabase
    .from('game_registration_requests')
    .select(
      'id, user_id, status, team_name, is_team_captain, team_request_id, message, rejection_reason, created_at, decided_at, users!game_registration_requests_user_id_fkey(name, nickname, email)',
    )
    .eq('game_id', id)
    .eq('status', activeTab.status)
    .order('created_at', { ascending: true })
    .returns<RawRequestRow[]>();

  if (requestsError) {
    console.error('[påmeldinger] requests fetch failed', requestsError);
  }

  const unknownPlayer = tDetail('unknownPlayer');
  const requests = (rawRequests ?? []).map((raw) =>
    toRequestRow(raw, unknownPlayer),
  );

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

  const statusKey = first(sp.status);
  const statusBanner = statusKey === 'approved'
    ? t('statusBanners.approved')
    : statusKey === 'rejected'
    ? t('statusBanners.rejected')
    : undefined;
  const errorCode = first(sp.error);
  const errorMessage = errorCode
    ? t.has(`errors.${errorCode}` as Parameters<typeof t>[0])
      ? t(`errors.${errorCode}` as Parameters<typeof t>[0])
      : undefined
    : undefined;

  const gameLocked = game.status === 'active' || game.status === 'finished';
  const isInviteOnly = game.registration_mode === 'invite_only';

  return (
    <AdminShell>
      <TopBar
        backHref={`/admin/games/${id}`}
        kicker={t('topBarKicker')}
      />

      <BrassRibbon kicker={t('brassRibbon')} />

      <div className="px-1">
        <h1 className="font-serif text-[26px] font-medium leading-snug tracking-[-0.015em] text-text">
          {t('heading')}
        </h1>
        <p className="mt-1 font-sans text-xs text-muted">
          {localizeGameName(game.name, game.courses?.name ?? null, locale)}
        </p>
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
            {t('inviteOnlyBanner')}
          </Banner>
        </div>
      )}

      {/* Filter-tabs */}
      <nav className="mt-5 -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {TABS.map((tab) => {
          const isActive = tab.key === activeTab.key;
          return (
            <SmartLink
              key={tab.key}
              href={`/admin/games/${id}/signups?tab=${tab.key}`}
              className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium tracking-tight transition-colors ${
                isActive
                  ? 'bg-primary text-white dark:text-bg'
                  : 'border border-border bg-surface text-text hover:bg-primary-soft'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`tabular-nums ${isActive ? 'text-white/70 dark:text-bg/70' : 'text-muted'}`}
              >
                {counts[tab.status]}
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
