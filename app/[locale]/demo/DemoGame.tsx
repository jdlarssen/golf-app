'use client';

import { useMemo, useState, type CSSProperties, type JSX } from 'react';
import { useTranslations } from 'next-intl';
import { SpecificValueSheet } from '@/components/hole/SpecificValueSheet';
import {
  SoloStablefordView,
  type SoloStablefordPlayerInfo,
} from '@/app/[locale]/games/[id]/leaderboard/SoloStablefordView';
import { computeLeaderboard, strokesForHole } from '@/lib/scoring';
import type { StablefordSoloResult } from '@/lib/scoring/modes/types';
import { buttonClasses } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Link } from '@/i18n/navigation';
import { stablefordPointsForCard } from '@/lib/scorecard/railPoints';
import { strikeStrokes } from '@/lib/scorecard/scoreRail';
import { nextStrokes } from '@/lib/scorecard/strokeEntry';
import {
  DEMO_HOLES,
  DEMO_PLAYERS,
  DEMO_YOU_ID,
  buildDemoContext,
  demoGrossFor,
  type DemoYouScores,
} from '@/lib/demo/seed';
import { demoStanding } from '@/lib/demo/standing';
import { DEMO_NAME_STORAGE_KEY } from '@/lib/demo/handoff';
import { DemoStandingStrip } from './DemoStandingStrip';
import { DemoFlightList, type DemoFlightRowData } from './DemoFlightList';
import { DemoRail, DEMO_EXIT_HREF } from './DemoRail';

/** Stableford points for a score on the hole, the same rule as the rail's buttons. */
function pointsFor(score: number | null, extraStrokes: number, par: number): number | null {
  return stablefordPointsForCard({
    card: { score, extraStrokes },
    par,
    gameMode: 'stableford',
    isStableford: true,
  });
}

const YOU = DEMO_PLAYERS.find((p) => p.isYou)!;

const topRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 16px 0 20px',
  lineHeight: 'normal',
};

const pillStyle: CSSProperties = {
  height: 26,
  padding: '0 10px',
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  display: 'flex',
  alignItems: 'center',
};

const holeLineStyle: CSSProperties = {
  margin: 0,
  padding: '16px 20px 0 20px',
  display: 'flex',
  alignItems: 'baseline',
  gap: 10,
  fontWeight: 400,
  lineHeight: 'normal',
};

const hintStyle: CSSProperties = {
  margin: '14px 24px 0 24px',
  position: 'relative',
  borderRadius: 12,
  padding: '10px 12px',
  fontSize: 13,
  lineHeight: 1.4,
};

const hintTipStyle: CSSProperties = {
  position: 'absolute',
  left: '50%',
  bottom: -6,
  width: 12,
  height: 12,
  transform: 'translateX(-50%) rotate(45deg)',
};

/**
 * Prøvespill-demoen (#1042), redrawn as the new hole page with the board on top
 * (#2281). 100 % client-side: the opponents' scores are fixed, «Deg» starts
 * empty, and the board is the REAL scoring engine (`computeLeaderboard`) shown
 * in the REAL leaderboard view (`SoloStablefordView`). The strip reads the live
 * board's own rules (`demoStanding`). No server, no Supabase, no Dexie sync —
 * all state lives in React and is gone on reload (deliberate; contract #1042).
 */
