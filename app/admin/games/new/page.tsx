import { Suspense } from 'react';
import { SmartLink } from '@/components/ui/SmartLink';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { Skeleton } from '@/components/ui/Skeleton';
import { GameWizard } from './GameWizard';
import { createGameDraft, createAndPublishGame } from './actions';
import {
  ERROR_MESSAGES_NEW_GAME,
  buildErrorMessage as buildGameErrorMessage,
} from '@/lib/admin/gameErrorMessages';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { getNewGameFormData } from '@/lib/games/newGameFormData';
import { getServerClient } from '@/lib/supabase/server';

type SearchParams = Promise<{
  error?: string | string[];
  emails?: string | string[];
  tournament_id?: string | string[];
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

export default async function NewGamePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const errorMessage = buildErrorMessage(first(sp.error), first(sp.emails));
  const userId = await getProxyVerifiedUserId();

  // Cup-link (#47): hvis admin lander via /admin/cup/[id], pre-fyller vi
  // game_mode + match-label og låser modus-velgeren.
  const tournamentIdParam = first(sp.tournament_id);
  const cupContext = tournamentIdParam
    ? await loadCupContext(tournamentIdParam)
    : null;

  return (
    <AdminShell>
      <TopBar
        backHref="/admin/games"
        kicker="Spill · protokoll"
        userId={userId}
      />

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

      {cupContext && (
        <div className="mt-4">
          <Banner tone="info">
            Match-en kobles til cupen <strong>{cupContext.name}</strong>.
            Spillmodus er låst til matchplay (1 vs 1).
          </Banner>
        </div>
      )}

      <Suspense fallback={null}>
        <PlayerShortageBanner />
      </Suspense>

      <div className="mt-5">
        <Card>
          <Suspense fallback={<GameFormSkeleton />}>
            <GameFormBody cupContext={cupContext} />
          </Suspense>
        </Card>
      </div>
    </AdminShell>
  );
}

type CupContext = {
  id: string;
  name: string;
  nextMatchLabel: string;
};

async function loadCupContext(tournamentId: string): Promise<CupContext | null> {
  const supabase = await getServerClient();
  const { data: cup } = await supabase
    .from('tournaments')
    .select('id, name, status')
    .eq('id', tournamentId)
    .maybeSingle<{ id: string; name: string; status: string }>();
  if (!cup) return null;
  if (cup.status === 'finished') return null;
  const { count } = await supabase
    .from('games')
    .select('id', { head: true, count: 'exact' })
    .eq('tournament_id', cup.id);
  return {
    id: cup.id,
    name: cup.name,
    nextMatchLabel: `Singles ${(count ?? 0) + 1}`,
  };
}

async function PlayerShortageBanner() {
  const { players } = await getNewGameFormData();
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

async function GameFormBody({ cupContext }: { cupContext: CupContext | null }) {
  const { courses, players } = await getNewGameFormData();
  return (
    <GameWizard
      courses={courses}
      players={players}
      mode={{
        kind: 'create',
        createDraftAction: createGameDraft,
        createAndPublishAction: createAndPublishGame,
      }}
      initialValues={
        cupContext
          ? {
              game_mode: 'singles_matchplay',
              team_size: 1,
              lock_game_mode: true,
              tournament_id: cupContext.id,
              tournament_match_label: cupContext.nextMatchLabel,
              name: cupContext.nextMatchLabel,
            }
          : undefined
      }
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
