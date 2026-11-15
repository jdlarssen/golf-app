import { render, renderHook } from '@testing-library/react';
import { useTranslations } from 'next-intl';
import { describe, expect, it } from 'vitest';
import { SideWinnersForm } from '@/app/[locale]/admin/games/[id]/avslutt/SideWinnersForm';
import type { SideSlotView } from '@/lib/games/finishSideSlots';
import type { SideClaimFailure } from '@/lib/games/sideClaims';
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
  type ReportedBoxCase,
} from '@/lib/games/sideContestCopyCases';
import type { SideContestCategory } from '@/lib/games/sideContest';
import { useSideContestText } from './sideContestText';

// #2283 (part D) — Type B: the web's side-contest wording is the app's, character for
// character. The approved text lives in `lib/games/sideContestCopyCases.ts`, as data: the
// cases and the exact Norwegian output. This suite asserts the web's copy (the message
// catalog, through the real `useSideContestText` and the real finish form) against it; the
// app asserts its own copy against the same file (`sideContestCopy.parity.test.ts`, in the
// app's `src/lib`). Neither side imports the other, so this file loads in the web's CI job,
// which has no native dependencies installed. A reworded message on either side turns that
// side's suite red.
//
// Norwegian only: the app has no other language. The English catalog is held to the same
// keys and ICU shape by `sideContestText.test.ts`.
//
// Each check maps the cases through the web and compares with the fixture, so a failure
// prints the whole case (inputs and expected text), not only the string.

describe('the hole page’s side-contest wording is the fixture’s', () => {
  const text = renderHook(() => useSideContestText()).result.current;
  const t = renderHook(() => useTranslations('holes.sideContest')).result.current;
  const g = renderHook(() => useTranslations('holes.girContest')).result.current;

  it('the fixed strings', () => {
    // The web's counterpart of every key in the fixture. A new key there has no entry here
    // and fails `tsc` until someone decides where the web has it.
    const web: Record<keyof typeof FIXED_STRINGS, string> = {
      report: text.report,
      gameKicker: t('rowGame'),
      cupKicker: t('kickerCup', { hole: 1, points: 'x' }).split(' · ')[0],
      rowOffline: text.rowOffline,
      rowFetchFailed: text.rowFetchFailed,
      sheetOffline: text.sheetOffline,
      distanceLabel: t('distanceLabel'),
      metre: t('metre'),
      metreField: t('metreField'),
      shorter: t('shorter'),
      longer: t('longer'),
      done: t('done'),
      close: t('close'),
      you: text.you,
      oneBall: g('oneBall'),
    };
    expect(web).toEqual(FIXED_STRINGS);
  });

  it('titles and the «none» answers, per category', () => {
    expect(
      TITLE_CASES.map((c) => ({ ...c, title: text.title(c.category), none: text.noneLabel(c.category) })),
    ).toEqual(TITLE_CASES);
  });

  it('the row’s subtitle, for every shape of contest', () => {
    expect(POINTS_LINE_CASES.map((c) => ({ ...c, text: text.pointsLine(c.contest) }))).toEqual(POINTS_LINE_CASES);
  });

  it('the sheet’s kicker, for every shape of contest', () => {
    expect(KICKER_CASES.map((c) => ({ ...c, text: text.kicker(c.contest, c.hole) }))).toEqual(KICKER_CASES);
  });

  it('the question over the list', () => {
    expect(QUESTION_CASES.map((c) => ({ ...c, text: text.sideQuestion(c.contest) }))).toEqual(QUESTION_CASES);
  });

  it('the GIR question follows par', () => {
    expect(GIR_QUESTION_CASES.map((c) => ({ ...c, text: text.girQuestion(c.par) }))).toEqual(GIR_QUESTION_CASES);
  });

  it('the status line, for who saved and online or not', () => {
    expect(
      SIDE_STATUS_CASES.map((c) => ({ ...c, text: text.sideStatus(c.contest, c.savedBy, c.offline) })),
    ).toEqual(SIDE_STATUS_CASES);
    expect(
      GIR_STATUS_CASES.map((c) => ({
        ...c,
        text: text.girStatus(c.maxPerTeam, c.oneBallPerSide, c.savedBy, c.offline),
      })),
    ).toEqual(GIR_STATUS_CASES);
  });

  it('the answers in the row', () => {
    expect(
      SIDE_ANSWER_CASES.map((c) => ({ ...c, text: text.sideAnswer(c.category, c.name, c.distanceM) })),
    ).toEqual(SIDE_ANSWER_CASES);
    expect(
      GIR_ANSWER_CASES.map((c) => ({ ...c, text: text.girAnswer(c.hits, c.balls, c.allMissed) })),
    ).toEqual(GIR_ANSWER_CASES);
  });

  it('the distance', () => {
    expect(DISTANCE_CASES.map((c) => ({ ...c, text: text.formatDistance(c.distanceM) }))).toEqual(DISTANCE_CASES);
  });

  it('«Deg og Marte», the names of a foursomes side', () => {
    expect(NAME_LIST_CASES.map((c) => ({ ...c, text: text.nameList(c.names) }))).toEqual(NAME_LIST_CASES);
  });

  it('what the player is told when a report was not saved, for every code and both groups', () => {
    expect(FAILURE_CASES.map((c) => ({ ...c, text: text.describeFailure(c.failure, c.contest) }))).toEqual(
      FAILURE_CASES,
    );

    // One entry per code, as a record, so a new code in the lib fails `tsc` here until the
    // fixture has it: the cases above must hold every code in a game and in a match.
    const codes: Record<SideClaimFailure, true> = {
      not_authenticated: true,
      not_active: true,
      not_player: true,
      wrong_flight: true,
      no_slot: true,
      bad_distance: true,
      db_error: true,
    };
    expect(FAILURE_CASES.map((c) => `${c.failure} ${c.contest.source}`).sort()).toEqual(
      Object.keys(codes)
        .flatMap((code) => [`${code} game`, `${code} cup`])
        .sort(),
    );
  });
});

