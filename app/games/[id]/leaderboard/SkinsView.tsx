import type { JSX } from 'react';
import { SmartLink } from '@/components/ui/SmartLink';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Medallion } from '@/components/ui/Medallion';
import { Kicker } from '@/components/ui/Kicker';
import { PullQuote } from '@/components/ui/PullQuote';
import { LeaderboardBackdrop } from '@/components/illustrations/LeaderboardBackdrop';
import { formatRevealName } from '@/lib/names/formatRevealName';
import type {
  SkinsResult,
  SkinsHoleRow,
  SkinsPlayerLine,
} from '@/lib/scoring/modes/types';

/**
 * Spillerinfo for SkinsView. En map fra userId → navn + kallenavn.
 * Caller (leaderboard-page) bygger map-en fra game_players-joinen og
 * sender den inn slik at view-en kan rendre menneske-lesbare navn der
 * scoring-laget kun har userId-er.
 */
export interface SkinsPlayerInfo {
  name: string;
  nickname: string | null;
}

export interface SkinsViewProps {
  /** Spill-id — brukes til (fremtidig) drilldown og analytics. */
  gameId: string;
  /** Turneringsnavn — vises som kicker i header. */
  gameName: string;
  /**
   * Resultat fra `lib/scoring/modes/skins.compute()`.
   * Caller må narrowe på `kind === 'skins'` før propen sendes inn.
   */
  result: SkinsResult;
  /** Spillerinfo per userId for å rendre navn + kallenavn. */
  playersById: Map<string, SkinsPlayerInfo>;
  /**
   * Score-visibility-flagget fra `games.score_visibility`. Når `'reveal'`
   * og spillet ikke er ferdig, skjuler vi totaler og per-hull-skinsoversikt —
   * kun en venterom-melding vises. Når spillet er ferdig konvergerer begge
   * modus på full visning.
   */
  scoreVisibility: 'live' | 'reveal';
  /** `games.status` — styrer reveal-flow sammen med `scoreVisibility`. */
  gameStatus: 'draft' | 'scheduled' | 'active' | 'finished';
  /** Hvor pilen tilbake skal peke. Defaults til spillets hjem. */
  backHref?: string;
  /**
   * Når true, dropper outer Shell + Header — caller eier ytre page-chrome.
   * Brukes inne i LeaderboardTabs eller når en parent (podium) wrapper.
   */
  chromeless?: boolean;
}

/**
 * Live/post-finished leaderboard for Skins med carryover. To seksjoner:
 *
 *   - Spiller-totals øverst (primær storyline): hvem som vant hvor mange
 *     skins er den viktigste informasjonen — spillere gjør opp potten eksternt.
 *     Sortert på totalSkins DESC. Tydelig visning av skins-tall per spiller.
 *   - Per-hull-tabell (sekundær drilldown): hull, par, SI, på-spill (atStake),
 *     utfall. Vunne hull viser vinner + skins scoopet; delte hull viser
 *     carryover-indikator; pending-hull viser at scores mangler. Carryover-
 *     kjeden er synlig slik at det er åpenbart hvor potten samlet seg.
 *   - Henger-skins-linje: når spillet er ferdig og `unwonSkins > 0`, vises
 *     en eksplisitt linje om at disse skinsene er uvunne (standard Skins-regel).
 *
 * Reveal-modus (scoreVisibility='reveal' && status='active'): vi rendrer
 * en venterom-melding i stedet for tall — Skins er et penge-orientert spill
 * (potten gjøres opp eksternt), og det er hyggeligere å holde resultatene
 * under lokk til admin avslutter. Når spillet er ferdig (status='finished')
 * faller vi tilbake til full visning.
 */
