import { Suspense, cache } from 'react';
import { redirect } from 'next/navigation';
import { SmartLink } from '@/components/ui/SmartLink';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  GameForm,
  type CourseOption,
  type PlayerOption,
  type InitialValues,
} from '@/app/admin/games/new/GameForm';
import {
  saveDraftAction,
  publishFromDraftAction,
  updateScheduledAction,
} from './actions';
import {
  ERROR_MESSAGES_NEW_GAME,
  buildErrorMessage as buildGameErrorMessage,
} from '@/lib/admin/gameErrorMessages';
import {
  ALL_CATEGORY_IDS,
  type SideCategoryId,
} from '@/lib/scoring/sideTournamentConfig';
import type { GameMode, GameModeConfig } from '@/lib/scoring/modes/types';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  error?: string | string[];
  emails?: string | string[];
}>;

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function buildErrorMessage(
  errorCode: string | undefined,
  emails: string | undefined,
): string | undefined {
  return buildGameErrorMessage(ERROR_MESSAGES_NEW_GAME, errorCode, emails);
}

type CourseRow = {
  id: string;
  name: string;
  tee_boxes: {
    id: string;
    name: string;
    slope_mens: number | null;
    course_rating_mens: number | null;
    par_total_mens: number | null;
    slope_ladies: number | null;
    course_rating_ladies: number | null;
    par_total_ladies: number | null;
    slope_juniors: number | null;
    course_rating_juniors: number | null;
    par_total_juniors: number | null;
  }[];
};

type UserRow = {
  id: string;
  name: string | null;
  nickname: string | null;
  hcp_index: number | string;
  email: string;
  profile_completed_at: string | null;
  gender: 'mens' | 'ladies' | null;
  level: 'junior' | 'normal' | 'senior';
};

type GameRow = {
  id: string;
  name: string;
  status: 'draft' | 'scheduled' | 'active' | 'finished';
  // Nullable since migration 0011 — drafts may not have a course or tee
  // assigned yet.
  course_id: string | null;
  tee_box_id: string | null;
  scheduled_tee_off_at: string | null;
  hcp_allowance_pct: number;
  require_peer_approval: boolean;
  score_visibility: 'live' | 'reveal';
  side_tournament_enabled: boolean;
  side_ld_count: number;
  side_ctp_count: number;
  // v1.2.0 — `text[]` på DB-siden. Vi narrow til SideCategoryId[] etter load.
  side_disabled_categories: string[];
  // Epic #41 — modus + JSONB-config. Mode-lock-guarden i edit-actions
  // krever at form-en sender disse uendret tilbake for publiserte spill.
  game_mode: GameMode;
  // mode_config JSONB — leses for Texas-spesifikke felt (team_size,
  // team_handicap_pct) som ikke har dedikerte kolonner. Andre modi-konfig
  // utledes av GameForm fra game_mode + team_size.
  mode_config: GameModeConfig;
  // #199 — self-påmeldings-akser. Pre-fylles inn i form-en så edit-flyten
  // ikke nullstiller admin's valg.
  registration_mode: 'invite_only' | 'manual_approval' | 'open';
  registration_type: 'solo' | 'team' | 'both';
};

type GamePlayerRow = {
  user_id: string;
  // Nullable siden 0030 — solo-modus (stableford) bruker null på begge.
  team_number: number | null;
  flight_number: number | null;
  tee_gender: 'mens' | 'ladies' | 'juniors';
};

// `datetime-local` inputs want 'YYYY-MM-DDTHH:mm' in browser-local time, but
// the DB stores `timestamptz` (UTC instant). We pre-format the value in
// Europe/Oslo wall-clock so the input shows the same time the admin originally
// picked — regardless of where the admin's browser thinks it is right now.
function formatForDateTimeLocalInOslo(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Oslo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  // en-CA produces YYYY-MM-DD HH:MM (24h); reshape to YYYY-MM-DDTHH:mm so it
  // matches what <input type="datetime-local"> emits and accepts.
  const parts = fmt.formatToParts(d);
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;
  return `${m.year}-${m.month}-${m.day}T${m.hour}:${m.minute}`;
}

const getEditContext = cache(async () => {
  const supabase = await getServerClient();
  const userId = await getProxyVerifiedUserId();
  return { supabase, userId };
});

