// #2252: hvem skinna taster nå, og hva et trykk gjør — appens motstykke til
// webbens `holes/[holeNumber]/useScoreRail.ts` (#2251), med samme regler.
//
// Aktiv spiller lagres ikke direkte. Kroken husker bare hvor skinna sist ble
// satt (`sel`) og hvordan: `auto` betyr «første sete uten score fra og med
// dette», mens `pinned` (brukeren trykket på raden) og `awaitingPutts` (putter
// er på og mangler) holder setet fast. Aktivt sete regnes ut av setene ved
// hver render. Da flytter en score som kommer inn fra makkeren skinna videre
// av seg selv i `auto`, uten effekter, og en rad brukeren valgte blir stående.
//
// Hvilket sete som er neste, er den delte `nextRailSeat`. Hva «−»/«+» setter,
// er den delte `nextStrokes`.
import { useState } from 'react';
import { nextRailSeat, type RailSeat } from '../../../../lib/scorecard/scoreRail';
import { nextStrokes } from '../../../../lib/scorecard/strokeEntry';

/** Ett sete på skinna: en spiller, eller et lag i lagformatene. */
export type ScoreRailSeat = {
  id: string;
  score: number | null;
  putts: number | null;
  /** Levert, eller runden er ikke aktiv (#2211). */
  locked: boolean;
};

type RailMode = 'auto' | 'pinned' | 'awaitingPutts';
type RailSelection = { seatId: string; mode: RailMode } | null;

// Putte-chipene 0–4 flytter skinna videre. «5+» åpner en stepper der hvert
// trykk også er et valg, så der blir skinna stående til «Neste: X →».
const MAX_CHIP_PUTTS = 4;

export type ScoreRailState = {
  /** Setet skinna taster nå, eller `null` når alle har score. */
  activeSeatId: string | null;
  /** Neste sete uten score etter det aktive, for «Neste: X →». */
  skipToSeatId: string | null;
  /** Score på aktivt sete, med vår egen skriving talt med før SQLite svarer. */
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
  seats,
  mySeatId,
  par,
  puttsTracking,
  onSetScore,
  onSetPutts,
  clearScoreFor,
}: {
  seats: readonly ScoreRailSeat[];
  /** Mitt eget sete (eller lagets). Skinna starter der. */
  mySeatId: string | null;
  par: number;
  /** Formatet fanger putter, og bryteren er på. */
  puttsTracking: boolean;
  onSetScore: (seatId: string, strokes: number) => Promise<void>;
  onSetPutts: (seatId: string, putts: number) => Promise<void>;
  clearScoreFor: (seatId: string) => Promise<void>;
}): ScoreRailState {
  const [sel, setSel] = useState<RailSelection>(null);
  // Våre egne skrivinger regnes som ført med en gang, så skinna ikke hopper
  // tilbake til et sete før SQLite har svart. En oppføring faller bort så
  // snart setet selv viser en score: fra da er setet sannheten, også når en
  // makker seinere nullstiller det.
  const [written, setWritten] = useState<Record<string, number>>({});
  const settled = Object.keys(written).filter(
    (id) => seats.find((s) => s.id === id)?.score != null,
  );
  if (settled.length > 0) {
    const rest = { ...written };
    for (const id of settled) delete rest[id];
    setWritten(rest);
  }

  const scoreOf = (seat: ScoreRailSeat): number | null =>
    seat.score ?? written[seat.id] ?? null;
  const isLocked = (seatId: string): boolean =>
    seats.find((s) => s.id === seatId)?.locked ?? true;
  const railSeats: RailSeat[] = seats.map((s) => ({ score: scoreOf(s), locked: s.locked }));
  const indexOf = (seatId: string | null | undefined): number =>
    seatId == null ? -1 : seats.findIndex((s) => s.id === seatId);
  const seatAt = (i: number | null): string | null =>
    i == null ? null : (seats[i]?.id ?? null);

  const myIndex = indexOf(mySeatId);
  const selIndex = indexOf(sel?.seatId);

  let activeIndex: number | null;
  if (sel != null && sel.mode !== 'auto' && selIndex >= 0 && !railSeats[selIndex]!.locked) {
    activeIndex = selIndex;
  } else {
    const start = selIndex >= 0 ? selIndex : Math.max(myIndex, 0);
    activeIndex = nextRailSeat({ seats: railSeats, startIndex: start });
  }
  const activeSeatId = seatAt(activeIndex);

  const nextIndex =
    activeIndex == null ? null : nextRailSeat({ seats: railSeats, startIndex: activeIndex + 1 });
  const skipToSeatId =
    nextIndex == null || nextIndex === activeIndex ? null : seatAt(nextIndex);

  const activeSeat = activeIndex == null ? undefined : seats[activeIndex];
  const activeScore = activeSeat ? scoreOf(activeSeat) : null;

  /** Skinna går videre: søk fra setet etter `seatId`. */
  function moveOnFrom(seatId: string) {
    const i = indexOf(seatId);
    const after = seatAt(i < 0 || seats.length === 0 ? null : (i + 1) % seats.length);
    setSel(after == null ? null : { seatId: after, mode: 'auto' });
  }

  function pickFor(seatId: string, strokes: number) {
    if (isLocked(seatId)) return;
    void onSetScore(seatId, strokes);
    setWritten((prev) => ({ ...prev, [seatId]: strokes }));
    const seat = seats.find((s) => s.id === seatId);
    if (puttsTracking && seat?.putts == null) {
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
    setSel({
      seatId: activeSeatId,
      mode: sel?.mode === 'awaitingPutts' ? 'awaitingPutts' : 'pinned',
    });
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
