import { first } from '@/lib/url/searchParams';
import { Suspense, cache } from 'react';
import { redirect } from '@/i18n/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { Skeleton } from '@/components/ui/Skeleton';
import { updateProfile } from './actions';
import { safeNextPath } from './safeNext';
import { ProfileFormBody } from './ProfileFormBody';
import { SmartLink } from '@/components/ui/SmartLink';
import { getIncomingFriendRequestCount } from '@/lib/friends/getIncomingFriendRequestCount';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { SettingRow, SettingList } from '@/components/ui/SettingRow';
import { InstallButton } from '@/components/pwa/InstallButton';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher';
import { formatHcpDisplay } from '@/lib/handicap/sign';
import { isHandicapStale } from '@/lib/handicap/staleness';
import { formatDate } from '@/lib/i18n/format';
import {
  computePlayerStats,
  type MyStats,
  type RoundInput,
} from '@/lib/stats/playerStats';
import { parForGender } from '@/lib/stats/achievements';
import {
  COURSE_HOLES_SELECT,
  type CourseHoleRow,
} from '@/lib/supabase/queryFragments';
import type { ScoringGender } from '@/lib/scoring/modes/types';
import type { AppLocale } from '@/i18n/routing';

const EMPTY_STATS: MyStats = {
  roundsPlayed: 0,
  grossAverage: null,
  bestRound: null,
  achievements: { holeInOne: 0, eagle: 0, birdie: 0, turkey: 0, snowman: 0 },
};

type SearchParams = Promise<{
  error?: string | string[];
  profile?: string | string[];
  next?: string | string[];
}>;

const getProfileContext = cache(async () => {
  const supabase = await getServerClient();
  const userId = await getProxyVerifiedUserId();
  return { supabase, userId };
});

/**
 * Fetches the full users row needed by both `ProfileFormCard` and
 * `GenderSoftPrompt`. React `cache()` memoises per render — the two separate
 * Suspense subtrees get the same promise so only one round-trip fires. (#874)
 */
const getProfileRow = cache(async () => {
  const { supabase, userId } = await getProfileContext();
  if (!userId) return null;
  const { data, error } = await supabase
    .from('users')
    .select(
      'name, nickname, hcp_index, handicap_updated_at, email, profile_completed_at, gender, level',
    )
    .eq('id', userId)
    .single();
  return { data, error };
});

type GpStatRow = {
  game_id: string;
  tee_gender: ScoringGender | null;
  games: { id: string; course_id: string } | null;
};

/**
 * Personlige «Mine tall» (#865): runder spilt + brutto-snitt + beste runde +
 * livstids-bragder, fra spillerens egne brutto-scorer i ferdige spill. Request-
 * scoped cookie-client (RLS dekker egne scores + finished-scores), `cache()`-
 * memoisert per render. Ren brutto — netto er historikkens domene (#866).
 */
