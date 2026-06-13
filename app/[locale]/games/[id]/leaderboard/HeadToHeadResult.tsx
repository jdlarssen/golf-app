'use client';

import { useEffect, useState, type JSX } from 'react';
import { useTranslations } from 'next-intl';
import { SmartLink } from '@/components/ui/SmartLink';
import { AppShell } from '@/components/ui/AppShell';
import { Kicker } from '@/components/ui/Kicker';
import { LeaderboardBackdrop } from '@/components/illustrations/LeaderboardBackdrop';
import { formatRevealName } from '@/lib/names/formatRevealName';
import { ConfettiBurst } from './ConfettiBurst';

// Distinkt sessionStorage-prefiks så duell-konfettien ikke kolliderer med
// podium-konfettien (skins/wolf/nassau-podiene har egne nøkler).
const STORAGE_PREFIX = 'torny-h2h-confetti-seen-';

/** Ett momentum-felt per hull: hvem vant/ledet hullet head-to-head. */
export type StripCell = 'a' | 'b' | 'halved' | 'unplayed';

export interface HeadToHeadSide {
  userId: string;
  name: string;
  nickname: string | null;
  /** Format-metrikken (skins/poeng/units) — vinner = høyest. */
  score: number;
  /** Valgfri sekundær-stat under tallet, f.eks. «5 hull vunnet». */
  subLabel?: string;
}

export interface HeadToHeadResultProps {
  /** Spill-id — sessionStorage-nøkkel + back-lenke. */
  gameId: string;
  /** Turneringsnavn — vises som kicker i header. */
  gameName: string;
  /** Liten label over scoren, f.eks. «Skins · Netto». */
  formatLabel: string;
  /** Enhetsord under tallene, f.eks. «skins». */
  unitLabel: string;
  sideA: HeadToHeadSide;
  sideB: HeadToHeadSide;
  /**
   * Vinnerens userId, eller `null` ved uavgjort. Sendes inn fra caller fordi
   * vinneren kan avgjøres på en tiebreak scoren alene ikke fanger (Skins:
   * lik `totalSkins`, men flere `holesWon`). Når utelatt: avled fra scoren.
   */
  winnerUserId?: string | null;
  /** Ett element per hull i rekkefølge (momentum-strip). */
  strip: StripCell[];
  /** Valgfri linje om uvunne/hengende poeng (Skins: carriedPot). */
  hangingNote?: string | null;
  /**
   * Når true vinner LAVEST score (f.eks. slagspill-netto). Tug-of-war-baren
   * inverteres så vinner-siden fortsatt får størst andel, og dommen viser
   * vinnerens (lave) score først. Default false (Skins/BBB/Nassau: høyest
   * vinner). `winnerUserId` styrer uansett crown/bar-side.
   */
  lowerWins?: boolean;
  /** Hvor pilen tilbake skal peke. Defaults til spillets hjem. */
  backHref?: string;
  /**
   * Når true droppes det egne ytre skallet (AppShell + tilbake-header) så
   * kortet kan ligge inni LeaderboardTabs sammen med sideturneringen (#576).
   * Fanen leverer da TopBar + tilbake-lenke; kortet beholder sin egen
   * DUELL-kicker + format-label. Default false → frittstående med eget skall.
   */
  chromeless?: boolean;
}

/**
 * Head-to-head resultat-kort for 1-mot-1 solo-spill (epic #496). Erstatter
 * podiet ved nøyaktig 2 spillere — et podium er bygget for en folkemengde, en
 * duell fortjener et scoreboard. Tre elementer: versus-header, tug-of-war-bar
 * (scoren tegnet som forhold), og en momentum-strip (ett felt per hull, farget
 * per spiller). Gjenbrukbart skall — Skins er første konsument; andre solo-
 * format mater inn sin egen metrikk senere.
 */