export function SkinsView({
  gameId: _gameId,
  gameName,
  result,
  playersById,
  scoreVisibility,
  gameStatus,
  backHref = '/',
  chromeless = false,
}: SkinsViewProps): JSX.Element {
  const isRevealHidden =
    scoreVisibility === 'reveal' && gameStatus !== 'finished';

  if (result.players.length === 0) {
    return (
      <Shell chromeless={chromeless}>
        {!chromeless && <Header gameName={gameName} backHref={backHref} />}
        <p className="mt-12 text-center text-sm text-muted">
          Ingen spillere å vise.
        </p>
      </Shell>
    );
  }

  if (isRevealHidden) {
    return (
      <Shell chromeless={chromeless}>
        {!chromeless && <Header gameName={gameName} backHref={backHref} />}
        <div
          data-testid="skins-reveal-hidden"
          className="mx-4 mt-12 rounded-2xl border border-dashed border-border bg-surface px-5 py-8 text-center"
        >
          <p className="font-serif text-[18px] font-medium text-text">
            Resultatene avsløres etter runden
          </p>
          <p className="mt-2 font-sans text-xs text-muted">
            Skins-potten holdes hemmelig til admin avslutter spillet.
          </p>
        </div>
        <PullQuote className="px-6 pt-4 pb-4">Lykke til.</PullQuote>
      </Shell>
    );
  }

  const subtitleParts = [
    gameStatus === 'finished' ? 'Etter 18 hull' : 'Live',
    'Skins',
    result.scoring === 'net' ? 'Netto' : 'Brutto',
  ];

  const showUnwonSkins =
    gameStatus === 'finished' && result.unwonSkins > 0;

  return (
    <Shell chromeless={chromeless}>
      {!chromeless && <Header gameName={gameName} backHref={backHref} />}

      <div className="px-6 pt-1.5 pb-3.5 text-center">
        <h1 className="font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-text">
          Leaderboard
        </h1>
        <p className="mt-1 text-[11.5px] tabular-nums text-muted">
          {subtitleParts.join(' · ')}
        </p>
      </div>

      {/* Spiller-totals øverst — primær storyline: hvem vant hvor mange skins. */}
      <ul
        data-testid="skins-leaderboard"
        className="flex flex-col gap-2 px-3.5 pt-3 pb-3.5"
      >
        {result.players.map((player, i) => {
          const info = playersById.get(player.userId);
          const displayName = info
            ? formatRevealName(info.name, info.nickname)
            : '(ukjent spiller)';
          return (
            <PlayerRow
              key={player.userId}
              rank={player.rank}
              displayName={displayName}
              totalSkins={player.totalSkins}
              holesWon={player.holesWon}
              tiedWith={player.tiedWith}
              staggerIndex={i}
            />
          );
        })}
      </ul>

      {/* Uvunne skins — transparent om potten henger ved rundeslutt. */}
      {showUnwonSkins && (
        <div
          data-testid="skins-unwon"
          className="mx-3.5 mb-3 rounded-2xl border border-border bg-surface px-4 py-3 text-center"
        >
          <p className="font-sans text-[13px] text-muted">
            <span className="font-semibold tabular-nums text-text">
              {result.unwonSkins}{' '}
              {result.unwonSkins === 1 ? 'skin' : 'skins'}
            </span>{' '}
            ikke vunnet. Siste hull ble delt.
          </p>
        </div>
      )}

      {/* Per-hull-tabell — sekundær drilldown for carryover-kjeden. */}
      <section className="px-3.5 pt-2 pb-3.5">
        <Kicker tone="muted" className="px-1 pb-2">
          PER HULL
        </Kicker>
        <ul
          data-testid="skins-hole-list"
          className="flex flex-col gap-2 list-none"
        >
          {result.holes.map((hole) => (
            <HoleRow
              key={hole.holeNumber}
              hole={hole}
              playersById={playersById}
            />
          ))}
        </ul>
      </section>

      <PullQuote className="px-6 pt-1 pb-4">Lykke til.</PullQuote>
    </Shell>
  );
}

function Shell({
  children,
  chromeless = false,
}: {
  children: React.ReactNode;
  chromeless?: boolean;
}) {
  if (chromeless) {
    return (
      <div className="relative isolate">
        <LeaderboardBackdrop />
        <div className="relative">{children}</div>
      </div>
    );
  }
  return (
    <AppShell>
      <div className="relative isolate pb-12">
        <LeaderboardBackdrop />
        <div className="relative">{children}</div>
      </div>
    </AppShell>
  );
}

function Header({
  gameName,
  backHref,
}: {
  gameName: string;
  backHref: string;
}) {
  return (
    <header className="mb-2 flex items-center justify-between gap-4">
      <SmartLink
        href={backHref}
        aria-label="Tilbake"
        className="-ml-2 inline-flex h-11 w-11 items-center justify-center text-lg text-text"
      >
        ‹
      </SmartLink>
      <Kicker tone="accent">{gameName.toUpperCase()}</Kicker>
      <span className="w-11" aria-hidden />
    </header>
  );
}

