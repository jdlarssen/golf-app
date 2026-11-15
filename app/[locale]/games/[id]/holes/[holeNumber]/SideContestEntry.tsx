'use client';

// #2283 (part D3): closest to pin and longest drive on the hole, the row and the
// sheet (`Sidekonk-kortet` on the design canvas, K1–K7 and the save error). The
// same behaviour as the app's `SideContestCard`, one to one.
//
// The flight reports who won the hole; the organiser still picks the winner at
// the end. One tap on a line saves for the whole flight (`record_side_claim`),
// everyone in the flight can change it, and the last tap wins. «Ferdig» only
// closes.
//
// The server is the truth (the owner's choice B, 15.11). A tap shows at once and
// holds only while its own save runs: the newest tap that is not saved yet wins
// over what the server has. Once the save is done the tap is held until a
// snapshot from a read that started after the save, so it does not flicker back
// because one read failed. After that the card shows the server, also when a
// flight-mate wrote right after you. If the save fails the choice snaps back.
// Saves go one at a time, so quick taps on + never land in the wrong order, and
// each tap counts from the previous one.
import { useEffect, useRef, useState } from 'react';
import type { SideClaim, SideClaimWriteResult } from '@/lib/games/sideClaims';
import type { HoleContest, SideContestCategory } from '@/lib/games/sideContest';
import { recordSideClaim } from './sideClaimActions';
import {
  ContestLine,
  ContestRow,
  ContestSheet,
  DistanceField,
  DriveContestIcon,
  LineList,
  PinFlagContestIcon,
  SheetSection,
  type ContestRowState,
} from './SideContestParts';
import { useSideContestText, type SavedBy, type SideContestText } from './sideContestText';

/** A player in the flight, as the row and the sheet show them. */
export interface ContestPlayer {
  userId: string;
  /** The full name in the sheet, «Deg» for yourself. */
  label: string;
  /** The first name in the row («Marte · 2,5 m»), «Deg» for yourself. */
  shortLabel: string;
  initials: string;
}

type Answer = { winnerUserId: string | null; distanceM: number | null };

/**
 * A tap and its save number. `holdUntil` is `null` while the save runs; after,
 * the sequence number of the last read that went out before the save was done,
 * and the tap stands until a newer snapshot is on screen.
 */
type Pending = Answer & { save: number; holdUntil: number | null };

/** What the row shows: the state and its subtitle. */
function rowFor({
  text,
  contest,
  online,
  loaded,
  failed,
  answer,
  winnerLabel,
}: {
  text: SideContestText;
  contest: HoleContest & { category: SideContestCategory };
  online: boolean;
  loaded: boolean;
  failed: boolean;
  answer: Answer | null;
  winnerLabel: (userId: string) => string;
}): { rowState: ContestRowState; subtitle: string } {
  if (!online) return { rowState: 'offline', subtitle: text.rowOffline };
  if (!loaded && failed) return { rowState: 'failed', subtitle: text.rowFetchFailed };
  if (answer) {
    const name = answer.winnerUserId == null ? null : winnerLabel(answer.winnerUserId);
    return { rowState: 'answered', subtitle: text.sideAnswer(contest.category, name, answer.distanceM) };
  }
  return { rowState: 'report', subtitle: text.pointsLine(contest) };
}