describe('the finish page’s «Meldt inn fra flightene» is the fixture’s', () => {
  /** What the box shows, as strings: the heading, then per line its spans (or its text), or the single sentence of an empty box. */
  function readBox(container: HTMLElement, testId: string) {
    const box = container.querySelector(`[data-testid="${testId}"]`) as HTMLElement;
    expect(box, testId).not.toBeNull();
    return {
      heading: box.firstElementChild?.textContent ?? '',
      ariaLabel: box.getAttribute('aria-label') ?? '',
      empty: box.querySelector('p')?.textContent ?? null,
      lines: [...box.querySelectorAll('li')].map((li) => {
        const spans = [...li.querySelectorAll('span')].map((s) => s.textContent ?? '');
        return spans.length > 0 ? spans : [li.textContent ?? ''];
      }),
    };
  }

  const players = [{ user_id: 'jonas', display_name: 'Jonas Berg' }];
  const boxFor = (category: SideContestCategory): ReportedBoxCase => {
    const found = REPORTED_BOX_CASES.find((c) => c.category === category);
    if (!found) throw new Error(`the fixture has no finish box for ${category}`);
    return found;
  };
  const viewOf = (box: ReportedBoxCase): SideSlotView => ({
    hole: box.hole,
    reports: {
      hole: box.hole,
      lines: box.lines.map(({ flightNumber, name, distanceM }) => ({ flightNumber, name, distanceM })),
      missingFlights: box.missing.map((m) => m.flightNumber),
    },
  });

  it('the lines: flight, name or «Ingen på …», distance, and the flights that have not reported', () => {
    const ld = boxFor('longest_drive');
    const ctp = boxFor('closest_to_pin');
    const { container } = render(
      <SideWinnersForm
        gameId="G1"
        ldCount={1}
        ctpCount={1}
        players={players}
        action={() => {}}
        ldSlots={[viewOf(ld)]}
        ctpSlots={[viewOf(ctp)]}
      />,
    );

    for (const [box, testId] of [
      [ld, 'side-reports-ld-1'],
      [ctp, 'side-reports-ctp-1'],
    ] as const) {
      const shown = readBox(container, testId);
      expect(shown.heading).toBe(REPORTED_FIXED.heading);
      expect(shown.ariaLabel).toBe(REPORTED_FIXED.heading);
      // A line with no distance has two spans; the flights that have not reported follow, as one text each.
      expect(shown.lines).toEqual([
        ...box.lines.map((l) => (l.distanceText === null ? [l.flight, l.nameText] : [l.flight, l.nameText, l.distanceText])),
        ...box.missing.map((m) => [m.text]),
      ]);
    }
  });

  it('the empty box and the failed read', () => {
    const failed: SideSlotView = { hole: 9, reports: 'failed' };
    for (const none of REPORTED_NONE_CASES) {
      const empty: SideSlotView = { hole: none.hole, reports: { hole: none.hole, lines: [], missingFlights: [1, 2] } };
      const { container } = render(
        <SideWinnersForm
          gameId="G1"
          ldCount={1}
          ctpCount={1}
          players={players}
          action={() => {}}
          ldSlots={[failed]}
          ctpSlots={[empty]}
        />,
      );
      expect(readBox(container, 'side-reports-ctp-1').empty).toBe(none.text);
      expect(readBox(container, 'side-reports-ld-1').empty).toBe(REPORTED_FIXED.readFailed);
    }
  });

  it('the slot’s label with and without a hole', () => {
    const slotsOf = (category: SideContestCategory) => {
      const cases = SLOT_LABEL_CASES.filter((c) => c.category === category).sort((a, b) => a.position - b.position);
      const views: SideSlotView[] = cases.map((c) =>
        c.hole === null ? { hole: null, reports: null } : { hole: c.hole, reports: { hole: c.hole, lines: [], missingFlights: [] } },
      );
      return { cases, views };
    };
    const ld = slotsOf('longest_drive');
    const ctp = slotsOf('closest_to_pin');
    const { container } = render(
      <SideWinnersForm
        gameId="G1"
        ldCount={ld.cases.length}
        ctpCount={ctp.cases.length}
        players={players}
        action={() => {}}
        ldSlots={ld.views}
        ctpSlots={ctp.views}
      />,
    );
    const labels = [...container.querySelectorAll('label > span')].map((s) => s.textContent ?? '');
    expect(labels).toEqual([...ld.cases, ...ctp.cases].map((c) => c.text));
  });
});