const getMyStats = cache(async (): Promise<MyStats> => {
  const { supabase, userId } = await getProfileContext();
  if (!userId) return EMPTY_STATS;

  // Round-trip 1: own player-rows in finished games (+ tee-gender + course).
  const { data: gpRows, error: gpError } = await supabase
    .from('game_players')
    .select('game_id, tee_gender, games!inner(id, course_id, status)')
    .eq('user_id', userId)
    .eq('games.status', 'finished')
    .returns<GpStatRow[]>();
  if (gpError) throw gpError;
  const rows = gpRows ?? [];
  if (rows.length === 0) return EMPTY_STATS;

  const meta = new Map<string, { courseId: string; gender: ScoringGender | null }>();
  for (const r of rows) {
    if (r.games) {
      meta.set(r.game_id, { courseId: r.games.course_id, gender: r.tee_gender });
    }
  }
  const gameIds = [...meta.keys()];
  const courseIds = [...new Set([...meta.values()].map((m) => m.courseId))];

  // Round-trips 2+3: per-gender par for those courses + own scores for those
  // games. Parallel — they don't depend on each other.
  const [holesRes, scoresRes] = await Promise.all([
    supabase
      .from('course_holes')
      .select(`course_id, ${COURSE_HOLES_SELECT}`)
      .in('course_id', courseIds)
      .returns<Array<CourseHoleRow & { course_id: string }>>(),
    supabase
      .from('scores')
      .select('game_id, hole_number, strokes')
      .eq('user_id', userId)
      .in('game_id', gameIds)
      .returns<Array<{ game_id: string; hole_number: number; strokes: number | null }>>(),
  ]);
  if (holesRes.error) throw holesRes.error;
  if (scoresRes.error) throw scoresRes.error;

  const holesByCourse = new Map<string, Map<number, CourseHoleRow>>();
  for (const h of holesRes.data ?? []) {
    let perHole = holesByCourse.get(h.course_id);
    if (!perHole) {
      perHole = new Map();
      holesByCourse.set(h.course_id, perHole);
    }
    perHole.set(h.hole_number, h);
  }

  const scoresByGame = new Map<
    string,
    Array<{ hole_number: number; strokes: number | null }>
  >();
  for (const s of scoresRes.data ?? []) {
    const arr = scoresByGame.get(s.game_id) ?? [];
    arr.push(s);
    scoresByGame.set(s.game_id, arr);
  }

  // One RoundInput per finished game (par chosen per the player's tee-gender).
  const rounds: RoundInput[] = gameIds.map((gameId) => {
    const m = meta.get(gameId)!;
    const courseHoles = holesByCourse.get(m.courseId);
    const scoreRows = scoresByGame.get(gameId) ?? [];
    return {
      holes: scoreRows.map((s) => {
        const holeRow = courseHoles?.get(s.hole_number);
        return {
          holeNumber: s.hole_number,
          strokes: s.strokes,
          par: holeRow ? parForGender(holeRow, m.gender) : 0,
        };
      }),
    };
  });

  return computePlayerStats(rounds);
});

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations('profile');
  const { userId } = await getProfileContext();
  if (!userId) {
    redirect({ href: '/login', locale });
  }

  const params = await searchParams;
  const errorCode = first(params.error);
  const errorMessage = errorCode && t.has(`errors.${errorCode}` as Parameters<typeof t>[0])
    ? t(`errors.${errorCode}` as Parameters<typeof t>[0])
    : errorCode ? t('errors.unknown') : undefined;
  const profileUpdated = first(params.profile) === 'updated';
  const nextSafe = safeNextPath(first(params.next));

  return (
    <AppShell>
      <TopBar backHref="/" backLabel={t('backLabel')} kicker={t('kicker')} />

      {profileUpdated && (
        <div className="mb-4">
          <Banner tone="success">{t('updatedBanner')}</Banner>
        </div>
      )}

      <Suspense fallback={null}>
        <GenderSoftPrompt />
      </Suspense>

      <Suspense fallback={<ProfileFormSkeleton />}>
        <ProfileFormCard errorMessage={errorMessage} next={nextSafe} />
      </Suspense>

      <div className="mt-6">
        <Suspense fallback={<MyStatsSkeleton />}>
          <MyStatsCard />
        </Suspense>
      </div>

      <div className="mt-6">
        <Suspense fallback={<Skeleton className="h-[76px] rounded-2xl" />}>
          <VennerCard />
        </Suspense>
      </div>

      {/* Settings split into labelled sections for clarity. Extra vertical
          space before «Slett konto» prevents accidental taps on the destructive
          action (one-door-per-room: dedicated /slett-konto confirm page). */}
      <div className="mt-8 space-y-6">
        {/* Aktivitet */}
        <section>
          <p className="mb-2 px-1 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
            {t('sectionPersonal')}
          </p>
          <SettingList>
            <SettingRow href="/profile/historikk" label={t('historikkRow')} />
          </SettingList>
        </section>

        {/* App */}
        <section>
          <p className="mb-2 px-1 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
            {t('sectionApp')}
          </p>
          <SettingList>
            <div className="flex w-full items-center justify-between gap-3 min-h-[56px] px-5 py-3 border-t border-border first:border-t-0">
              <span className="font-serif text-base font-medium text-text">
                {t('languageRowLabel')}
              </span>
              <LocaleSwitcher />
            </div>
            <div className="flex w-full items-center justify-between gap-3 min-h-[56px] px-5 py-3 border-t border-border first:border-t-0">
              <span className="font-serif text-base font-medium text-text">
                {t('theme.rowLabel')}
              </span>
              <ThemeSwitcher />
            </div>
            <InstallButton />
          </SettingList>
        </section>

        {/* Konto — eksport og destruktiv slett-handling */}
        <section>
          <p className="mb-2 px-1 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
            {t('sectionAccount')}
          </p>
          <SettingList>
            <SettingRow
              href="/profile/export"
              download
              label={t('exportRow')}
              sublabel={t('exportSublabel')}
            />
          </SettingList>
          {/* Extra spacing isolates the destructive action visually. */}
          <div className="mt-4">
            <SettingList>
              <SettingRow
                href="/profile/slett-konto"
                label={t('deleteRow')}
                tone="danger"
              />
            </SettingList>
          </div>
        </section>
      </div>

      <AccountActions />
    </AppShell>
  );
}