export default async function EditGamePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const errorMessage = buildErrorMessage(first(sp.error), first(sp.emails));

  const { supabase, userId } = await getEditContext();
  if (!userId) redirect('/login');

  // Self-gate for Fase 4 chunk 2 layout-loosening (#223). Replaces the
  // inline is_admin Promise.all-entry; the game row fetches below now
  // runs sequentially after the gate so trusted-non-admin callers don't
  // even trigger the games-select.
  await requireAdmin(supabase);

  const { data: game, error: gameError } = await supabase
    .from('games')
    .select(
      'id, name, status, course_id, tee_box_id, scheduled_tee_off_at, hcp_allowance_pct, require_peer_approval, score_visibility, side_tournament_enabled, side_ld_count, side_ctp_count, side_disabled_categories, game_mode, mode_config, registration_mode, registration_type',
    )
    .eq('id', id)
    .single<GameRow>();

  if (gameError || !game) {
    redirect('/admin/games');
  }

  // Edits are allowed while the game is still in 'draft' or 'scheduled'.
  // Once it flips to 'active' or 'finished', state changes (handicaps, scores)
  // make the roster and tee-off effectively immutable.
  if (game.status !== 'draft' && game.status !== 'scheduled') {
    redirect(`/admin/games/${id}?error=not_editable`);
  }

  return (
    <AdminShell>
      <TopBar
        backHref={`/admin/games/${id}`}
        kicker="Spill · protokoll"
        userId={userId}
      />

      <BrassRibbon kicker="Rediger spill" />

      <div className="px-1">
        <h1 className="mb-0.5 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          {game.name}
        </h1>
        <p className="font-sans text-[11.5px] text-muted">
          Endre bane, spillere, lag eller innstillinger
        </p>
      </div>

      <div className="mt-4 space-y-2">
        {errorMessage && <Banner tone="error">{errorMessage}</Banner>}
        <Banner tone="info">
          {game.status === 'draft'
            ? 'Spillet er fortsatt et utkast, så bare du ser det. Fyll inn det som mangler og publiser når dere er klare.'
            : 'Spillet er i planlagt-fasen. Spillerne ser endringene neste gang de åpner appen.'}
        </Banner>
        <Suspense fallback={null}>
          <PlayerShortageBanner gameMode={game.game_mode} />
        </Suspense>
      </div>

      <div className="mt-5">
        <Card>
          <Suspense fallback={<GameFormSkeleton />}>
            <EditGameFormBody gameId={id} game={game} />
          </Suspense>
        </Card>
      </div>
    </AdminShell>
  );
}

const getOptions = cache(async () => {
  const { supabase } = await getEditContext();
  const [coursesResult, usersResult] = await Promise.all([
    supabase
      .from('courses')
      .select(
        'id, name, tee_boxes(id, name, slope_mens, course_rating_mens, par_total_mens, slope_ladies, course_rating_ladies, par_total_ladies, slope_juniors, course_rating_juniors, par_total_juniors)',
      )
      .order('name', { ascending: true })
      .returns<CourseRow[]>(),
    supabase
      .from('users')
      .select('id, name, nickname, hcp_index, email, profile_completed_at, gender, level')
      .order('profile_completed_at', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true, nullsFirst: true })
      .returns<UserRow[]>(),
  ]);
  if (coursesResult.error) throw coursesResult.error;
  if (usersResult.error) throw usersResult.error;

  const courses: CourseOption[] = (coursesResult.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    tee_boxes: (c.tee_boxes ?? [])
      .map((t) => ({
        id: t.id,
        name: t.name,
        has_mens:
          t.slope_mens !== null &&
          t.course_rating_mens !== null &&
          t.par_total_mens !== null,
        has_ladies:
          t.slope_ladies !== null &&
          t.course_rating_ladies !== null &&
          t.par_total_ladies !== null,
        has_juniors:
          t.slope_juniors !== null &&
          t.course_rating_juniors !== null &&
          t.par_total_juniors !== null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'no')),
  }));

  const playerOptions: PlayerOption[] = (usersResult.data ?? []).map((u) => ({
    id: u.id,
    name: u.name,
    nickname: u.nickname ?? null,
    hcp_index: Number(u.hcp_index),
    email: u.email,
    pending: u.profile_completed_at === null,
    gender: u.gender,
    level: u.level,
  }));

  return { courses, playerOptions };
});

async function PlayerShortageBanner({ gameMode }: { gameMode: GameMode }) {
  // Stableford trenger bare 1 spiller — banner-en (som nudge om total
  // klubb-størrelse) er ikke relevant her, og «Du trenger 8 spillere»-copy-en
  // ville vært direkte misvisende for et solo-format.
  if (gameMode === 'stableford') return null;
  const { playerOptions } = await getOptions();
  if (playerOptions.length >= 8) return null;
  return (
    <Banner tone="info">
      Du trenger 8 registrerte spillere for best ball. Inviter flere fra{' '}
      <SmartLink
        href="/admin/spillere"
        className="underline hover:no-underline"
      >
        Spillere
      </SmartLink>
      -siden.
    </Banner>
  );
}

