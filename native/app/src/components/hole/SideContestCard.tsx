// #2283: nærmest pinnen og lengste drive på hullet — raden og arket
// (`Sidekonk-kortet` på designlerretet, K1–K7 og lagringsfeilen).
//
// Flighten melder inn hvem som vant hullet; arrangøren kårer fortsatt vinneren
// til slutt. Ett trykk på en linje lagrer for hele flighten (`record_side_claim`),
// alle i flighten kan endre, og siste trykk gjelder. «Ferdig» lukker bare.
//
// Serveren er fasit (eierens valg B, 15.11). Et trykk vises med en gang og
// gjelder bare mens dets egen lagring pågår: det siste trykket som ennå ikke er
// lagret, vinner over det serveren har. Er lagringen ferdig, holdes trykket til
// det kommer et svar fra en henting som startet etter lagringen, så det ikke
// flimrer tilbake fordi én henting feilet. Deretter viser kortet serveren, også
// når en kamerat skrev rett etter deg. Feiler lagringen, hopper valget tilbake.
// Lagringene går én om gangen, så raske trykk på + aldri lander i feil
// rekkefølge, og hvert trykk regner fra forrige trykk.
import { useEffect, useRef, useState } from 'react';
import type { HoleContest, SideContestCategory } from '../../../../../lib/games/sideContest';
import { recordSideClaim, type SideClaim } from '../../data/sideClaims';
import {
  contestPointsLine,
  contestTitle,
  describeSideClaimFailure,
  noneLabel,
  sheetKicker,
  sideAnswer,
  sideQuestion,
  sideStatus,
  SIDE_CONTEST_TEXT,
  type SavedBy,
} from '../../lib/sideContestCopy';
import { DriveIcon, PinnenIcon } from '../icons/Icons';
import {
  ContestLine,
  ContestRow,
  ContestSheet,
  DistanceField,
  LineList,
  SheetQuestion,
  type ContestRowState,
} from './SideContestParts';

/** En spiller i flighten, slik raden og arket viser henne. */
export interface ContestPlayer {
  userId: string;
  /** Fullt navn i arket, «Deg» for deg selv. */
  label: string;
  /** Fornavnet i raden («Marte · 2,5 m»), «Deg» for deg selv. */
  shortLabel: string;
  initials: string;
}

type Answer = { winnerUserId: string | null; distanceM: number | null };

/**
 * Et trykk og lagringsnummeret dets. `holdUntil` er `null` mens lagringen
 * pågår; etterpå løpenummeret til siste henting som gikk ut før lagringen var
 * ferdig, og trykket gjelder til et nyere svar står på skjermen.
 */
type Pending = Answer & { save: number; holdUntil: number | null };

export function SideContestCard({
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
  /** Flightens svar. `null` = ingen har meldt inn; `undefined` = ikke hentet ennå. */
  claim: SideClaim | null | undefined;
  /** Ingen henting har lyktes for hullet. */
  failed: boolean;
  online: boolean;
  /** Fornavnet til den som lagret, for «Lagret av Tore». */
  savedByName: (userId: string) => string | null;
  refresh: () => Promise<void>;
  /** Løpenummeret til hentingen som står nå (`useSideClaims`). */
  snapshotSeq: number;
  /** Løpenummeret til den siste hentingen som har gått ut. */
  startedSeq: () => number;
}) {
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
  const answer: Answer | null = live ?? (claim ? { winnerUserId: claim.winnerUserId, distanceM: claim.distanceM } : null);
  const loaded = claim !== undefined;

  const savedBy: SavedBy | null = live
    ? { me: true }
    : claim
      ? claim.enteredBy === meId
        ? { me: true }
        : { me: false, name: savedByName(claim.enteredBy) }
      : null;

  const winner = answer?.winnerUserId != null ? players.find((p) => p.userId === answer.winnerUserId) : undefined;

  let rowState: ContestRowState;
  let subtitle: string;
  if (!online) {
    rowState = 'offline';
    subtitle = SIDE_CONTEST_TEXT.rowOffline;
  } else if (!loaded && failed) {
    rowState = 'failed';
    subtitle = SIDE_CONTEST_TEXT.rowFetchFailed;
  } else if (answer) {
    rowState = 'answered';
    subtitle = sideAnswer(
      category,
      answer.winnerUserId == null ? null : (winner?.shortLabel ?? savedByName(answer.winnerUserId) ?? ''),
      answer.distanceM,
    );
  } else {
    rowState = 'report';
    subtitle = contestPointsLine(contest);
  }

  const save = (next: Answer) => {
    const mySave = ++latest.current;
    setPending({ ...next, save: mySave, holdUntil: null });
    setError(null);
    chain.current = chain.current.then(async () => {
      const result = await recordSideClaim({
        gameId,
        category,
        holeNumber,
        winnerUserId: next.winnerUserId,
        distanceM: next.winnerUserId == null ? null : next.distanceM,
      });
      if (!alive.current) return;
      if (result.ok) {
        // Lagret: trykket står til en henting som starter nå eller senere har svart.
        const holdUntil = startedSeq();
        setPending((p) => (p && p.save === mySave ? { ...p, holdUntil } : p));
        // Siste trykk er lagret: en feil fra et tidligere trykk gjelder ikke lenger.
        if (mySave === latest.current) setError(null);
        await refresh();
        return;
      }
      setError(describeSideClaimFailure(result.error, contest));
      // Valget hopper tilbake til det serveren har, om ingen har trykket siden.
      setPending((p) => (p && p.save === mySave ? null : p));
    });
  };

  const pick = (winnerUserId: string | null) => {
    if (!online || !loaded) return;
    if (answer && answer.winnerUserId === winnerUserId) return;
    // Avstanden hører til vinneren: en ny vinner starter uten.
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
  const testID = `side-contest-${category}`;

  return (
    <>
      <ContestRow
        icon={(color) =>
          category === 'closest_to_pin' ? <PinnenIcon color={color} size={20} /> : <DriveIcon color={color} size={20} />
        }
        title={contestTitle(category)}
        subtitle={subtitle}
        state={rowState}
        onPress={openSheet}
        testID={testID}
      />
      <ContestSheet
        open={open}
        onClose={() => setOpen(false)}
        kicker={sheetKicker(contest, holeNumber)}
        title={contestTitle(category)}
        notice={
          !online
            ? { kind: 'offline', text: SIDE_CONTEST_TEXT.sheetOffline }
            : error
              ? { kind: 'error', text: error }
              : null
        }
        status={sideStatus(contest, savedBy, !online)}
        saved={savedBy != null}
        testID={`${testID}-sheet`}
      >
        <SheetQuestion text={sideQuestion(contest)} />
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
              testID={`${testID}-line-${player.userId}`}
            />
          ))}
          <ContestLine
            faces={['none']}
            label={noneLabel(category)}
            checked={answer != null && answer.winnerUserId == null}
            kind="radio"
            disabled={linesDisabled}
            last
            onPress={() => pick(null)}
            testID={`${testID}-line-none`}
          />
        </LineList>
        {category === 'closest_to_pin' && answer?.winnerUserId != null ? (
          <DistanceField
            value={answer.distanceM}
            disabled={!online}
            onCommit={commitDistance}
            testID={`${testID}-distance`}
          />
        ) : null}
      </ContestSheet>
    </>
  );
}
