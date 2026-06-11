import type { JSX } from 'react';
import { useTranslations } from 'next-intl';
import { SmartLink } from '@/components/ui/SmartLink';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Medallion } from '@/components/ui/Medallion';
import { Kicker } from '@/components/ui/Kicker';
import { PullQuote } from '@/components/ui/PullQuote';
import { LeaderboardBackdrop } from '@/components/illustrations/LeaderboardBackdrop';
import { formatRevealName } from '@/lib/names/formatRevealName';
import type {
  AceyDeuceyResult,
  AceyDeuceyHoleRow,
} from '@/lib/scoring/modes/types';

/**
 * Spillerinfo for AceyDeuceyView. En map fra userId → navn + kallenavn.
 * Caller (leaderboard-page) bygger map-en fra game_players-joinen og
 * sender den inn slik at view-en kan rendre menneske-lesbare navn der
 * scoring-laget kun har userId-er.
 */
export interface AceyDeuceyPlayerInfo {
  name: string;
  nickname: string | null;
}

export interface AceyDeuceyViewProps {
  /** Spill-id — brukes til (fremtidig) drilldown og analytics. */
  gameId: string;
  /** Turneringsnavn — vises som kicker i header. */
  gameName: string;
  /**
   * Resultat fra `lib/scoring/modes/aceyDeucey.compute()`.
   * Caller må narrowe på `kind === 'acey_deucey'` før propen sendes inn.
   */
  result: AceyDeuceyResult;
  /** Spillerinfo per userId for å rendre navn + kallenavn. */
  playersById: Map<string, AceyDeuceyPlayerInfo>;
  /**
   * Score-visibility-flagget fra `games.score_visibility`. Når `'reveal'`
   * og spillet ikke er ferdig, skjuler vi totaler og per-hull-oversikt —
   * kun en venterom-melding vises. Når spillet er ferdig konvergerer begge
   * modus på full visning. Speiler SkinsView-mønstret.
   */
  scoreVisibility: 'live' | 'reveal';
  /** `games.status` — styrer reveal-flow sammen med `scoreVisibility`. */
  gameStatus: 'draft' | 'scheduled' | 'active' | 'finished';
  /** Hvor pilen tilbake skal peke. Defaults til spillets hjem. */
  backHref?: string;
  /**
   * Når true, dropper outer Shell + Header — caller eier ytre page-chrome.
   * Brukes inne i en parent (podium) wrapper.
   */
  chromeless?: boolean;
}

/**
 * Live/post-finished leaderboard for Acey Deucey. To seksjoner:
 *
 *   - Spiller-totaler øverst: rangert på total poeng, med undertekst
 *     som viser ace- og deuce-teller. Totalen vises med eksplisitt fortegn
 *     (+3, −3) og kan være negativ.
 *   - Per-hull-tabell: hvem som var ace (+3) og deuce (−3) per hull, eller
 *     «Delt» (ingen utdeling) / «Venter» (uferdig hull).
 *
 * Reveal-modus (scoreVisibility='reveal' && status='active'): venterom-melding
 * i stedet for tall. Speiler SkinsView-mønstret.
 */