async function EditGameFormBody({
  gameId,
  game,
}: {
  gameId: string;
  game: GameRow;
}) {
  const { supabase } = await getEditContext();
  const [{ courses, playerOptions }, playersResult] = await Promise.all([
    getOptions(),
    supabase
      .from('game_players')
      .select('user_id, team_number, flight_number, tee_gender')
      .eq('game_id', gameId)
      .returns<GamePlayerRow[]>(),
  ]);

  if (playersResult.error) throw playersResult.error;

  // Narrow `text[]` fra DB til SideCategoryId[]. CHECK-constraint i migrasjon
  // 0026 garanterer at alle verdier er gyldige; defensiv filter her fanger en
  // hypotetisk drift hvis nye kategorier landerer i koden uten å være lagt til
  // i DB-constraintet.
  const validIds = new Set<string>(ALL_CATEGORY_IDS);
  const loadedDisabledCategories: SideCategoryId[] = (
    game.side_disabled_categories ?? []
  ).filter((id): id is SideCategoryId => validIds.has(id));

  const playerRows = playersResult.data ?? [];
  const playerGenders: Record<string, 'M' | 'D' | 'J'> = {};
  for (const p of playerRows) {
    playerGenders[p.user_id] =
      p.tee_gender === 'ladies' ? 'D' : p.tee_gender === 'juniors' ? 'J' : 'M';
  }

  const initialValues: InitialValues = {
    name: game.name,
    // course_id / tee_box_id may be null on a draft. The form treats undefined
    // as "not chosen yet", so coerce with ??.
    course_id: game.course_id ?? undefined,
    tee_box_id: game.tee_box_id ?? undefined,
    scheduled_tee_off_at: formatForDateTimeLocalInOslo(
      game.scheduled_tee_off_at,
    ),
    hcp_allowance_pct: String(game.hcp_allowance_pct),
    require_peer_approval: game.require_peer_approval,
    score_visibility: game.score_visibility,
    // Edit page redirects away from active/finished games (see status guard
    // above), so lock_score_visibility is always false here. Threaded
    // through anyway so the form's lock-state UI stays a function of props,
    // not of where the form happens to be rendered.
    lock_score_visibility: false,
    side_tournament_enabled: game.side_tournament_enabled,
    side_ld_count: game.side_ld_count,
    side_ctp_count: game.side_ctp_count,
    // v1.2.0 — pre-populer kategori-velgeren med det som ligger lagret. For
    // spill opprettet før migrasjon 0026 vil dette være et tomt array (DB
    // default), som tilsvarer Full pakke; vi respekterer det heller enn å
    // overstyre til Klassisk, fordi det er en bevisst lagret state.
    side_disabled_categories: loadedDisabledCategories,
    // Same shape as lock_score_visibility — the status guard above means
    // active/finished games never reach this branch. Future-proofed for a
    // hypothetical read-only view of locked games.
    lock_side_tournament: false,
    player_genders: playerGenders,
    players: playerRows.map((p) => ({
      user_id: p.user_id,
      team_number: p.team_number,
      flight_number: p.flight_number,
    })),
    // Epic #41 — pre-fyller modus + lås for ikke-draft spill. Backend
    // mode-lock-guard avviser bytte etter publisering, så UI-en speiler
    // dette ved å vise modus-tile-ene som disabled. Lagstørrelse-en
    // utledes av GameForm fra modus (Stableford → 1, Best ball → 2);
    // for Texas leser vi den fra mode_config siden den er valgbar (2 eller 4).
    game_mode: game.game_mode,
    lock_game_mode: game.status !== 'draft',
    // Texas-spesifikke felt: leses fra mode_config (JSONB). Andre modi har
    // ingen ekstra konfig å pre-fylle utover game_mode + (avledet) team_size.
    team_size:
      game.mode_config.kind === 'texas_scramble'
        ? game.mode_config.team_size
        : game.mode_config.kind === 'stableford'
          ? game.mode_config.team_size
          : undefined,
    texas_team_handicap_pct:
      game.mode_config.kind === 'texas_scramble'
        ? String(game.mode_config.team_handicap_pct)
        : undefined,
    registration_mode: game.registration_mode,
    registration_type: game.registration_type,
  };

  if (game.status === 'draft') {
    return (
      <GameForm
        courses={courses}
        players={playerOptions}
        initialValues={initialValues}
        mode={{
          kind: 'edit-draft',
          gameId,
          saveDraftAction,
          publishAction: publishFromDraftAction,
        }}
      />
    );
  }

  return (
    <GameForm
      courses={courses}
      players={playerOptions}
      initialValues={initialValues}
      mode={{
        kind: 'edit-scheduled',
        gameId,
        updateAction: updateScheduledAction,
      }}
    />
  );
}

function GameFormSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full rounded-lg" />
      <Skeleton className="h-10 w-full rounded-lg" delay={60} />
      <Skeleton className="h-32 w-full rounded-lg" delay={120} />
      <Skeleton className="h-32 w-full rounded-lg" delay={180} />
      <Skeleton className="h-12 w-full rounded-full" delay={240} />
    </div>
  );
}