export function SideContestEntry({
  gameId,
  holeNumber,
  contest,
  players,
  meId,
  claim,
  failed,
  online,
  savedByName,
  refresh,
  snapshotSeq,
  startedSeq,
}: {
  gameId: string;
  holeNumber: number;
  contest: HoleContest & { category: SideContestCategory };
  players: readonly ContestPlayer[];
  meId: string;
  /** The flight's answer. `null` = nobody has reported; `undefined` = not read yet. */
  claim: SideClaim | null | undefined;
  /** No read has succeeded for the hole. */
  failed: boolean;
  online: boolean;
  /** The first name of whoever saved, for «Lagret av Tore». */
  savedByName: (userId: string) => string | null;
  refresh: () => Promise<void>;
  /** The sequence number of the read on screen (`useSideClaims`). */
  snapshotSeq: number;
  /** The sequence number of the last read that has gone out. */
  startedSeq: () => number;
}) {
  const text = useSideContestText();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
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

  const category = contest.category;
  const live = pending && (pending.holdUntil === null || snapshotSeq <= pending.holdUntil) ? pending : null;
  const answer: Answer | null =
    live ?? (claim ? { winnerUserId: claim.winnerUserId, distanceM: claim.distanceM } : null);
  const loaded = claim !== undefined;

  const savedBy: SavedBy | null = live
    ? { me: true }
    : claim
      ? claim.enteredBy === meId
        ? { me: true }
        : { me: false, name: savedByName(claim.enteredBy) }
      : null;

  const { rowState, subtitle } = rowFor({
    text,
    contest,
    online,
    loaded,
    failed,
    answer,
    winnerLabel: (userId) => players.find((p) => p.userId === userId)?.shortLabel ?? savedByName(userId) ?? '',
  });

  const save = (next: Answer) => {
    const mySave = ++latest.current;
    setPending({ ...next, save: mySave, holdUntil: null });
    setError(null);
    chain.current = chain.current.then(async () => {
      let result: SideClaimWriteResult;
      try {
        result = await recordSideClaim({
          gameId,
          category,
          holeNumber,
          winnerUserId: next.winnerUserId,
          distanceM: next.winnerUserId == null ? null : next.distanceM,
        });
      } catch {
        // A server action rejects when the network is gone. The chain must go on.
        result = { ok: false, error: 'db_error' };
      }
      if (!alive.current) return;
      if (result.ok) {
        // Saved: the tap stands until a read that starts now or later has answered.
        const holdUntil = startedSeq();
        setPending((p) => (p && p.save === mySave ? { ...p, holdUntil } : p));
        // The last tap is saved: an error from an earlier tap no longer applies.
        if (mySave === latest.current) setError(null);
        await refresh();
        return;
      }
      setError(text.describeFailure(result.error, contest));
      // The choice snaps back to what the server has, if nobody has tapped since.
      setPending((p) => (p && p.save === mySave ? null : p));
    });
  };

  const pick = (winnerUserId: string | null) => {
    if (!online || !loaded) return;
    if (answer && answer.winnerUserId === winnerUserId) return;
    // The distance belongs to the winner: a new winner starts without one.
    save({ winnerUserId, distanceM: null });
  };

  const commitDistance = (distanceM: number | null) => {
    if (!online || !answer || answer.winnerUserId == null) return;
    save({ winnerUserId: answer.winnerUserId, distanceM });
  };

  const openSheet = () => {
    setError(null);
    setOpen(true);
    void refresh();
  };

  const linesDisabled = !online || !loaded;
  const testId = `side-contest-${category}`;

  return (
    <>
      <ContestRow
        icon={category === 'closest_to_pin' ? <PinFlagContestIcon /> : <DriveContestIcon />}
        title={text.title(category)}
        subtitle={subtitle}
        state={rowState}
        onPress={openSheet}
        testId={testId}
      />
      <ContestSheet
        open={open}
        onClose={() => setOpen(false)}
        kicker={text.kicker(contest, holeNumber)}
        title={text.title(category)}
        notice={
          !online
            ? { kind: 'offline', text: text.sheetOffline }
            : error
              ? { kind: 'error', text: error }
              : null
        }
        status={text.sideStatus(contest, savedBy, !online)}
        saved={savedBy != null}
        testId={`${testId}-sheet`}
      >
        <SheetSection question={text.sideQuestion(contest)}>
          <LineList>
            {players.map((player) => (
              <ContestLine
                key={player.userId}
                faces={[{ initials: player.initials }]}
                label={player.label}
                checked={answer?.winnerUserId === player.userId}
                kind="radio"
                disabled={linesDisabled}
                last={false}
                onPress={() => pick(player.userId)}
                testId={`${testId}-line-${player.userId}`}
              />
            ))}
            <ContestLine
              faces={['none']}
              label={text.noneLabel(category)}
              checked={answer != null && answer.winnerUserId == null}
              kind="radio"
              disabled={linesDisabled}
              last
              onPress={() => pick(null)}
              testId={`${testId}-line-none`}
            />
          </LineList>
          {category === 'closest_to_pin' && answer?.winnerUserId != null ? (
            <DistanceField
              value={answer.distanceM}
              disabled={!online}
              onCommit={commitDistance}
              testId={`${testId}-distance`}
            />
          ) : null}
        </SheetSection>
      </ContestSheet>
    </>
  );
}