function PlayerRow({
  rank,
  displayName,
  totalSkins,
  holesWon,
  tiedWith,
  staggerIndex,
}: {
  rank: number;
  displayName: string;
  totalSkins: number;
  holesWon: number;
  tiedWith: string[];
  staggerIndex: number;
}) {
  const isPodium = rank >= 1 && rank <= 3;
  const isTied = tiedWith.length > 0;
  const rankLabel = isTied ? `T${rank}` : `${rank}`;
  const cardClass =
    rank === 1 && !isTied
      ? 'border-accent bg-accent/[0.06] shadow-[0_2px_12px_rgba(201,169,97,0.15)]'
      : '';

  return (
    <li
      className="list-none reveal-up"
      style={{ animationDelay: `${60 + staggerIndex * 80}ms` }}
    >
      <Card className={`flex items-center gap-3.5 px-4 py-3.5 ${cardClass}`}>
        {isPodium && !isTied ? (
          <span className="shrink-0">
            <Medallion place={rank as 1 | 2 | 3} size={36} />
          </span>
        ) : (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-surface font-serif text-[15px] font-medium text-muted tabular-nums">
            {rankLabel}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="font-serif text-[17px] font-medium tracking-[-0.005em] text-text truncate">
            {displayName}
          </p>
          <p className="mt-0.5 text-[12px] text-muted tabular-nums">
            {holesWon} {holesWon === 1 ? 'hull vunnet' : 'hull vunnet'}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <span className="score-num block text-[26px] leading-none tracking-[-0.02em] text-text tabular-nums">
            {totalSkins}
          </span>
          <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            {totalSkins === 1 ? 'skin' : 'skins'}
          </span>
        </div>
      </Card>
    </li>
  );
}

function outcomeLabel(hole: SkinsHoleRow): string {
  switch (hole.outcome) {
    case 'won':
      return `Vunnet`;
    case 'carryover':
      return 'Delt';
    default:
      return 'Venter på score';
  }
}

function outcomeClass(outcome: SkinsHoleRow['outcome']): string {
  switch (outcome) {
    case 'won':
      return 'text-accent';
    case 'carryover':
      return 'text-muted';
    default:
      return 'text-muted/70';
  }
}

function HoleRow({
  hole,
  playersById,
}: {
  hole: SkinsHoleRow;
  playersById: Map<string, SkinsPlayerInfo>;
}) {
  const winnerInfo = hole.winnerUserId
    ? playersById.get(hole.winnerUserId)
    : null;
  const winnerName = winnerInfo
    ? formatRevealName(winnerInfo.name, winnerInfo.nickname)
    : null;

  const atStakeLabel =
    hole.atStake === 1
      ? '1 skin på spill'
      : `${hole.atStake} skins på spill`;

  return (
    <li
      className="list-none"
      data-testid={`skins-hole-row-${hole.holeNumber}`}
    >
      <Card className="px-3.5 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <span className="font-serif text-[15px] font-medium tabular-nums text-text">
              Hull {hole.holeNumber}
            </span>
            <span className="text-[10.5px] tabular-nums text-muted">
              Par {hole.par} · SI {hole.strokeIndex}
            </span>
          </div>
          {/* Skins på spill — fremhevet når potten er bygget opp */}
          <span
            className={`text-[10.5px] tabular-nums font-medium ${
              hole.atStake > 1 ? 'text-accent' : 'text-muted'
            }`}
          >
            {atStakeLabel}
          </span>
        </div>

        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12px] text-muted">
          <span className={`font-medium ${outcomeClass(hole.outcome)}`}>
            {outcomeLabel(hole)}
          </span>

          {hole.outcome === 'won' && winnerName && (
            <>
              <span aria-hidden className="text-muted/40">
                ·
              </span>
              <span className="text-text">{winnerName}</span>
              <span aria-hidden className="text-muted/40">
                ·
              </span>
              <span className="tabular-nums text-accent font-medium">
                +{hole.skinsAwarded}{' '}
                {hole.skinsAwarded === 1 ? 'skin' : 'skins'}
              </span>
            </>
          )}

          {hole.outcome === 'carryover' && (
            <>
              <span aria-hidden className="text-muted/40">
                ·
              </span>
              <span className="text-muted">ruller videre</span>
            </>
          )}
        </div>

        {/* Carryover-kjede: vis carriedIn når det er en bygget pott (atStake > 1)
            slik at det er åpenbart hvor potten samlet seg opp til dette hullet. */}
        {hole.carriedIn > 0 && (
          <p className="mt-1 text-[11px] tabular-nums text-muted/70">
            {hole.carriedIn}{' '}
            {hole.carriedIn === 1 ? 'skin' : 'skins'} rullet inn
          </p>
        )}
      </Card>
    </li>
  );
}

// Re-export for use in SkinsPodium (avoids separate import of the same type).
export type { SkinsPlayerLine };
