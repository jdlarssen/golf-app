import { Suspense } from 'react';
import { SmartLink } from '@/components/ui/SmartLink';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { Skeleton } from '@/components/ui/Skeleton';
import { GameForm } from '@/app/admin/games/new/GameForm';
import {
  createGameDraft,
  createAndPublishGame,
} from '@/app/admin/games/new/actions';
import {
  ERROR_MESSAGES_NEW_GAME,
  buildErrorMessage as buildGameErrorMessage,
} from '@/lib/admin/gameErrorMessages';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { getNewGameFormData } from '@/lib/games/newGameFormData';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrTrustedCreator } from '@/lib/admin/auth';

// Trusted-creator-rute under #198 small-bet MVP. Gjenbruker GameForm fra
// admin-flyten, men kjører i AppShell (ikke AdminShell/Sekretariatet) slik
// at ikke-admin-trusted-brukere ikke får admin-shell-utseendet.
//
// Suksess- og valideringsfeil bouncer fortsatt via /admin/games/* — som
// admin-layouten redirecter trusted-brukere ut av til `/`. Akseptert ru
// kant for MVP; polish hvis adopsjon > 30 % i 30-dagers observasjons-
// vinduet.

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

export default async function OpprettSpillPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // Gate FØR vi rendrer noe — håndhever admin-eller-trusted og fanger
  // ikke-trusted vanlige brukere før de ser form-en.
  const supabase = await getServerClient();
  await requireAdminOrTrustedCreator(supabase);

  const sp = await searchParams;
  const errorMessage = buildErrorMessage(first(sp.error), first(sp.emails));
  const userId = await getProxyVerifiedUserId();

  return (
    <AppShell>
      <TopBar backHref="/" kicker="Nytt spill" userId={userId} />

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
    </AppShell>
  );
}

async function PlayerShortageBanner() {
  const { players } = await getNewGameFormData();
  if (players.length >= 8) return null;
  const isSingular = players.length === 1;
  return (
    <div className="mt-4">
      <Banner tone="info">
        Du har {players.length === 0 ? 'ingen' : `bare ${players.length}`}{' '}
        registrert{isSingular ? '' : 'e'} spiller{isSingular ? '' : 'e'}.
        Best ball trenger 8, stableford holder med 1. Be admin invitere flere
        fra{' '}
        <SmartLink href="/" className="underline hover:no-underline">
          forsiden
        </SmartLink>
        .
      </Banner>
    </div>
  );
}

async function GameFormBody() {
  const { courses, players } = await getNewGameFormData();
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
