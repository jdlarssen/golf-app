import { Suspense, cache } from 'react';
import { SmartLink } from '@/components/ui/SmartLink';
import { getServerClient } from '@/lib/supabase/server';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { Skeleton } from '@/components/ui/Skeleton';
import { GameForm, type CourseOption, type PlayerOption } from './GameForm';
import { createGameDraft, createAndPublishGame } from './actions';
import {
  ERROR_MESSAGES_NEW_GAME,
  buildErrorMessage as buildGameErrorMessage,
} from '@/lib/admin/gameErrorMessages';

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
};

const getNewGameContext = cache(async () => {
  const supabase = await getServerClient();
  return { supabase };
});

// Both the optional player-shortage banner and the GameForm need this data;
// cache so we only round-trip once even though two Suspense boundaries read
// from it.
const getFormData = cache(async () => {
  const { supabase } = await getNewGameContext();
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
      .select('id, name, nickname, hcp_index, email, profile_completed_at')
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

  const players: PlayerOption[] = (usersResult.data ?? []).map((u) => ({
    id: u.id,
    name: u.name,
    nickname: u.nickname ?? null,
    hcp_index: Number(u.hcp_index),
    email: u.email,
    pending: u.profile_completed_at === null,
  }));

  return { courses, players };
});

export default async function NewGamePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const errorMessage = buildErrorMessage(first(sp.error), first(sp.emails));

  return (
    <AdminShell>
      <TopBar backHref="/admin/games" kicker="Spill · protokoll" />

      <BrassRibbon kicker="Nytt spill" />

      <div className="px-1">
        <h1 className="mb-0.5 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          Sett opp ny runde
        </h1>
        <p className="font-sans text-[11.5px] text-muted">
          Bane, spillere, lag og innstillinger
        </p>
      </div>

      {errorMessage && (
        <div className="mt-4">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}

      <Suspense fallback={null}>
        <PlayerShortageBanner />
      </Suspense>

      <div className="mt-5">
        <Card>
          <Suspense fallback={<GameFormSkeleton />}>
            <GameFormBody />
          </Suspense>
        </Card>
      </div>
    </AdminShell>
  );
}

async function PlayerShortageBanner() {
  const { players } = await getFormData();
  if (players.length >= 8) return null;
  // /new vet ikke hvilken modus admin lander på (velges i form-en under),
  // så copy-en nevner begge moduser. /edit har eget banner som dropper
  // visning helt for stableford siden modus er låst der.
  const isSingular = players.length === 1;
  return (
    <div className="mt-4">
      <Banner tone="info">
        Du har {players.length === 0 ? 'ingen' : `bare ${players.length}`}{' '}
        registrert{isSingular ? '' : 'e'} spiller{isSingular ? '' : 'e'}.
        Best ball trenger 8, stableford holder med 1. Inviter flere fra{' '}
        <SmartLink
          href="/admin/spillere"
          className="underline hover:no-underline"
        >
          Spillere
        </SmartLink>
        -siden.
      </Banner>
    </div>
  );
}

async function GameFormBody() {
  const { courses, players } = await getFormData();
  return (
    <GameForm
      courses={courses}
      players={players}
      mode={{
        kind: 'create',
        createDraftAction: createGameDraft,
        createAndPublishAction: createAndPublishGame,
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
