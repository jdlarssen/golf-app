'use client';

// Scoreskinna på hullsiden (#2251): hvem skinna taster nå, og hva et trykk
// gjør. Egen hook så `HoleClient` ikke vokser (#1716-mønsteret).
//
// Aktiv spiller lagres ikke direkte. Hooken husker bare hvor skinna sist ble
// satt (`sel`) og hvordan: `auto` betyr «første spiller uten score fra og med
// dette setet», mens `pinned` (brukeren trykket på raden) og `awaitingPutts`
// (putter er på og mangler) holder setet fast. Aktiv spiller regnes ut av
// kortene ved hver render. Da flytter en score som kommer inn via realtime
// skinna videre av seg selv i `auto`, uten effekter, og en rad brukeren valgte
// blir stående.

import { useState } from 'react';
import { nextRailSeat, type RailSeat } from '@/lib/scorecard/scoreRail';
import { nextStrokes } from '@/lib/scorecard/strokeEntry';
import { findMySeat, type MySeatLookup } from './holeCards';
import type { HoleCard } from './holeLiveQueries';

type RailMode = 'auto' | 'pinned' | 'awaitingPutts';
type RailSelection = { seatId: string; mode: RailMode } | null;

// Putte-chipene 0–4 flytter skinna videre. «5+» åpner en stepper der hvert
// trykk også er et valg, så der blir skinna stående til «Neste: X →».
const MAX_CHIP_PUTTS = 4;

export type ScoreRailState = {
  /** Kortet skinna taster nå, eller null når alle har score. */
  activeSeatId: string | null;
  /** Neste spiller uten score etter den aktive, for «Neste: X →». */
  skipToSeatId: string | null;
  /** Score på aktivt sete, med vår egen skriving talt med før Dexie svarer. */
  activeScore: number | null;
  pick: (strokes: number) => void;
  /** Et valg i «Annet»-arket for et bestemt sete. */
  pickFor: (seatId: string, strokes: number) => void;
  step: (delta: 1 | -1) => void;
  undo: () => void;
  skip: () => void;
  selectRow: (seatId: string) => void;
  pickPutts: (putts: number) => void;
};

export function useScoreRail({
  cards,
  lookup,
  par,
  isLocked,
  puttsTracking,
  onSetScore,
  onSetPutts,
  clearScoreFor,
}: {
  cards: HoleCard[];
  lookup: MySeatLookup;
  par: number;
  isLocked: (seatId: string) => boolean;
  /** Formatet fanger putter og brukeren har slått dem på. */
  puttsTracking: boolean;
  onSetScore: (seatId: string, strokes: number) => Promise<void>;
  onSetPutts: (seatId: string, putts: number | null) => Promise<void>;
  clearScoreFor: (seatId: string) => Promise<void>;
}): ScoreRailState {
  const [sel, setSel] = useState<RailSelection>(null);
  // Våre egne skrivinger regnes som ført med en gang, så skinna ikke hopper
  // tilbake til et sete før Dexie har svart. En oppføring faller bort så
  // snart kortet selv viser en score: fra da er kortet sannheten, også når en
  // flightkamerat seinere nullstiller det.
  const [written, setWritten] = useState<Record<string, number>>({});
  const settled = Object.keys(written).filter(
    (id) => cards.find((c) => c.userId === id)?.score != null,
  );
  if (settled.length > 0) {
    const rest = { ...written };
    for (const id of settled) delete rest[id];
    setWritten(rest);
  }

  const scoreOf = (card: HoleCard): number | null =>
    card.score ?? written[card.userId] ?? null;
  const seats: RailSeat[] = cards.map((c) => ({
    score: scoreOf(c),
    locked: isLocked(c.userId),
  }));
  const indexOf = (seatId: string | null | undefined): number =>
    seatId == null ? -1 : cards.findIndex((c) => c.userId === seatId);
  const seatAt = (i: number | null): string | null =>
    i == null ? null : (cards[i]?.userId ?? null);

  const myIndex = indexOf(findMySeat(cards, lookup)?.userId);
  const selIndex = indexOf(sel?.seatId);

  let activeIndex: number | null;
  if (sel != null && sel.mode !== 'auto' && selIndex >= 0 && !seats[selIndex].locked) {
    activeIndex = selIndex;
  } else {
    const start = selIndex >= 0 ? selIndex : Math.max(myIndex, 0);
    activeIndex = nextRailSeat({ seats, startIndex: start });
  }
  const activeSeatId = seatAt(activeIndex);

  const nextIndex =
    activeIndex == null ? null : nextRailSeat({ seats, startIndex: activeIndex + 1 });
  const skipToSeatId = nextIndex == null || nextIndex === activeIndex ? null : seatAt(nextIndex);

  const activeCard = activeIndex == null ? undefined : cards[activeIndex];
  const activeScore = activeCard ? scoreOf(activeCard) : null;

  /** Skinna går videre: søk fra setet etter `seatId`. */
  function moveOnFrom(seatId: string) {
    const i = indexOf(seatId);
    const after = seatAt(i < 0 || cards.length === 0 ? null : (i + 1) % cards.length);
    setSel(after == null ? null : { seatId: after, mode: 'auto' });
  }

  function pickFor(seatId: string, strokes: number) {
    if (isLocked(seatId)) return;
    void onSetScore(seatId, strokes);
    setWritten((prev) => ({ ...prev, [seatId]: strokes }));
    const card = cards.find((c) => c.userId === seatId);
    if (puttsTracking && card?.putts == null) {
      setSel({ seatId, mode: 'awaitingPutts' });
      return;
    }
    moveOnFrom(seatId);
  }

  function pick(strokes: number) {
    if (activeSeatId != null) pickFor(activeSeatId, strokes);
  }

  function step(delta: 1 | -1) {
    if (activeSeatId == null) return;
    const strokes = nextStrokes({ current: activeScore, par, delta });
    void onSetScore(activeSeatId, strokes);
    setWritten((prev) => ({ ...prev, [activeSeatId]: strokes }));
    setSel({ seatId: activeSeatId, mode: sel?.mode === 'awaitingPutts' ? 'awaitingPutts' : 'pinned' });
  }

  function undo() {
    if (activeSeatId == null) return;
    void clearScoreFor(activeSeatId);
    setWritten((prev) => {
      const rest = { ...prev };
      delete rest[activeSeatId];
      return rest;
    });
    setSel({ seatId: activeSeatId, mode: 'pinned' });
  }

  function skip() {
    if (skipToSeatId != null) setSel({ seatId: skipToSeatId, mode: 'auto' });
  }

  function selectRow(seatId: string) {
    if (isLocked(seatId)) return;
    setSel({ seatId, mode: 'pinned' });
  }

  function pickPutts(putts: number) {
    if (activeSeatId == null) return;
    void onSetPutts(activeSeatId, putts);
    if (putts <= MAX_CHIP_PUTTS && activeScore != null) {
      moveOnFrom(activeSeatId);
    } else {
      setSel({ seatId: activeSeatId, mode: 'pinned' });
    }
  }

  return {
    activeSeatId,
    skipToSeatId,
    activeScore,
    pick,
    pickFor,
    step,
    undo,
    skip,
    selectRow,
    pickPutts,
  };
}
