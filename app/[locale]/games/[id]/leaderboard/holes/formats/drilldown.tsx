import { useLocale, useTranslations } from 'next-intl';
import { formatWholeHcpDisplay } from '@/lib/handicap/signFormat';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { SmartLink } from '@/components/ui/SmartLink';
import {
  LeaderboardBackLink,
  LeaderboardBackLinkSpacer,
} from '@/components/ui/LeaderboardBackLink';
import { ScoreShape } from '@/components/scoring/ScoreShape';
import { scoreShape } from '@/lib/scoring/scoreShape';
import { scoreTone } from '@/lib/scoring/scoreTone';
import { computeLeaderboard, type LeaderboardMode } from '@/lib/leaderboard';
import {
  drilldownHref,
  leaderboardHref,
  type LeaderboardNavContext,
} from '@/lib/leaderboard/navContext';
import { formatOtherGendersPar } from '@/lib/games/parDisplay';
import {
  isHoleInSegment,
  firstHalfHoleNumbersForSegment,
  holeNumbersForSegment,
  lastHoleForSegment,
} from '@/lib/games/holeScope';
import type { HoleSegment } from '@/lib/scoring';
import { bestBallBoardInput } from '@/lib/leaderboard/bestBallInput';
import {
  bestBallDrilldown,
  bestBallRevealMeta,
  formatVsPar,
  type BestBallDrilldown,
  type BestBallHoleRow,
  type BestBallNine,
  type BestBallTeamRef,
  type VsParTone,
} from '@/lib/leaderboard/bestBallHoles';
import { getDrilldownContext, fetchHolesAndScores } from '../holesData';

/**
 * Den generiske «Hull for hull»-drilldownen: lagets best ball per hull. Bare
 * best ball når den — `holes/page.tsx` sender formatene uten egen hullvisning
 * til tavla (#2217, `hasHoleByHoleView`).
 */
