// #2283: GIR på et cup-hull — raden og arket (`Sidekonk-gir` på designlerretet,
// G1–G7). GIR finnes bare i cup.
//
// GIR har ingen vinner: hver ball traff greenen på regulert antall slag eller
// ikke, og flere kan treffe. Arket har derfor én av/på-linje per ball
// (`girBallsForGame`): én per spiller, eller én per side i foursomes-familien,
// der laget spiller én ball. Hvert trykk lagrer bare den ballen
// (`record_gir_claims`), så to telefoner som huker av hver sin spiller aldri
// skriver over hverandre. «Ingen traff greenen» setter alle ballene til bommet.
//
// Arrangøren taster fortsatt cupens GIR-tellere selv; innmeldingene står bare
// ved siden av (del E).
import { useEffect, useRef, useState } from 'react';
import type { HoleContest } from '../../../../../lib/games/sideContest';
import { recordGirClaims, type GirClaim } from '../../data/sideClaims';
import {
  contestPointsLine,
  contestTitle,
  describeSideClaimFailure,
  girAnswer,
  girQuestion,
  girStatus,
  noneLabel,
  sheetKicker,
  SIDE_CONTEST_TEXT,
  type SavedBy,
} from '../../lib/sideContestCopy';
import { GirIcon } from '../icons/Icons';
import {
  ContestLine,
  ContestRow,
  ContestSheet,
  LineList,
  SheetQuestion,
  type ContestRowState,
  type LineFace,
} from './SideContestParts';

/** Én ball på hullet, slik arket viser den. */
export interface GirBallLine {
  key: string;
  userIds: string[];
  /** «Marte Lie», «Deg», eller «Deg og Marte» for en foursomes-side. */
  label: string;
  faces: LineFace[];
}

/** Et trykk per spiller, til serveren har et nyere svar for spilleren. */
type Pending = { hit: boolean; base: string | null };

export function GirContestCard({
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
}: {
  gameId: string;
  holeNumber: number;
  /** Spørsmålet følger par: på greenen på par − 2 slag. */
  par: number;
  contest: HoleContest & { category: 'gir' };
  balls: readonly GirBallLine[];
  oneBallPerSide: boolean;
  meId: string;
  /** Kampens GIR på hullet. `undefined` = ikke hentet ennå. */
  claims: readonly GirClaim[] | undefined;
  failed: boolean;
  online: boolean;
  savedByName: (userId: string) => string | null;
  refresh: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<ReadonlyMap<string, Pending>>(new Map());
  const [error, setError] = useState<string | null>(null);
  // Lagringer som er sendt eller venter i køen.
  const [inFlight, setInFlight] = useState(0);

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
   * Treffet for én spiller: trykket mens lagringer står i kø, og ellers så
   * lenge serveren ikke har noe nyere.
   */
  const pressLive = (userId: string, press: Pending) =>
    inFlight > 0 || press.base === (server.get(userId)?.updatedAt ?? null);
  const hitOf = (userId: string): boolean | null => {
    const row = server.get(userId);
    const press = pending.get(userId);
    if (press && pressLive(userId, press)) return press.hit;
    return row ? row.hit : null;
  };
  const pressedLive = [...pending.entries()].some(([userId, press]) => pressLive(userId, press));

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
    subtitle = SIDE_CONTEST_TEXT.rowOffline;
  } else if (!loaded && failed) {
    rowState = 'failed';
    subtitle = SIDE_CONTEST_TEXT.rowFetchFailed;
  } else if (anyReported) {
    rowState = 'answered';
    subtitle = girAnswer(hits, balls.length, allMissed);
  } else {
    rowState = 'report';
    subtitle = contestPointsLine(contest);
  }

  const save = (userIds: readonly string[], hit: boolean) => {
    const mySave = ++latest.current;
    setPending((prev) => {
      const next = new Map(prev);
      for (const userId of userIds) next.set(userId, { hit, base: server.get(userId)?.updatedAt ?? null });
      return next;
    });
    setError(null);
    setInFlight((n) => n + 1);
    chain.current = chain.current.then(async () => {
      try {
        const result = await recordGirClaims({ gameId, holeNumber, userIds, hit });
        if (!alive.current) return;
        if (result.ok) {
          await refresh();
          // Siste trykk er lagret: en feil fra et tidligere trykk gjelder ikke lenger.
          if (alive.current && mySave === latest.current) setError(null);
          return;
        }
        setError(describeSideClaimFailure(result.error, contest));
        // Ballen hopper tilbake til det serveren har, om ingen har trykket på den siden.
        setPending((prev) => {
          const next = new Map(prev);
          for (const userId of userIds) if (next.get(userId)?.hit === hit) next.delete(userId);
          return next;
        });
      } finally {
        if (alive.current) setInFlight((n) => n - 1);
      }
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
        icon={(color) => <GirIcon color={color} size={20} />}
        title={contestTitle('gir')}
        subtitle={subtitle}
        state={rowState}
        onPress={openSheet}
        testID="side-contest-gir"
      />
      <ContestSheet
        open={open}
        onClose={() => setOpen(false)}
        kicker={sheetKicker(contest, holeNumber)}
        title={contestTitle('gir')}
        notice={
          !online
            ? { kind: 'offline', text: SIDE_CONTEST_TEXT.sheetOffline }
            : error
              ? { kind: 'error', text: error }
              : null
        }
        status={girStatus(contest.maxPerTeam, oneBallPerSide, savedBy, !online)}
        saved={savedBy != null}
        testID="side-contest-gir-sheet"
      >
        <SheetQuestion text={girQuestion(par)} />
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
              testID={`side-contest-gir-line-${ball.key}`}
            />
          ))}
          <ContestLine
            faces={['none']}
            label={noneLabel('gir')}
            checked={allMissed}
            kind="checkbox"
            disabled={linesDisabled}
            last
            onPress={noneHit}
            testID="side-contest-gir-line-none"
          />
        </LineList>
      </ContestSheet>
    </>
  );
}
