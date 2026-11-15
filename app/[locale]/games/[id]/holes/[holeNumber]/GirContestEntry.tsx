'use client';

// #2283 (part D3): GIR on a cup hole, the row and the sheet (`Sidekonk-gir` on
// the design canvas, G1–G7). GIR exists only in a cup. The same behaviour as
// the app's `GirContestCard`, one to one.
//
// GIR has no winner: each ball hit the green in regulation or not, and several
// can hit. The sheet therefore has one toggle per ball (`girBallsForGame`): one
// per player, or one per side in the foursomes family, where the side plays one
// ball. Each tap saves only that ball (`record_gir_claims`), so two phones
// ticking off one player each never overwrite each other. «Ingen traff
// greenen» sets every ball to missed.
//
// The organiser still types the cup's GIR counters; the reports only stand
// beside them (part E).
//
// The press-hold rule is `SideContestEntry`'s, kept per player here: a save on
// one ball never makes an old tap on another ball count again.
import { useEffect, useRef, useState } from 'react';
import type { GirClaim, SideClaimWriteResult } from '@/lib/games/sideClaims';
import type { HoleContest } from '@/lib/games/sideContest';
import { recordGirClaims } from './sideClaimActions';
import {
  ContestLine,
  ContestRow,
  ContestSheet,
  GirContestIcon,
  LineList,
  SheetSection,
  type ContestRowState,
  type LineFace,
} from './SideContestParts';
import { useSideContestText, type SavedBy } from './sideContestText';

/** One ball on the hole, as the sheet shows it. */
export interface GirBallLine {
  key: string;
  userIds: string[];
  /** «Marte Lie», «Deg», or «Deg og Marte» for a foursomes side. */
  label: string;
  faces: LineFace[];
}

/**
 * One tap per player and its save number. `holdUntil` is `null` while the save
 * runs; after, the sequence number of the last read that went out before the
 * save was done, and the tap stands until a newer snapshot is on screen. Each
 * ball has its own tap.
 */
type Pending = { hit: boolean; save: number; holdUntil: number | null };