export function HeadToHeadResult({
  gameId,
  gameName,
  formatLabel,
  unitLabel,
  sideA,
  sideB,
  winnerUserId,
  strip,
  hangingNote,
  lowerWins = false,
  backHref = '/',
  chromeless = false,
}: HeadToHeadResultProps): JSX.Element {
  const t = useTranslations('leaderboard.h2h');
  const [replayKey, setReplayKey] = useState(0);

  useEffect(() => {
    const key = `${STORAGE_PREFIX}${gameId}`;
    try {
      if (window.sessionStorage.getItem(key) === '1') return;
      window.sessionStorage.setItem(key, '1');
    } catch {
      // Storage utilgjengelig — fyr konfettien uansett.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReplayKey(1);
  }, [gameId]);

  // Vinner: bruk eksplisitt winnerUserId når den er gitt (fanger tiebreaks),
  // ellers avled fra scoren.
  const winner: 'a' | 'b' | 'tie' =
    winnerUserId === undefined
      ? sideA.score > sideB.score
        ? 'a'
        : sideB.score > sideA.score
          ? 'b'
          : 'tie'
      : winnerUserId === sideA.userId
        ? 'a'
        : winnerUserId === sideB.userId
          ? 'b'
          : 'tie';

  // Tug-of-war: andelen tegnes fra en 0-basislinje (eller den mest negative
  // scoren). For ikke-negative scorer (Skins/BBB/Nassau/slagspill) er lo = 0,
  // så formelen reduseres til ren score/sum-andel — ingen visuell endring for
  // de formatene. Skiftet gjør baren robust mot negative totaler: modified
  // stableford bruker netto-poeng der par = 0, så totalen kan bli negativ.
  const lo = Math.min(sideA.score, sideB.score, 0);
  const aShift = sideA.score - lo;
  const bShift = sideB.score - lo;
  const totalShift = aShift + bShift;
  const rawPctA =
    totalShift === 0 ? 50 : Math.round((aShift / totalShift) * 100);
  // Ved lowerWins (slagspill-netto) inverteres andelene så vinner-siden
  // (lavest score) fortsatt får den største champagne-flaten.
  const pctA = lowerWins ? 100 - rawPctA : rawPctA;
  const pctB = 100 - pctA;

  const nameA = formatRevealName(sideA.name, sideA.nickname);
  const nameB = formatRevealName(sideB.name, sideB.nickname);

  // Dommen viser vinnerens score først, så den leser riktig uansett om høyest
  // eller lavest vinner: Skins «5–3», slagspill-netto «78–85». winnerUserId
  // styrer crown/bar; her trenger vi bare vinnerens og taperens score.
  const winnerName = winner === 'a' ? nameA : nameB;
  const winnerScore = winner === 'a' ? sideA.score : sideB.score;
  const loserScore = winner === 'a' ? sideB.score : sideA.score;
  // Negative scorer (modifisert stableford bruker netto-poeng der par = 0)
  // formatteres med ekte minus, og separatoren bytter fra en-dash til « mot »
  // så «4–−3» ikke kolliderer visuelt til «4--3». Positive format (Skins/
  // Nassau/BBB/slagspill) beholder den kompakte «5–3».
  const fmtScore = (n: number) => (n < 0 ? `−${Math.abs(n)}` : String(n));
  const sep = sideA.score < 0 || sideB.score < 0 ? ' mot ' : '–';
  const verdict =
    winner === 'tie'
      ? t('verdictTie', { scoreA: fmtScore(sideA.score), sep, scoreB: fmtScore(sideB.score) })
      : sideA.score === sideB.score
        ? // Lik score, men avgjort på tiebreak (f.eks. flest vunne hull).
          t('verdictWinTiebreak', { winner: winnerName })
        : t('verdictWin', { winner: winnerName, winnerScore: fmtScore(winnerScore), sep, loserScore: fmtScore(loserScore) });

  return (
    <Shell chromeless={chromeless}>
      {!chromeless && (
        <header className="mb-2 flex items-center justify-between gap-4">
          <SmartLink
            href={backHref}
            aria-label={t('backAriaLabel')}
            className="-ml-2 inline-flex h-11 w-11 items-center justify-center text-lg text-text"
          >
            ‹
          </SmartLink>
          <Kicker tone="accent">{gameName.toUpperCase()}</Kicker>
          <span className="w-11" aria-hidden />
        </header>
      )}

      <div className="px-6 pt-1.5 pb-2 text-center">
        <Kicker tone="accent">{t('kicker')}</Kicker>
        <p className="mt-2 text-[11.5px] tabular-nums text-muted">
          {formatLabel}
        </p>
      </div>

      <div
        data-testid="head-to-head"
        className="relative isolate mx-3.5 mt-1 rounded-2xl border border-border bg-surface px-4 pt-5 pb-4 shadow-[0_2px_14px_rgba(26,46,31,0.06)]"
      >
        {replayKey > 0 && <ConfettiBurst key={replayKey} />}

        {/* Versus-header */}
        <div className="grid grid-cols-2 gap-3">
          <SidePanel
            name={nameA}
            score={sideA.score}
            subLabel={sideA.subLabel}
            unitLabel={unitLabel}
            colorVar="--player-a"
            isWinner={winner === 'a'}
            align="left"
          />
          <SidePanel
            name={nameB}
            score={sideB.score}
            subLabel={sideB.subLabel}
            unitLabel={unitLabel}
            colorVar="--player-b"
            isWinner={winner === 'b'}
            align="right"
          />
        </div>

        {/* Tug-of-war: scoren tegnet som forhold mellom de to */}
        <div
          data-testid="h2h-bar"
          className="mt-4 flex h-3 w-full overflow-hidden rounded-full border border-border"
          role="img"
          aria-label={t('barAriaLabel', { nameA, scoreA: sideA.score, nameB, scoreB: sideB.score })}
        >
          <span
            className="h-full"
            style={{ width: `${pctA}%`, background: 'var(--player-a)' }}
          />
          <span
            className="h-full"
            style={{ width: `${pctB}%`, background: 'var(--player-b)' }}
          />
        </div>

        {/* Momentum-strip: ett felt per hull, farget per spiller */}
        <div
          data-testid="h2h-strip"
          className="mt-4 flex flex-wrap justify-center gap-1"
        >
          {strip.map((cell, i) => (
            <span
              key={i}
              className={`reveal-up h-2.5 w-2.5 rounded-[3px] ${cellClass(cell)}`}
              style={{ animationDelay: `${40 + i * 18}ms` }}
            />
          ))}
        </div>

        {/* Tegnforklaring */}
        <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10.5px] text-muted">
          <LegendDot colorVar="--player-a" label={nameA} />
          <LegendDot colorVar="--player-b" label={nameB} />
          <LegendDot muted label={t('halvedLegend')} />
        </div>

        {/* Dom */}
        <p
          data-testid="h2h-verdict"
          className="mt-4 text-center font-serif text-[15px] font-medium tracking-[-0.005em] text-text"
        >
          {verdict}
        </p>
        {hangingNote && (
          <p className="mt-1 text-center text-[12px] text-muted">
            {hangingNote}
          </p>
        )}
      </div>
    </Shell>
  );
}