export async function DrilldownBody({
  gameId,
  courseId,
  mode,
  isActive,
  requestedTeam,
  holeSegment,
  navContext,
}: {
  gameId: string;
  courseId: string;
  mode: LeaderboardMode;
  isActive: boolean;
  requestedTeam: number | null;
  holeSegment: HoleSegment;
  /** Back-context forwarded from the leaderboard (#1517). */
  navContext?: LeaderboardNavContext;
}) {
  const { supabase } = await getDrilldownContext();
  const tCommon = await getTranslations('leaderboard.common');

  // Players come from the tag-cached helper (cache hit — outer page already
  // warmed it). Holes + scores stay direct fetches.
  const { gwp, rawHoles, rawScores } = await fetchHolesAndScores(
    supabase,
    gameId,
    courseId,
  );

  // #1448: front9-/back9-spill drilldowner kun over segmentets hull — 'full'
  // er et rent pass-through, bit-identisk med før. Filtrert på råradene, før
  // den delte best ball-inputen (#2217).
  const scopedHoleRows = rawHoles.filter((h) =>
    isHoleInSegment(h.hole_number, holeSegment),
  );
  const scopedScoreRows = rawScores.filter((s) =>
    isHoleInSegment(s.hole_number, holeSegment),
  );

  // WD (#386, #2217): samme input som tavla — en trukket spiller og slagene
  // hans holdes utenfor lagets best ball her også.
  const {
    players,
    holes: scopedHoles,
    scores: scopedScores,
  } = bestBallBoardInput({
    gameMode: gwp.game.game_mode,
    modeConfig: gwp.game.mode_config,
    roster: gwp.players,
    holeRows: scopedHoleRows,
    scoreRows: scopedScoreRows,
    unknownPlayer: tCommon('unknownPlayer'),
  });

  // The «HCP» label keeps showing the frozen course handicap, like the game
  // page does — only the netto maths above follows the engine.
  const frozenHandicapByUser = new Map(
    gwp.players.map((p) => [p.user_id, p.course_handicap ?? 0]),
  );

  // Active rounds: clip to the segment's first half so second-half suspense
  // stays intact. Matches state #3.5 on the leaderboard view ('full' → 1-9,
  // byte-identical to the old hardcoded clip).
  const firstHalf = new Set(firstHalfHoleNumbersForSegment(holeSegment));
  const holes = isActive
    ? scopedHoles.filter((h) => firstHalf.has(h.holeNumber))
    : scopedHoles;
  const scores = isActive
    ? scopedScores.filter((s) => firstHalf.has(s.holeNumber))
    : scopedScores;

  const lines = computeLeaderboard({ mode, players, holes, scores });
  // Same par as the board (#2217): `par_mens` over exactly the holes sent to
  // computeLeaderboard — clipped to the first half in an active round.
  const coursePar = holes.reduce((sum, h) => sum + h.par, 0);

  // Which team to render (default: the leader; an invalid `?team=` falls back
  // to the leader), its nines, holes won and neighbours — one model shared
  // with the app's «Hull for hull» (#2255 PR 3d).
  const view = bestBallDrilldown({ lines, requestedTeam, coursePar });

  if (view === null) {
    // Nothing to drill into — bounce back to the parent leaderboard, which
    // will render its own empty state.
    redirect({
      href: leaderboardHref({ gameId, mode, context: navContext }) as string,
      locale: await getLocale(),
    });
    return null;
  }

  return (
    <DrilldownView
      gameId={gameId}
      mode={mode}
      isActive={isActive}
      view={view}
      holeSegment={holeSegment}
      navContext={navContext}
      frozenHandicapByUser={frozenHandicapByUser}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// View — drilldown for a single team (UT + INN + total bar)
// ─────────────────────────────────────────────────────────────────────────────

function DrilldownView({
  gameId,
  mode,
  isActive,
  view,
  holeSegment,
  navContext,
  frozenHandicapByUser,
}: {
  gameId: string;
  mode: LeaderboardMode;
  isActive: boolean;
  view: BestBallDrilldown;
  holeSegment: HoleSegment;
  navContext?: LeaderboardNavContext;
  frozenHandicapByUser: ReadonlyMap<string, number>;
}) {
  const t = useTranslations('leaderboard.holes');
  const tc = useTranslations('leaderboard.common');
  const locale = useLocale();
  const front = view.nines.find((n) => n.key === 'front');
  const back = view.nines.find((n) => n.key === 'back');
  // Hva som faktisk er skjult (#1602): datalaget klipper aktive runder til
  // segmentets FØRSTE halvdel, så resten av segmentet er det som venter —
  // 10–18 i et fullt spill, 6–9 i et front9-spill, 15–18 i et back9-spill.
  // Teksten må følge segmentet; ellers lover kortet hull som hører til
  // søsterspillet på en splittet cup-dag og aldri dukker opp her.
  const firstHalf = new Set(firstHalfHoleNumbersForSegment(holeSegment));
  const hiddenHoles = holeNumbersForSegment(holeSegment).filter(
    (n) => !firstHalf.has(n),
  );
  const hiddenFrom = hiddenHoles[0]!;
  const hiddenTo = hiddenHoles[hiddenHoles.length - 1]!;

  // #2217: `view.totalVsPar` is over the holes the team played, on the
  // board's par — the hero and the total bar say the same as the board.
  // Finished games surface the dramatic reveal-name; mid-round we keep the
  // compact first-name + HCP label so the drilldown stays readable on
  // narrow tiles.
  const isFinished = !isActive;
  const playerMeta = isFinished
    ? bestBallRevealMeta(view.players)
    : view.players
        .map(
          (p) =>
            `${firstNameOf(p.name)} (HCP ${formatWholeHcpDisplay(frozenHandicapByUser.get(p.userId) ?? p.courseHandicap, locale)})`,
        )
        .join(' · ');

  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="mx-auto max-w-md pb-12">
        <header className="flex items-center justify-between gap-2 px-4 pb-2 pt-3.5">
          <LeaderboardBackLink
            href={leaderboardHref({ gameId, mode, context: navContext })}
            label={t('backAriaLabel')}
          />
          <span className="flex-1 truncate text-center text-[11px] font-semibold uppercase tracking-[0.20em] text-muted">
            {t('teamHeader', { number: view.teamNumber, rank: view.rank })}
          </span>
          <LeaderboardBackLinkSpacer />
        </header>

        {/* Team hero */}
        <div className="flex items-center gap-3.5 px-4 pt-1.5 pb-3.5">
          <div
            data-testid="drilldown-team-rank"
            className={`min-w-[50px] text-center font-serif text-[48px] font-semibold leading-none tracking-[-0.04em] tabular-nums ${
              view.isLeader ? 'text-accent-text' : 'text-muted'
            }`}
          >
            {view.rank}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="m-0 font-serif text-[22px] font-medium tracking-[-0.015em] text-text">
              {tc('teamLabel', { number: view.teamNumber })}
            </h1>
            <p className="mt-0.5 truncate text-[11.5px] text-muted">
              {playerMeta || t('noPlayers')}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <span
              className="block font-serif text-[24px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-text"
              data-testid="drilldown-team-total"
            >
              {view.total}
            </span>
            <span
              className="mt-1 block text-[11px] font-semibold uppercase tracking-[0.12em] tabular-nums text-muted"
              data-testid="drilldown-team-vs-par"
            >
              {formatVsPar(view.totalVsPar)} PAR
            </span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 px-5 pb-2 text-[10.5px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <strong className="font-serif font-bold text-text">B</strong>
            <span>{t('legendNetLabel')}</span>
          </span>
          <span className="ml-auto font-serif text-[11px] italic">
            {t('legendFormat')}
          </span>
        </div>

        {/* Front nine — #1448: back9-spill har ingen hull ≤ 9 i scope, da
            skjules hele UT-seksjonen i stedet for å rendre en tom tabell. */}
        {front && (
          <>
            <div className="px-5 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.20em] text-muted">
              {t('frontNineLabel')}
            </div>
            <HoleTable nine={front} summaryLabel={t('summaryUt')} />
          </>
        )}

        {/* Back nine — datalaget klipper bort andre halvdel i aktive runder,
            så radene finnes bare når de skal vises (#1448: front9-spill har
            ingen, back9-spill får sine her). */}
        {back && (
          <>
            <div className="px-5 pt-5 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.20em] text-muted">
              {t('backNineLabel')}
            </div>
            <HoleTable nine={back} summaryLabel={t('summaryInn')} />
          </>
        )}

        {isActive ? (
          <div className="mx-4 mt-5 rounded-2xl border border-dashed border-border bg-surface px-5 py-6 text-center">
            <p className="font-serif text-[16px] font-medium text-text">
              {t('hiddenBackNineHeading', { last: lastHoleForSegment(holeSegment) })}
            </p>
            <p className="mt-2 text-xs text-muted">
              {t('hiddenBackNineSub', { from: hiddenFrom, to: hiddenTo })}
            </p>
          </div>
        ) : (
          /* Total bar — read-only summary, ikke en CTA. Toner ned fra
             tidligere bg-primary-fyll (skrek til leseren) til en stille
             surface med subtil topp-border. Tall + accent-kicker bærer
             hierarkiet uten å trenge høy-kontrast fyll. */
          <div className="mx-4 mt-5 mb-5 flex items-center justify-between rounded-[14px] border border-border bg-surface px-5 py-3.5 text-text">
            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.20em] text-accent-text">
                {t('totalLabel')}
              </span>
              <span className="mt-0.5 block text-[11.5px] tabular-nums text-muted">
                {t('holesWon', { count: view.holesWon })}
              </span>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="font-serif text-[32px] font-semibold leading-none tracking-[-0.02em] tabular-nums">
                {view.total}
              </span>
              <span
                className="font-sans text-[14px] font-semibold tabular-nums text-muted"
                data-testid="drilldown-total-vs-par"
              >
                {formatVsPar(view.totalVsPar)}
              </span>
            </div>
          </div>
        )}

        {/* Team prev/next inside the drilldown so the user can scrub through
            the field without going back to the leaderboard first. Hidden if
            there's only one team. */}
        {view.teamCount > 1 && (
          <div className="mt-2 flex items-center justify-between px-4">
            <TeamNavLink
              gameId={gameId}
              mode={mode}
              navContext={navContext}
              target={view.prev}
              direction="prev"
            />
            <TeamNavLink
              gameId={gameId}
              mode={mode}
              navContext={navContext}
              target={view.next}
              direction="next"
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hole table — one card per hole. Hull-info on the left, per-player rows
// (initial · brutto-shape · netto · netto-vs-par) stacked on the right.
// ─────────────────────────────────────────────────────────────────────────────

function HoleTable({
  nine,
  summaryLabel,
}: {
  nine: BestBallNine;
  summaryLabel: string;
}) {
  // #2217: the nine's own rows — a missing hole's par is left out of
  // `nine.vsPar`, like the total. «P36» still shows the par for all nine holes.
  const summaryTone = TONE_VARS[nine.tone];
  return (
    <div className="mx-4 mt-1.5 overflow-hidden rounded-[14px] border border-border bg-surface shadow-[0_1px_2px_rgba(26,46,31,0.03)]">
      {nine.rows.map((row, ii) => (
        <HoleRow key={row.holeNumber} row={row} staggerIndex={ii} />
      ))}
      {/* Summary row — same flex shape as HoleRow but with totals on the right. */}
      <div
        className="flex items-center gap-2 bg-surface-2 px-3 py-2.5"
        style={{ borderTop: '1.5px solid var(--border)' }}
      >
        <div className="flex w-[40px] shrink-0 flex-col items-center justify-center">
          <span className="font-serif text-[13px] font-semibold tracking-[0.04em] text-muted">
            {summaryLabel}
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] tabular-nums text-muted">
            P{nine.par}
          </span>
        </div>
        <div className="flex-1" />
        <span className="text-right font-serif text-[18px] font-semibold leading-none tracking-[-0.015em] tabular-nums text-text">
          {nine.net}
        </span>
        <span
          className="ml-2 w-[40px] shrink-0 rounded-full px-2 py-0.5 text-center text-[11px] font-semibold tabular-nums"
          style={{
            background: `var(${summaryTone.bg})`,
            color: `var(${summaryTone.fg})`,
          }}
        >
          {formatVsPar(nine.vsPar)}
        </span>
      </div>
    </div>
  );
}

function HoleRow({
  row,
  staggerIndex,
}: {
  row: BestBallHoleRow;
  staggerIndex: number;
}) {
  const t = useTranslations('leaderboard.holes');

  return (
    <div
      className="reveal-up flex items-stretch gap-2 border-t border-border bg-surface px-3 py-2 first:border-t-0"
      style={{ animationDelay: `${40 + staggerIndex * 22}ms` }}
    >
      {/* Hull # + Par on the left, spanning both player rows. */}
      <div className="flex w-[40px] shrink-0 flex-col items-center justify-center">
        <span className="font-serif text-[15px] font-medium leading-none tabular-nums text-text">
          {row.holeNumber}
        </span>
        <span className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] tabular-nums text-muted">
          P{row.par}
          {row.parAside && row.parByGender && (
            <sup
              data-testid="par-aside-marker"
              title={t('parAsideTitle', {
                genders: formatOtherGendersPar(row.parByGender, undefined, {
                  mens: t('parGenderMens', { par: row.parByGender.mens }),
                  ladies: t('parGenderLadies', { par: row.parByGender.ladies }),
                  juniors: t('parGenderJuniors', { par: row.parByGender.juniors }),
                }),
              })}
              aria-label={t('parAsideAriaLabel', {
                genders: formatOtherGendersPar(row.parByGender, undefined, {
                  mens: t('parGenderMens', { par: row.parByGender.mens }),
                  ladies: t('parGenderLadies', { par: row.parByGender.ladies }),
                  juniors: t('parGenderJuniors', { par: row.parByGender.juniors }),
                }),
              })}
              className="ml-0.5 cursor-help text-[0.65em] font-semibold text-muted"
            >
              *
            </sup>
          )}
        </span>
      </div>

      {/* Per-player rows stacked vertically — initial · brutto · netto · vs-par. */}
      <div className="flex flex-1 flex-col justify-center gap-1.5">
        {row.players.map((pc) => {
          const { isBestNet, grossText, initial } = pc;
          const nettoText = pc.netText;
          // Per-spiller-par (`pc.par`), ikke lagets representant-par
          // (`row.par`). På blandet-kjønn-lag på avvikshull får medspiller
          // av annet kjønn enn «kapteinen» riktig netto-vs-par og celle-tone. #252.
          const nettoVsPar = pc.netVsPar;

          return (
            <div
              key={pc.userId}
              // role="img": the label replaces the row's visual numbers for
              // screen readers (aria-label alone is ignored on a plain div).
              role="img"
              className="flex items-center gap-2 font-serif tabular-nums"
              aria-label={
                isBestNet
                  ? t('playerScoreAriaUsed', { initial, gross: grossText, extra: pc.extraStrokes, net: nettoText })
                  : t('playerScoreAria', { initial, gross: grossText, extra: pc.extraStrokes, net: nettoText })
              }
            >
              <span
                className={`w-6 text-center text-[12px] ${
                  isBestNet ? 'font-bold text-text' : 'font-normal text-muted'
                }`}
              >
                {initial}
              </span>
              <ScoreShape
                shape={scoreShape(pc.gross, pc.par)}
                tone={scoreTone(pc.gross, pc.par)}
                size="sm"
              >
                {grossText}
              </ScoreShape>
              <span
                className={`min-w-[18px] text-right text-[14px] ${
                  isBestNet ? 'font-semibold text-text' : 'font-normal text-muted'
                }`}
                data-testid={`drilldown-netto-${row.holeNumber}-${pc.userId}`}
              >
                {nettoText}
              </span>
              <span
                className="w-[32px] rounded-full py-0.5 text-center text-[11px] font-semibold tabular-nums"
                style={
                  pc.netTone !== null
                    ? {
                        background: `var(${TONE_VARS[pc.netTone].bg})`,
                        color: `var(${TONE_VARS[pc.netTone].fg})`,
                      }
                    : { color: 'var(--text-muted)' }
                }
              >
                {nettoVsPar === null ? '—' : formatVsPar(nettoVsPar)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Lagets score på hullet — spans both player rows on the far right. */}
      <div className="flex shrink-0 items-center justify-end gap-2">
        <span className="font-serif text-[18px] font-semibold leading-none tracking-[-0.015em] tabular-nums text-text">
          {row.teamNet ?? '–'}
        </span>
        <span
          className="w-[40px] rounded-full py-0.5 text-center text-[11px] font-semibold tabular-nums"
          style={
            row.teamTone !== null
              ? {
                  background: `var(${TONE_VARS[row.teamTone].bg})`,
                  color: `var(${TONE_VARS[row.teamTone].fg})`,
                }
              : { color: 'var(--text-muted)' }
          }
        >
          {row.teamVsPar === null ? '—' : formatVsPar(row.teamVsPar)}
        </span>
      </div>
    </div>
  );
}

function TeamNavLink({
  gameId,
  mode,
  navContext,
  target,
  direction,
}: {
  gameId: string;
  mode: LeaderboardMode;
  navContext?: LeaderboardNavContext;
  target: BestBallTeamRef | null;
  direction: 'prev' | 'next';
}) {
  const t = useTranslations('leaderboard.holes');
  if (!target) {
    return <span className="w-1/2" aria-hidden />;
  }
  const isPrev = direction === 'prev';
  return (
    <SmartLink
      href={drilldownHref({
        gameId,
        team: target.teamNumber,
        mode,
        context: navContext,
      })}
      className={`tap-extend inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-text [--tap-extend:-13px_0] ${
        isPrev ? '' : 'ml-auto'
      }`}
    >
      {isPrev && <span aria-hidden>‹</span>}
      <span>
        {isPrev
          ? t('prevTeam', { rank: target.rank, number: target.teamNumber })
          : t('nextTeam', { rank: target.rank, number: target.teamNumber })}
      </span>
      {!isPrev && <span aria-hidden>›</span>}
    </SmartLink>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** The model's tone step as the `--score-*` custom properties. */
const TONE_VARS: Record<VsParTone, { fg: string; bg: string }> = {
  under: { fg: '--score-under-fg', bg: '--score-under-bg' },
  par: { fg: '--score-par-fg', bg: '--score-par-bg' },
  over1: { fg: '--score-over1-fg', bg: '--score-over1-bg' },
  over2: { fg: '--score-over2-fg', bg: '--score-over2-bg' },
};

function firstNameOf(fullName: string): string {
  const t = fullName.trim();
  if (t === '') return '';
  return t.split(/\s+/)[0]!;
}
