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
import { parseIntent, type Intent } from '@/lib/wizard/intent';
import {
  getFormatsForIntent,
  getCupEligibleFormats,
} from '@/lib/formats/getFormatsForIntent';

type SearchParams = Promise<{
  error?: string | string[];
  emails?: string | string[];
  tournament_id?: string | string[];
  game_mode?: string | string[];
  // F2 foundation (#272): wizard step 1 leser dette og pre-velger intent.
  // Cup-link fra /admin/cup/[id] vil sette intent=cup. Direkte URL kan også.
  intent?: string | string[];
}>;

/**
 * Modi som er gyldige for cup-link-pre-fyll. Cup-detalj-siden har én knapp
 * per støttet modus — andre verdier (best-ball, stableford, …) hopper over
 * pre-fyllen og lar admin starte fra default i wizarden.
 */
type CupGameMode = 'singles_matchplay' | 'fourball_matchplay';

function parseCupGameMode(raw: string | undefined): CupGameMode {
  if (raw === 'fourball_matchplay') return 'fourball_matchplay';
  // Default + singles_matchplay → singles. Bevarer dagens oppførsel (cup-link
  // uten game_mode-parameter trådte tidligere alltid på singles-løypa).
  return 'singles_matchplay';
}

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
  // game_mode + match-label og låser modus-velgeren. `game_mode`-param-en
  // (singles_matchplay | fourball_matchplay) styrer hvilken modus admin lander
  // på — cup-detalj-siden har én knapp per støttet modus.
  const tournamentIdParam = first(sp.tournament_id);
  const requestedCupMode = parseCupGameMode(first(sp.game_mode));
  const cupContext = tournamentIdParam
    ? await loadCupContext(tournamentIdParam, requestedCupMode)
    : null;

  // F2 foundation (#272): URL-drevet intent for wizard step 1. Cup-link
  // overstyrer alltid til 'cup' (en cup-link er per definisjon en
  // cup-arrangement-flyt). Andre intents leses fra ?intent=.
  const initialIntent: Intent | undefined = cupContext
    ? 'cup'
    : parseIntent(first(sp.intent));

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
            Match-en kobles til cupen <strong>{cupContext.name}</strong>.{' '}
            {cupContext.gameMode === 'fourball_matchplay'
              ? 'Spillmodus er låst til four-ball matchplay (2 vs 2).'
              : 'Spillmodus er låst til matchplay (1 vs 1).'}
          </Banner>
        </div>
      )}

      <Suspense fallback={null}>
        <PlayerShortageBanner />
      </Suspense>

      <div className="mt-5">
        <Card>
          <Suspense fallback={<GameFormSkeleton />}>
            <GameFormBody cupContext={cupContext} initialIntent={initialIntent} />
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
  gameMode: CupGameMode;
  /**
   * Cup-radens default fourball-allowance (0 = brutto, 1..100 = netto-prosent).
   * Pre-fylles inn i wizard sin netto/brutto-toggle for fourball-matches så
   * admin starter med cup-en sin innstilling. Settes også for singles-matches
   * for å holde typen ren — wizard-en bruker bare verdien når game_mode er
   * fourball.
   */
  fourballAllowancePct: number;
};

async function loadCupContext(
  tournamentId: string,
  requestedMode: CupGameMode,
): Promise<CupContext | null> {
  const supabase = await getServerClient();
  const { data: cup } = await supabase
    .from('tournaments')
    .select('id, name, status, fourball_allowance_pct')
    .eq('id', tournamentId)
    .maybeSingle<{
      id: string;
      name: string;
      status: string;
      fourball_allowance_pct: number | null;
    }>();
  if (!cup) return null;
  if (cup.status === 'finished') return null;
  // Match-label-numerering teller eksisterende matches AV SAMME modus så
  // admin får «Fourball 1» / «Fourball 2» / «Singles 1» / «Singles 2»
  // uavhengig av rekkefølge i cupen.
  const { count } = await supabase
    .from('games')
    .select('id', { head: true, count: 'exact' })
    .eq('tournament_id', cup.id)
    .eq('game_mode', requestedMode);
  const labelPrefix =
    requestedMode === 'fourball_matchplay' ? 'Fourball' : 'Singles';
  // Default 85 (WHS) hvis cup-raden ikke har verdien satt (eldre cups før
  // 0045-migrasjonen, eller cups opprettet før chunk 5 lå ute).
  const fourballAllowancePct = cup.fourball_allowance_pct ?? 85;
  return {
    id: cup.id,
    name: cup.name,
    nextMatchLabel: `${labelPrefix} ${(count ?? 0) + 1}`,
    gameMode: requestedMode,
    fourballAllowancePct,
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

async function GameFormBody({
  cupContext,
  initialIntent,
}: {
  cupContext: CupContext | null;
  initialIntent: Intent | undefined;
}) {
  // Forhåndshent format-katalogen for alle ikke-cup-intents + cup-eligible
  // listen så client-wizard kan switche intent uten ekstra fetch. Parallell
  // henting + unstable_cache i F1-helperen gjør dette billig (4 DB-queries
  // sum, alle tag-cachet 24h).
  const [kompisFormats, klubbFormats, soloFormats, cupEligibleFormats] =
    await Promise.all([
      getFormatsForIntent('kompis'),
      getFormatsForIntent('klubb'),
      getFormatsForIntent('solo'),
      getCupEligibleFormats(),
    ]);

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
        cupContext ? buildCupInitialValues(cupContext) : undefined
      }
      initialIntent={initialIntent}
      formatsByIntent={{
        kompis: kompisFormats,
        klubb: klubbFormats,
        solo: soloFormats,
      }}
      cupEligibleFormats={cupEligibleFormats}
    />
  );
}

/**
 * Bygger `initialValues` per cup-game-mode. Singles og fourball deler tournament-
 * link-feltene; fourball legger til `fourball_allowance_pct` pre-fyll fra
 * cup-raden så admin starter med cup-en sin innstilling for nye fourball-
 * matches.
 */
function buildCupInitialValues(cup: CupContext) {
  const base = {
    lock_game_mode: true as const,
    tournament_id: cup.id,
    tournament_match_label: cup.nextMatchLabel,
    name: cup.nextMatchLabel,
  };
  if (cup.gameMode === 'fourball_matchplay') {
    return {
      ...base,
      game_mode: 'fourball_matchplay' as const,
      team_size: 2 as const,
      fourball_allowance_pct: cup.fourballAllowancePct,
    };
  }
  return {
    ...base,
    game_mode: 'singles_matchplay' as const,
    team_size: 1 as const,
  };
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