/**
 * Ytre skall. Frittstående: AppShell + bunn-padding så kortet får luft under
 * seg på en egen side. Chromeless (inni LeaderboardTabs, #576): bare backdrop
 * + posisjons-wrapper — fanen eier AppShell og TopBar, så vi dropper begge her
 * for å unngå doble skall. Speiler `Shell`-mønsteret i BingoBangoBongoPodium.
 */
function Shell({
  children,
  chromeless = false,
}: {
  children: React.ReactNode;
  chromeless?: boolean;
}): JSX.Element {
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

function cellClass(cell: StripCell): string {
  switch (cell) {
    case 'a':
      return 'bg-player-a';
    case 'b':
      return 'bg-player-b';
    case 'halved':
      return 'bg-muted/40';
    default:
      return 'border border-border bg-transparent';
  }
}

function SidePanel({
  name,
  score,
  subLabel,
  unitLabel,
  colorVar,
  isWinner,
  align,
}: {
  name: string;
  score: number;
  subLabel?: string;
  unitLabel: string;
  colorVar: string;
  isWinner: boolean;
  align: 'left' | 'right';
}) {
  const alignClass = align === 'left' ? 'items-start text-left' : 'items-end text-right';
  return (
    <div className={`flex flex-col gap-1 ${alignClass}`}>
      <span className="flex items-center gap-1.5">
        {isWinner && (
          <span aria-hidden className="text-[13px] text-accent">
            ★
          </span>
        )}
        <span className="font-serif text-[15px] font-medium leading-tight tracking-[-0.005em] text-text break-words">
          {name}
        </span>
      </span>
      <span
        className="score-num text-[40px] leading-none tracking-[-0.02em] tabular-nums"
        style={{ color: `var(${colorVar})` }}
      >
        {score}
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
        {unitLabel}
      </span>
      {subLabel && (
        <span className="text-[11px] tabular-nums text-muted">{subLabel}</span>
      )}
    </div>
  );
}

function LegendDot({
  colorVar,
  muted,
  label,
}: {
  colorVar?: string;
  muted?: boolean;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={`h-2 w-2 rounded-[2px] ${muted ? 'bg-muted/40' : ''}`}
        style={colorVar ? { background: `var(${colorVar})` } : undefined}
      />
      <span className="truncate max-w-[8rem]">{label}</span>
    </span>
  );
}
