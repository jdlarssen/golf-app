// #2283 (part D) — Type B: the app's side-contest wording is the web's, character for
// character. The approved text lives in `lib/games/sideContestCopyCases.ts`, as data: the
// cases and the exact Norwegian output. This suite asserts the app's copy
// (`sideContestCopy.ts`, `endGameCopy.ts`) against it; the web asserts its message catalog
// against the same file
// (`app/[locale]/games/[id]/holes/sideContestCopy.parity.test.tsx`). Neither side imports the
// other, so the web's CI job needs nothing from `native/`. A reworded sentence on either
// side turns that side's suite red.
//
// Each check maps the cases through the app and compares with the fixture, so a failure
// prints the whole case (inputs and expected text), not only the string.
import {
  DISTANCE_CASES,
  FAILURE_CASES,
  FIXED_STRINGS,
  GIR_ANSWER_CASES,
  GIR_QUESTION_CASES,
  GIR_STATUS_CASES,
  KICKER_CASES,
  NAME_LIST_CASES,
  POINTS_LINE_CASES,
  QUESTION_CASES,
  REPORTED_BOX_CASES,
  REPORTED_FIXED,
  REPORTED_NONE_CASES,
  SIDE_ANSWER_CASES,
  SIDE_STATUS_CASES,
  SLOT_LABEL_CASES,
  TITLE_CASES,
} from '../../../../lib/games/sideContestCopyCases';
import { formatNameList } from './display';
import {
  REPORTED_TEXT,
  reportedDistance,
  reportedFlight,
  reportedMissing,
  reportedName,
  reportedNone,
  slotRowTitle,
} from './endGameCopy';
import {
  SIDE_CONTEST_TEXT,
  contestPointsLine,
  contestTitle,
  describeSideClaimFailure,
  formatDistance,
  girAnswer,
  girQuestion,
  girStatus,
  noneLabel,
  sheetKicker,
  sideAnswer,
  sideQuestion,
  sideStatus,
} from './sideContestCopy';

describe('the row and the sheet say what the fixture says', () => {
  it('the fixed strings', () => {
    // `toEqual` on the whole table: a key added to the app's table fails here until the fixture has it.
    expect(SIDE_CONTEST_TEXT).toEqual(FIXED_STRINGS);
  });

  it('titles and the «none» answers, per category', () => {
    expect(TITLE_CASES.map((c) => ({ ...c, title: contestTitle(c.category), none: noneLabel(c.category) }))).toEqual(
      TITLE_CASES,
    );
  });

  it('the row’s subtitle, for every shape of contest', () => {
    expect(POINTS_LINE_CASES.map((c) => ({ ...c, text: contestPointsLine(c.contest) }))).toEqual(POINTS_LINE_CASES);
  });

  it('the sheet’s kicker, for every shape of contest', () => {
    expect(KICKER_CASES.map((c) => ({ ...c, text: sheetKicker(c.contest, c.hole) }))).toEqual(KICKER_CASES);
  });

  it('the question over the list', () => {
    expect(QUESTION_CASES.map((c) => ({ ...c, text: sideQuestion(c.contest) }))).toEqual(QUESTION_CASES);
  });

  it('the GIR question follows par', () => {
    expect(GIR_QUESTION_CASES.map((c) => ({ ...c, text: girQuestion(c.par) }))).toEqual(GIR_QUESTION_CASES);
  });

  it('the status line, for who saved and online or not', () => {
    expect(SIDE_STATUS_CASES.map((c) => ({ ...c, text: sideStatus(c.contest, c.savedBy, c.offline) }))).toEqual(
      SIDE_STATUS_CASES,
    );
    expect(
      GIR_STATUS_CASES.map((c) => ({ ...c, text: girStatus(c.maxPerTeam, c.oneBallPerSide, c.savedBy, c.offline) })),
    ).toEqual(GIR_STATUS_CASES);
  });

  it('the answers in the row', () => {
    expect(SIDE_ANSWER_CASES.map((c) => ({ ...c, text: sideAnswer(c.category, c.name, c.distanceM) }))).toEqual(
      SIDE_ANSWER_CASES,
    );
    expect(GIR_ANSWER_CASES.map((c) => ({ ...c, text: girAnswer(c.hits, c.balls, c.allMissed) }))).toEqual(
      GIR_ANSWER_CASES,
    );
  });

  it('the distance', () => {
    expect(DISTANCE_CASES.map((c) => ({ ...c, text: formatDistance(c.distanceM) }))).toEqual(DISTANCE_CASES);
  });

  it('«Deg og Marte», the names of a foursomes side', () => {
    expect(NAME_LIST_CASES.map((c) => ({ ...c, text: formatNameList(c.names) }))).toEqual(NAME_LIST_CASES);
  });

  it('what the player is told when a report was not saved, for every code and both groups', () => {
    expect(FAILURE_CASES.map((c) => ({ ...c, text: describeSideClaimFailure(c.failure, c.contest) }))).toEqual(
      FAILURE_CASES,
    );
  });
});

describe('the finish sheet says what the fixture says', () => {
  it('the lines: flight, name or «Ingen på …», distance, and the flights that have not reported', () => {
    expect(
      REPORTED_BOX_CASES.map((box) => ({
        ...box,
        lines: box.lines.map((l) => ({
          ...l,
          flight: reportedFlight(l.flightNumber),
          nameText: reportedName(box.category, l.name),
          distanceText: l.distanceM === null ? null : reportedDistance(l.distanceM),
        })),
        missing: box.missing.map((m) => ({ ...m, text: reportedMissing(m.flightNumber) })),
      })),
    ).toEqual(REPORTED_BOX_CASES);
  });

  it('the heading, the empty box and the failed read', () => {
    expect(REPORTED_TEXT).toEqual(REPORTED_FIXED);
    expect(REPORTED_NONE_CASES.map((c) => ({ ...c, text: reportedNone(c.hole) }))).toEqual(REPORTED_NONE_CASES);
  });

  it('the slot’s label with and without a hole', () => {
    expect(
      SLOT_LABEL_CASES.map((c) => ({
        ...c,
        text: slotRowTitle({ key: `${c.category}-${c.position}`, category: c.category, position: c.position, hole: c.hole }),
      })),
    ).toEqual(SLOT_LABEL_CASES);
  });
});