export function DemoGame(): JSX.Element {
  const t = useTranslations('demo');
  const th = useTranslations('holes');
  const [youScores, setYouScores] = useState<DemoYouScores>({});
  const [holeIndex, setHoleIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [finished, setFinished] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [youName, setYouName] = useState('');

  // The play screen always says «Deg», as the artboard does; the board takes
  // the name from the field on the final card (#1173, #2281 O8).
  const boardName = youName.trim() || YOU.name;
  const hole = DEMO_HOLES[holeIndex];
  const isLastHole = holeIndex === DEMO_HOLES.length - 1;
  const extraStrokes = strokesForHole(YOU.courseHandicap, hole.strokeIndex);
  const currentScore = youScores[hole.number] ?? null;
  const entering = currentScore == null || editing;

  // The board is worked out again every time your scores change — that is the
  // «watch the board move» effect. The demo is always solo stableford, so the
  // narrowing is safe (the throw cannot be reached in practice).
  const result = useMemo<StablefordSoloResult>(() => {
    const r = computeLeaderboard(buildDemoContext(youScores));
    if (r.kind !== 'stableford' || r.variant !== 'solo') {
      throw new Error('demo: forventet solo stableford-resultat');
    }
    return r;
  }, [youScores]);
  const standing = useMemo(() => demoStanding(youScores), [youScores]);

  const playersById = useMemo(() => {
    const map = new Map<string, SoloStablefordPlayerInfo>();
    for (const p of DEMO_PLAYERS) {
      map.set(p.userId, {
        name: p.isYou ? boardName : p.name,
        nickname: p.nickname,
        teeGender: p.teeGender,
      });
    }
    return map;
  }, [boardName]);

  const board = (
    <SoloStablefordView
      gameId="demo"
      gameName={t('gameName')}
      result={result}
      playersById={playersById}
      holesPlayed={result.players[0]?.holesPlayed ?? 0}
      highlightUserId={DEMO_YOU_ID}
      chromeless
      live={false}
    />
  );

  const you: DemoFlightRowData = {
    playerId: DEMO_YOU_ID,
    name: YOU.name,
    extraStrokes,
    score: currentScore,
    points: pointsFor(currentScore, extraStrokes, hole.par),
  };
  const opponents: DemoFlightRowData[] = DEMO_PLAYERS.filter((p) => !p.isYou).map((p) => {
    const strokes = strokesForHole(p.courseHandicap, hole.strokeIndex);
    const score = demoGrossFor(p.userId, hole.number);
    return {
      playerId: p.userId,
      name: p.name,
      extraStrokes: strokes,
      score,
      points: pointsFor(score, strokes, hole.par),
    };
  });

  const strike = strikeStrokes(hole.par, extraStrokes);

  function pick(strokes: number) {
    setYouScores((prev) => ({ ...prev, [hole.number]: strokes }));
    setEditing(false);
  }
  function step(delta: 1 | -1) {
    setYouScores((prev) => ({
      ...prev,
      [hole.number]: nextStrokes({ current: prev[hole.number] ?? null, par: hole.par, delta }),
    }));
  }
  function undo() {
    setYouScores((prev) => {
      const next = { ...prev };
      delete next[hole.number];
      return next;
    });
    setEditing(false);
  }
  function goNext() {
    setEditing(false);
    if (isLastHole) {
      setFinished(true);
      setBoardOpen(false);
      return;
    }
    setHoleIndex((i) => i + 1);
  }
  function reset() {
    setYouScores({});
    setHoleIndex(0);
    setEditing(false);
    setBoardOpen(false);
    setFinished(false);
    setSheetOpen(false);
  }
  function handleNameChange(value: string) {
    setYouName(value);
    const trimmed = value.trim();
    try {
      // Bær navnet til registreringen (#1173). Skriv aldri default-navnet, ellers
      // prefylles profilen med «Deg»; tomt/whitespace fjerner nøkkelen igjen.
      if (trimmed && trimmed !== YOU.name) {
        window.localStorage.setItem(DEMO_NAME_STORAGE_KEY, trimmed);
      } else {
        window.localStorage.removeItem(DEMO_NAME_STORAGE_KEY);
      }
    } catch {
      // localStorage utilgjengelig (privat modus) — demoen fungerer likevel.
    }
  }

  return (
    <div data-testid="demo-game">
      <header style={topRowStyle}>
        <span
          style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 600 }}
          className="text-primary"
        >
          Tørny
        </span>
        <span data-testid="demo-pill" className="bg-hole-completed-bg text-muted" style={pillStyle}>
          {t('pill')}
        </span>
      </header>

      {finished ? (
        <>
          <section style={{ margin: '16px 16px 0 16px' }}>{board}</section>

          {/* No artboard for this view (#2281, E1): the name field moved here
              from the play screen, so the name still reaches the profile. */}
          <section
            data-testid="demo-cta"
            className="rounded-2xl border border-border bg-surface px-5 py-6 text-center"
            style={{ margin: '24px 16px 0 16px' }}
          >
            <h2 className="font-serif text-[22px] font-medium text-text">{t('ctaHeading')}</h2>
            <p className="mt-1.5 text-sm text-muted">{t('ctaBody')}</p>
            <div className="mt-4 text-left">
              <Input
                id="demo-name"
                type="text"
                label={t('nameLabel')}
                placeholder={YOU.name}
                maxLength={40}
                autoComplete="name"
                value={youName}
                onChange={(e) => handleNameChange(e.target.value)}
                data-testid="demo-name-input"
              />
            </div>
            <Link
              href={DEMO_EXIT_HREF}
              data-testid="demo-continue"
              className={`${buttonClasses('primary', 'default')} mt-4 w-full`}
            >
              {t('ctaButton')}
            </Link>
            {/* Hits 44px (#2240): up only to the 12px gap below the CTA button. */}
            <button
              type="button"
              data-testid="demo-reset"
              onClick={reset}
              className="tap-extend mt-3 text-[13px] font-medium text-muted underline underline-offset-2 [--tap-extend:-12px_-8px_-13px]"
            >
              {t('reset')}
            </button>
          </section>
        </>
      ) : (
        <>
          <DemoStandingStrip
            standing={standing}
            open={boardOpen}
            onToggle={() => setBoardOpen((open) => !open)}
            board={board}
          />

          <h1 style={holeLineStyle}>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 44, fontWeight: 600, lineHeight: 1 }}>
              {hole.number}
            </span>
            <span className="text-muted" style={{ fontSize: 13 }}>
              {t('holeLine', { total: DEMO_HOLES.length, par: hole.par, index: hole.strokeIndex })}
            </span>
          </h1>

          <DemoFlightList
            par={hole.par}
            you={you}
            opponents={opponents}
            youActive={entering}
            onSelectYou={() => {
              if (currentScore != null) setEditing(true);
            }}
          />

          {currentScore == null && (
            <div data-testid="demo-hint" className="bg-text text-bg" style={hintStyle}>
              <span style={{ fontWeight: 600 }}>{t('hint.lead')}</span> {t('hint.body')}
              <span aria-hidden="true" className="bg-text" style={hintTipStyle} />
            </div>
          )}

          <DemoRail
            name={YOU.name}
            extraStrokes={extraStrokes}
            par={hole.par}
            score={currentScore}
            entering={entering}
            isLastHole={isLastHole}
            onPick={pick}
            onOther={() => setSheetOpen(true)}
            onStep={step}
            onUndo={undo}
            onNext={goNext}
          />

          <SpecificValueSheet
            open={sheetOpen}
            par={hole.par}
            onPick={pick}
            onClear={undo}
            onClose={() => setSheetOpen(false)}
            strike={{
              value: strike,
              label: th('scoreRail.strikeWithPoints', {
                points: pointsFor(strike, extraStrokes, hole.par) ?? 0,
              }),
            }}
          />
        </>
      )}
    </div>
  );
}
