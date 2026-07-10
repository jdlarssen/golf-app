'use client';

import { useMemo, useState, type JSX } from 'react';
import { useTranslations } from 'next-intl';
import { ScoreCard } from '@/components/hole/ScoreCard';
import { SpecificValueSheet } from '@/components/hole/SpecificValueSheet';
import {
  SoloStablefordView,
  type SoloStablefordPlayerInfo,
} from '@/app/[locale]/games/[id]/leaderboard/SoloStablefordView';
import { computeLeaderboard, strokesForHole } from '@/lib/scoring';
import type { StablefordSoloResult } from '@/lib/scoring/modes/types';
import { Button, LinkButton } from '@/components/ui/Button';
import { BrandMark } from '@/components/ui/BrandMark';
import { Input } from '@/components/ui/Input';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import {
  DEMO_HOLES,
  DEMO_PLAYERS,
  DEMO_YOU_ID,
  buildDemoContext,
  type DemoYouScores,
} from '@/lib/demo/seed';
import { DEMO_NAME_STORAGE_KEY } from '@/lib/demo/handoff';

/**
 * Prøvespill-demoen (#1042). 100 % klient-side: motstanderne har ferdigfylte
 * scorer, «Deg» starter tomt, og tavla regnes live med den EKTE scoring-motoren
 * (`computeLeaderboard`) og rendres med den EKTE leaderboard-visningen
 * (`SoloStablefordView`). Ingen server, ingen Supabase, ingen Dexie-sync — all
 * state bor i React og forsvinner ved reload (bevisst; se kontrakt #1042).
 */
export function DemoGame(): JSX.Element {
  const t = useTranslations('demo');
  const [youScores, setYouScores] = useState<DemoYouScores>({});
  const [holeIndex, setHoleIndex] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [youName, setYouName] = useState('');

  const youPlayer = DEMO_PLAYERS.find((p) => p.isYou)!;
  // Eierskaps-effekt (#1173): besøkeren kan sette navnet sitt på spillerkortet og
  // tavla før kode-veggen. Tomt felt faller tilbake til seed-navnet («Deg»).
  const displayName = youName.trim() || youPlayer.name;
  const hole = DEMO_HOLES[holeIndex];
  const extraStrokes = strokesForHole(youPlayer.courseHandicap, hole.strokeIndex);
  const currentScore = youScores[hole.number] ?? null;

  // Tavla regnes på nytt hver gang «Deg»-scorene endres — dette er «se tavla
  // flytte seg»-effekten. Demo-config er alltid solo stableford, så vi narrower
  // trygt (kastet er umulig å nå i praksis).
  const result = useMemo<StablefordSoloResult>(() => {
    const r = computeLeaderboard(buildDemoContext(youScores));
    if (r.kind !== 'stableford' || r.variant !== 'solo') {
      throw new Error('demo: forventet solo stableford-resultat');
    }
    return r;
  }, [youScores]);

  const playersById = useMemo(() => {
    const map = new Map<string, SoloStablefordPlayerInfo>();
    for (const p of DEMO_PLAYERS) {
      map.set(p.userId, {
        name: p.isYou ? displayName : p.name,
        nickname: p.nickname,
        teeGender: p.teeGender,
      });
    }
    return map;
  }, [displayName]);

  const leaderHolesPlayed = result.players[0]?.holesPlayed ?? 0;
  const isLastHole = holeIndex === DEMO_HOLES.length - 1;
  const allEntered = DEMO_HOLES.every((h) => youScores[h.number] != null);

  function setScore(_playerId: string, next: number) {
    setYouScores((prev) => ({ ...prev, [hole.number]: next }));
  }
  function clearScore() {
    setYouScores((prev) => {
      const next = { ...prev };
      delete next[hole.number];
      return next;
    });
  }
  function reset() {
    setYouScores({});
    setHoleIndex(0);
    setSheetOpen(false);
  }
  function handleNameChange(value: string) {
    setYouName(value);
    const trimmed = value.trim();
    try {
      // Bær navnet til registreringen (#1173). Skriv aldri default-navnet, ellers
      // prefylles profilen med «Deg»; tomt/whitespace fjerner nøkkelen igjen.
      if (trimmed && trimmed !== youPlayer.name) {
        window.localStorage.setItem(DEMO_NAME_STORAGE_KEY, trimmed);
      } else {
        window.localStorage.removeItem(DEMO_NAME_STORAGE_KEY);
      }
    } catch {
      // localStorage utilgjengelig (privat modus) — demoen fungerer likevel.
    }
  }

  return (
    <div className="relative">
      <header className="flex items-center justify-between">
        <BrandMark />
        <LocaleSwitcher />
      </header>

      <div
        data-testid="demo-banner"
        className="mt-4 rounded-xl border border-primary/20 bg-primary-soft px-4 py-3"
      >
        <p className="text-[13px] text-text">{t('banner')}</p>
      </div>

      <p className="mt-4 text-sm text-muted">{t('intro')}</p>

      <div className="mt-4">
        <Input
          id="demo-name"
          type="text"
          label={t('nameLabel')}
          placeholder={youPlayer.name}
          maxLength={40}
          autoComplete="name"
          value={youName}
          onChange={(e) => handleNameChange(e.target.value)}
          data-testid="demo-name-input"
        />
      </div>

      <section className="mt-5">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            {t('holeKicker', { number: hole.number, total: DEMO_HOLES.length })}
          </span>
          <span className="text-[13px] tabular-nums text-muted">
            {t('parLabel', { par: hole.par })}
          </span>
        </div>

        <ScoreCard
          playerId={DEMO_YOU_ID}
          name={displayName}
          initial={displayName.charAt(0)}
          extraStrokes={extraStrokes}
          score={currentScore}
          par={hole.par}
          onSetScore={setScore}
          onLongPress={() => setSheetOpen(true)}
          onClear={clearScore}
        />

        <div className="mt-3 flex items-center justify-between gap-3">
          <Button
            variant="secondary"
            onClick={() => setHoleIndex((i) => Math.max(0, i - 1))}
            disabled={holeIndex === 0}
          >
            {t('prevHole')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => setHoleIndex((i) => Math.min(DEMO_HOLES.length - 1, i + 1))}
            disabled={isLastHole}
          >
            {t('nextHole')}
          </Button>
        </div>
        {allEntered && (
          <p className="mt-2 text-center text-[12px] text-muted">{t('finishedHint')}</p>
        )}
      </section>

      <section className="mt-7">
        <SoloStablefordView
          gameId="demo"
          gameName={t('gameName')}
          result={result}
          playersById={playersById}
          holesPlayed={leaderHolesPlayed}
          highlightUserId={DEMO_YOU_ID}
          chromeless
          live={false}
        />
      </section>

      <section
        data-testid="demo-cta"
        className="mt-8 rounded-2xl border border-border bg-surface px-5 py-6 text-center"
      >
        <h2 className="font-serif text-[22px] font-medium text-text">{t('ctaHeading')}</h2>
        <p className="mt-1.5 text-sm text-muted">{t('ctaBody')}</p>
        <LinkButton href="/login?next=%2F" full className="mt-4">
          {t('ctaButton')}
        </LinkButton>
        <button
          type="button"
          onClick={reset}
          className="mt-3 text-[13px] font-medium text-muted underline underline-offset-2"
        >
          {t('reset')}
        </button>
      </section>

      <SpecificValueSheet
        open={sheetOpen}
        par={hole.par}
        onPick={(value) => setScore(DEMO_YOU_ID, value)}
        onClear={clearScore}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}