/**
 * Konto-handling nederst på Profil-siden. «Logg ut» er en konto-handling og
 * bor her. «Sekretariatet» (admin-rommet) ble flyttet til Hjem — der admin
 * lander og lett finner den — så den ligger ikke lenger her (#355-oppfølging).
 */
async function AccountActions() {
  const t = await getTranslations('profile');
  return (
    <div className="mt-8 border-t border-border/60 pt-6 dark:border-border/80">
      <form action="/logout" method="post">
        <SubmitButton variant="secondary" className="w-full" pendingLabel={t('logoutPending')}>
          {t('logoutButton')}
        </SubmitButton>
      </form>
    </div>
  );
}

async function ProfileFormCard({
  errorMessage,
  next,
}: {
  errorMessage: string | undefined;
  next: string | null;
}) {
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations('profile');

  const result = await getProfileRow();
  const { data: profile, error: profileError } = result ?? { data: null, error: null };

  // Old logic was: "no row" means not yet onboarded — but the auth.users trigger
  // now pre-creates a placeholder row, so check the completion timestamp instead.
  if (profileError) {
    throw profileError;
  }
  if (!profile?.profile_completed_at) {
    redirect({ href: '/complete-profile', locale });
  }

  // profile is guaranteed non-null after the redirect above (redirect() is not
  // typed as `never` in next-intl, so TS can't narrow automatically).
  const p = profile!;
  const displayName = p.name ?? '';
  const initial = displayName.trim().charAt(0).toUpperCase() || '?';
  const hasHcp = p.hcp_index != null;
  const hcpDisplay = hasHcp ? formatHcpDisplay(p.hcp_index!, locale) : null;
  const stale = isHandicapStale(p.handicap_updated_at);
  const oppdatertDato =
    hasHcp && p.handicap_updated_at && !stale
      ? formatDate(p.handicap_updated_at, locale, {
          day: 'numeric',
          month: 'long',
        })
      : null;

  return (
    <Card>
      {errorMessage && (
        <div className="mb-4">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}
      <div className="mb-5 flex items-center gap-3">
        <div
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-soft font-serif text-lg font-medium text-text"
        >
          {initial}
        </div>
        <div className="min-w-0">
          <h1 className="font-serif text-lg font-medium text-text leading-tight truncate">
            {displayName || t('displayNameFallback')}
          </h1>
          {hcpDisplay ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
              <p className="text-sm text-muted tabular-nums">hcp {hcpDisplay}</p>
              {stale ? (
                <span className="rounded-full bg-warning/10 px-2 py-0.5 font-sans text-[11px] text-warning">
                  {t('hcpStaleShort')}
                </span>
              ) : oppdatertDato ? (
                <span className="font-sans text-[11px] text-muted">
                  {t('hcpUpdatedShort', { dato: oppdatertDato })}
                </span>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-sm text-muted tabular-nums">hcp –</p>
              <SmartLink
                href="#hcp_index"
                className="rounded-full bg-primary/10 px-2 py-0.5 font-sans text-[11px] font-medium text-primary hover:bg-primary/20 transition-colors"
              >
                {t('setHandicap')}
              </SmartLink>
            </div>
          )}
        </div>
      </div>
      <ProfileFormBody
        email={p.email}
        handicapUpdatedAt={p.handicap_updated_at}
        initial={{
          name: p.name ?? '',
          nickname: p.nickname ?? '',
          hcpIndex:
            p.hcp_index == null ? '' : String(p.hcp_index),
          gender: p.gender,
          level: p.level,
        }}
        action={updateProfile}
        next={next}
      />
    </Card>
  );
}

async function GenderSoftPrompt() {
  const t = await getTranslations('profile');
  const result = await getProfileRow();
  if (!result) return null;
  const { data: profile } = result;
  if (!profile || profile.gender !== null) return null;

  return (
    <div className="mb-4">
      <Card>
        <h2 className="font-serif text-base font-medium text-text mb-1">
          {t('genderPrompt.heading')}
        </h2>
        <p className="text-sm text-muted mb-3">
          {t('genderPrompt.body')}
        </p>
        <SmartLink
          href="#kjonn"
          className="inline-flex items-center rounded-full bg-primary px-4 py-2 font-sans text-[13px] font-medium text-bg hover:bg-primary/90 transition-colors"
        >
          {t('genderPrompt.cta')}
        </SmartLink>
      </Card>
    </div>
  );
}

function ProfileFormSkeleton() {
  return (
    <Card>
      <div className="space-y-4">
        <div>
          <Skeleton className="h-3.5 w-12 mb-1.5" />
          <Skeleton className="h-4 w-48" delay={30} />
        </div>
        <Skeleton className="h-12 w-full rounded-lg" delay={60} />
        <Skeleton className="h-12 w-full rounded-lg" delay={120} />
        <Skeleton className="h-12 w-full rounded-lg" delay={180} />
        <Skeleton className="h-10 w-24 rounded-full" delay={240} />
      </div>
    </Card>
  );
}

/**
 * «Mine tall» (#865): the end-of-loop reflection block — three gross numbers
 * plus a lifetime brag stripe. Gross-only on purpose (handicap-independent,
 * universal across all modes); netto lives in /profile/historikk (#866).
 */
async function MyStatsCard() {
  const t = await getTranslations('profile.myStats');
  const stats = await getMyStats();

  const achievements = (
    [
      ['holeInOne', stats.achievements.holeInOne, t('achievementHoleInOne')],
      ['eagle', stats.achievements.eagle, t('achievementEagle')],
      ['birdie', stats.achievements.birdie, t('achievementBirdie')],
      ['turkey', stats.achievements.turkey, t('achievementTurkey')],
      ['snowman', stats.achievements.snowman, t('achievementSnowman')],
    ] as const
  ).filter(([, count]) => count > 0);

  return (
    <Card>
      <h2 className="font-serif text-base font-medium text-text mb-3">
        {t('heading')}
      </h2>
      {stats.roundsPlayed === 0 ? (
        <p className="font-sans text-sm text-muted leading-relaxed">
          {t('emptyState')}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <StatTile
              label={t('roundsPlayed')}
              value={String(stats.roundsPlayed)}
            />
            <StatTile
              label={t('grossAverage')}
              value={stats.grossAverage != null ? String(stats.grossAverage) : '–'}
            />
            <StatTile
              label={t('bestRound')}
              value={stats.bestRound != null ? String(stats.bestRound) : '–'}
            />
          </div>
          {achievements.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
                {t('achievementsLabel')}
              </p>
              <div className="flex flex-wrap gap-2">
                {achievements.map(([key, count, label]) => (
                  <span
                    key={key}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg px-3 py-1 font-sans text-[13px] text-text"
                  >
                    <span>{label}</span>
                    <span className="font-semibold tabular-nums text-primary">
                      {count}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-bg/50 px-3 py-3 text-center">
      <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-muted leading-none mb-1.5">
        {label}
      </p>
      <p className="font-serif text-2xl font-medium text-text tabular-nums leading-none">
        {value}
      </p>
    </div>
  );
}

function MyStatsSkeleton() {
  return (
    <Card>
      <Skeleton className="h-5 w-24 mb-3" />
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-[68px] rounded-xl" />
        <Skeleton className="h-[68px] rounded-xl" delay={60} />
        <Skeleton className="h-[68px] rounded-xl" delay={120} />
      </div>
    </Card>
  );
}

/**
 * Profilens ENE venne-dør (#870). Det tidligere invitér-kortet er fjernet —
 * Venner-siden dekker alt det gjorde (legg-til-på-e-post faller selv tilbake
 * til invitasjon når adressen ikke er på Tørny). Kortet bærer et merke når det
 * finnes innkommende venneforespørsler («én dør per rom»). Slankt count-kall,
 * ikke hele `getFriendData`-fan-out-en.
 */
async function VennerCard() {
  const t = await getTranslations('profile');
  const { userId } = await getProfileContext();
  const incomingCount = userId
    ? await getIncomingFriendRequestCount(userId)
    : 0;
  const hasIncoming = incomingCount > 0;

  return (
    <SmartLink
      href="/profile/venner"
      className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      <Card className="min-h-[44px] flex items-center justify-between gap-3 hover:border-primary/30 transition-colors p-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-serif text-base font-medium text-text">
              {t('friendsRow')}
            </h2>
            {hasIncoming && (
              <span
                aria-hidden="true"
                className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-accent px-1.5 py-0.5 font-sans text-[11px] font-semibold tabular-nums text-bg"
              >
                {incomingCount > 9 ? '9+' : incomingCount}
              </span>
            )}
          </div>
          <p className="text-sm text-muted mt-0.5">
            {hasIncoming
              ? t('friendsBadgeSublabel', { count: incomingCount })
              : t('friendsSublabel')}
          </p>
        </div>
        <span aria-hidden className="text-muted shrink-0">
          →
        </span>
      </Card>
    </SmartLink>
  );
}