export function AceyDeuceyView({
  gameId: _gameId,
  gameName,
  result,
  playersById,
  scoreVisibility,
  gameStatus,
  backHref = '/',
  chromeless = false,
}: AceyDeuceyViewProps): JSX.Element {
  const t = useTranslations('leaderboard');
  const isRevealHidden =
    scoreVisibility === 'reveal' && gameStatus !== 'finished';

  if (result.players.length === 0) {
    return (
      <Shell chromeless={chromeless}>
        {!chromeless && <Header gameName={gameName} backHref={backHref} />}
        <p className="mt-12 text-center text-sm text-muted">
          {t('common.noPlayersToShow')}
        </p>
      </Shell>
    );
  }

  if (isRevealHidden) {
    return (
      <Shell chromeless={chromeless}>
        {!chromeless && <Header gameName={gameName} backHref={backHref} />}
        <div
          data-testid="acey-deucey-reveal-hidden"
          className="mx-4 mt-12 rounded-2xl border border-dashed border-border bg-surface px-5 py-8 text-center"
        >
          <p className="font-serif text-[18px] font-medium text-text">
            {t('common.revealHiddenTitle')}
          </p>
          <p className="mt-2 font-sans text-xs text-muted">
            {t('aceyDeucey.revealHiddenSub')}
          </p>
        </div>
        <PullQuote className="px-6 pt-4 pb-4">{t('common.goodLuck')}</PullQuote>
      </Shell>
    );
  }

  const scoringLabel = result.scoring === 'net' ? t('common.netto') : t('common.brutto');
  const subtitleParts = [
    gameStatus === 'finished' ? t('common.after18Holes') : t('common.live'),
    'Acey Deucey',
    scoringLabel,
  ];

  return (
    <Shell chromeless={chromeless}>
      {!chromeless && <Header gameName={gameName} backHref={backHref} />}

      <div className="px-6 pt-1.5 pb-3.5 text-center">
        <h1 className="font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-text">
          {t('common.leaderboardHeading')}
        </h1>
        <p className="mt-1 text-[11.5px] tabular-nums text-muted">
          {subtitleParts.join(' · ')}
        </p>
      </div>

      {/* Spiller-totaler øverst — primær storyline: hvem leder på poeng. */}
      <ul
        data-testid="acey-deucey-leaderboard"
        className="flex flex-col gap-2 px-3.5 pt-3 pb-3.5"
      >
        {result.players.map((player, i) => {
          const info = playersById.get(player.userId);
          const displayName = info
            ? formatRevealName(info.name, info.nickname)
            : t('common.unknownPlayerFull');
          return (
            <PlayerRow
              key={player.userId}
              rank={player.rank}
              displayName={displayName}
              aces={player.aces}
              deuces={player.deuces}
              total={player.total}
              tiedWith={player.tiedWith}
              staggerIndex={i}
            />
          );
        })}
      </ul>

      {/* Per-hull-tabell — sekundær drilldown for ace/deuce per hull. */}
      <section className="px-3.5 pt-2 pb-3.5">
        <Kicker tone="muted" className="px-1 pb-2">
          {t('common.perHullKicker')}
        </Kicker>
        <ul
          data-testid="acey-deucey-hole-list"
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

      <PullQuote className="px-6 pt-1 pb-4">{t('common.goodLuck')}</PullQuote>
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
  const t = useTranslations('leaderboard');
  return (
    <header className="mb-2 flex items-center justify-between gap-4">
      <SmartLink
        href={backHref}
        aria-label={t('common.backAriaLabel')}
        className="-ml-2 inline-flex h-11 w-11 items-center justify-center text-lg text-text"
      >
        ‹
      </SmartLink>
      <Kicker tone="accent">{gameName.toUpperCase()}</Kicker>
      <span className="w-11" aria-hidden />
    </header>
  );
}

/** Formatterer et heltall med eksplisitt fortegn: +3, 0, −3 (ekte minustegn). */
function formatSigned(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`; // U+2212 MINUS SIGN
  return '0';
}

function PlayerRow({
  rank,
  displayName,
  aces,
  deuces,
  total,
  tiedWith,
  staggerIndex,
}: {
  rank: number;
  displayName: string;
  aces: number;
  deuces: number;
  total: number;
  tiedWith: string[];
  staggerIndex: number;
}) {
  const t = useTranslations('leaderboard');
  const isPodium = rank >= 1 && rank <= 3;
  const isTied = tiedWith.length > 0;
  const rankLabel = isTied ? `T${rank}` : `${rank}`;
  const isLeader = rank === 1 && !isTied;
  const cardClass = isLeader
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
            {t('aceyDeucey.aceDeuce', { aces, deuces })}
          </p>
          {isTied && (
            <p className="text-[11px] text-muted mt-0.5">{t('common.tiedRank', { rank })}</p>
          )}
        </div>

        <div className="shrink-0 text-right">
          <span
            className={`score-num block text-[26px] leading-none tracking-[-0.02em] tabular-nums ${
              isLeader ? 'text-accent' : 'text-text'
            }`}
          >
            {formatSigned(total)}
          </span>
          <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            {t('common.poengLabel')}
          </span>
        </div>
      </Card>
    </li>
  );
}

function HoleRow({
  hole,
  playersById,
}: {
  hole: AceyDeuceyHoleRow;
  playersById: Map<string, AceyDeuceyPlayerInfo>;
}) {
  const t = useTranslations('leaderboard');

  const aceName = hole.aceUserId
    ? (() => {
        const info = playersById.get(hole.aceUserId);
        return info ? formatRevealName(info.name, info.nickname) : '(ukjent)';
      })()
    : null;

  const deuceName = hole.deuceUserId
    ? (() => {
        const info = playersById.get(hole.deuceUserId);
        return info ? formatRevealName(info.name, info.nickname) : '(ukjent)';
      })()
    : null;

  return (
    <li
      className="list-none"
      data-testid={`acey-deucey-hole-row-${hole.holeNumber}`}
    >
      <Card className="px-3.5 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <span className="font-serif text-[15px] font-medium tabular-nums text-text">
              {t('common.hullNumber', { number: hole.holeNumber })}
            </span>
            <span className="text-[10.5px] tabular-nums text-muted">
              Par {hole.par} · SI {hole.strokeIndex}
            </span>
          </div>
        </div>

        {!hole.scored ? (
          <p className="mt-1.5 text-[12px] text-muted/70">{t('common.venter')}</p>
        ) : (
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px]">
            {/* Ace-siden */}
            <span className="flex items-baseline gap-1">
              <span className="font-medium text-text">
                {aceName ?? t('aceyDeucey.deltLabel')}
              </span>
              <span className="tabular-nums text-muted">+3</span>
            </span>

            <span aria-hidden className="text-muted/40">
              ·
            </span>

            {/* Deuce-siden */}
            <span className="flex items-baseline gap-1">
              <span className="font-medium text-text">
                {deuceName ?? t('aceyDeucey.deltLabel')}
              </span>
              {/* U+2212 MINUS SIGN */}
              <span className="tabular-nums text-muted">{'−'}3</span>
            </span>
          </div>
        )}
      </Card>
    </li>
  );
}