export function GirContestEntry({
  gameId,
  holeNumber,
  par,
  contest,
  balls,
  oneBallPerSide,
  meId,
  claims,
  failed,
  online,
  savedByName,
  refresh,
  snapshotSeq,
  startedSeq,
}: {
  gameId: string;
  holeNumber: number;
  /** The question follows par: on the green in par − 2 shots. */
  par: number;
  contest: HoleContest & { category: 'gir' };
  balls: readonly GirBallLine[];
  oneBallPerSide: boolean;
  meId: string;
  /** The match's GIR on the hole. `undefined` = not read yet. */
  claims: readonly GirClaim[] | undefined;
  failed: boolean;
  online: boolean;
  savedByName: (userId: string) => string | null;
  refresh: () => Promise<void>;
  /** The sequence number of the read on screen (`useSideClaims`). */
  snapshotSeq: number;
  /** The sequence number of the last read that has gone out. */
  startedSeq: () => number;
}) {
  const text = useSideContestText();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<ReadonlyMap<string, Pending>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const latest = useRef(0);

  const loaded = claims !== undefined;
  const server = new Map((claims ?? []).map((row) => [row.userId, row]));

  /**
   * Does the tap count? While its save runs, and after, until a read that
   * started after the save has answered. The server is the truth; a tap is
   * never compared with a row.
   */
  const pressLive = (press: Pending) => press.holdUntil === null || snapshotSeq <= press.holdUntil;
  const hitOf = (userId: string): boolean | null => {
    const row = server.get(userId);
    const press = pending.get(userId);
    if (press && pressLive(press)) return press.hit;
    return row ? row.hit : null;
  };
  const pressedLive = [...pending.values()].some(pressLive);

  const ballHit = (ball: GirBallLine) => ball.userIds.some((userId) => hitOf(userId) === true);
  const ballReported = (ball: GirBallLine) => ball.userIds.some((userId) => hitOf(userId) !== null);
  const hits = balls.filter(ballHit).length;
  const anyReported = balls.some(ballReported);
  const allMissed = balls.length > 0 && balls.every(ballReported) && hits === 0;

  const newest = (claims ?? []).reduce<GirClaim | null>(
    (best, row) => (best == null || row.updatedAt > best.updatedAt ? row : best),
    null,
  );
  const savedBy: SavedBy | null = pressedLive
    ? { me: true }
    : newest
      ? newest.enteredBy === meId
        ? { me: true }
        : { me: false, name: savedByName(newest.enteredBy) }
      : null;

  let rowState: ContestRowState;
  let subtitle: string;
  if (!online) {
    rowState = 'offline';
    subtitle = text.rowOffline;
  } else if (!loaded && failed) {
    rowState = 'failed';
    subtitle = text.rowFetchFailed;
  } else if (anyReported) {
    rowState = 'answered';
    subtitle = text.girAnswer(hits, balls.length, allMissed);
  } else {
    rowState = 'report';
    subtitle = text.pointsLine(contest);
  }

  const save = (userIds: readonly string[], hit: boolean) => {
    const mySave = ++latest.current;
    setPending((prev) => {
      const next = new Map(prev);
      for (const userId of userIds) next.set(userId, { hit, save: mySave, holdUntil: null });
      return next;
    });
    setError(null);
    chain.current = chain.current.then(async () => {
      let result: SideClaimWriteResult;
      try {
        result = await recordGirClaims({ gameId, holeNumber, userIds: [...userIds], hit });
      } catch {
        // A server action rejects when the network is gone. The chain must go on.
        result = { ok: false, error: 'db_error' };
      }
      if (!alive.current) return;
      if (result.ok) {
        // Saved: the taps stand until a read that starts now or later has answered.
        const holdUntil = startedSeq();
        setPending((prev) => {
          const next = new Map(prev);
          for (const userId of userIds) {
            const press = next.get(userId);
            if (press && press.save === mySave) next.set(userId, { ...press, holdUntil });
          }
          return next;
        });
        // The last tap is saved: an error from an earlier tap no longer applies.
        if (mySave === latest.current) setError(null);
        await refresh();
        return;
      }
      setError(text.describeFailure(result.error, contest));
      // The ball snaps back to what the server has, if nobody has tapped it since.
      setPending((prev) => {
        const next = new Map(prev);
        for (const userId of userIds) if (next.get(userId)?.save === mySave) next.delete(userId);
        return next;
      });
    });
  };

  const toggle = (ball: GirBallLine) => {
    if (!online || !loaded) return;
    save(ball.userIds, !ballHit(ball));
  };

  const noneHit = () => {
    if (!online || !loaded || allMissed) return;
    save(
      balls.flatMap((ball) => ball.userIds),
      false,
    );
  };

  const openSheet = () => {
    setError(null);
    setOpen(true);
    void refresh();
  };

  const linesDisabled = !online || !loaded;

  return (
    <>
      <ContestRow
        icon={<GirContestIcon />}
        title={text.title('gir')}
        subtitle={subtitle}
        state={rowState}
        onPress={openSheet}
        testId="side-contest-gir"
      />
      <ContestSheet
        open={open}
        onClose={() => setOpen(false)}
        kicker={text.kicker(contest, holeNumber)}
        title={text.title('gir')}
        notice={
          !online
            ? { kind: 'offline', text: text.sheetOffline }
            : error
              ? { kind: 'error', text: error }
              : null
        }
        status={text.girStatus(contest.maxPerTeam, oneBallPerSide, savedBy, !online)}
        saved={savedBy != null}
        testId="side-contest-gir-sheet"
      >
        <SheetSection question={text.girQuestion(par)}>
          <LineList>
            {balls.map((ball) => (
              <ContestLine
                key={ball.key}
                faces={ball.faces}
                label={ball.label}
                checked={ballHit(ball)}
                kind="checkbox"
                disabled={linesDisabled}
                last={false}
                onPress={() => toggle(ball)}
                testId={`side-contest-gir-line-${ball.key}`}
              />
            ))}
            <ContestLine
              faces={['none']}
              label={text.noneLabel('gir')}
              checked={allMissed}
              kind="checkbox"
              disabled={linesDisabled}
              last
              onPress={noneHit}
              testId="side-contest-gir-line-none"
            />
          </LineList>
        </SheetSection>
      </ContestSheet>
    </>
  );
}
