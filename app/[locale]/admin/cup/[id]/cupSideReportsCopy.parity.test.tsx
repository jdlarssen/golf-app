import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  CUP_GIR_BOX_CASES,
  CUP_REPORTED_FIXED,
  CUP_SLOT_BOX_CASES,
} from '@/lib/cup/cupSideReportsCopyCases';
import { GirReportedBox, SlotReportedBox } from './CupReportedBoxes';

// #2283 (part E) — Type B: the web's «Meldt inn fra kampene» is the app's, character for
// character. The approved text lives in `lib/cup/cupSideReportsCopyCases.ts`, as data: the
// cases and the exact Norwegian output. This suite renders the web's real boxes (the message
// catalog, `cup.sideAwards.reported*` and `cup.matchFallback`, through next-intl) and compares
// what they show with it; the app asserts its own copy against the same file
// (`native/app/src/lib/cupSideReportsCopy.parity.test.ts`). Neither side imports the other, so
// this file loads in the web's CI job, which has no native dependencies installed. A reworded
// message on either side turns that side's suite red.
//
// Norwegian only: the app has no other language. The English catalog is held to the same keys
// by the catalog's own tests.
//
// Each check maps the cases through the web and compares with the fixture, so a failure prints
// the whole case (inputs and expected text), not only the string.

function readBox(container: HTMLElement, testId: string) {
  const box = container.querySelector(`[data-testid="${testId}"]`) as HTMLElement;
  expect(box, testId).not.toBeNull();
  return box;
}

describe('the slot box (closest to pin, longest drive) is the fixture’s', () => {
  /** What the box shows: its heading and label, per line its spans (or its text), or the one sentence of an empty box. */
  function readSlot(container: HTMLElement) {
    const box = readBox(container, 'side-reports-x');
    return {
      heading: box.firstElementChild?.textContent ?? '',
      ariaLabel: box.getAttribute('aria-label') ?? '',
      empty: box.querySelector('p')?.textContent ?? null,
      rows: [...box.querySelectorAll('li')].map((li) => {
        const spans = [...li.querySelectorAll('span')].map((s) => s.textContent ?? '');
        return spans.length > 0 ? spans : [li.textContent ?? ''];
      }),
    };
  }

  it.each(CUP_SLOT_BOX_CASES.map((c) => [c.title, c] as const))('%s', (_title, box) => {
    const { container } = render(<SlotReportedBox id="b" testKey="x" kind={box.kind} reports={box.reports} />);
    const shown = readSlot(container);

    expect(shown.heading).toBe(CUP_REPORTED_FIXED.heading);
    expect(shown.ariaLabel).toBe(CUP_REPORTED_FIXED.heading);
    expect(shown.empty).toBe(box.empty);
    // An answer with no distance has two spans; the matches that have not answered follow, one text each.
    expect(shown.rows).toEqual([
      ...box.lines.map((l) => (l.distance === null ? [l.sender, l.name] : [l.sender, l.name, l.distance])),
      ...box.missing.map((text) => [text]),
    ]);
  });
});

describe('the GIR box (under both counters) is the fixture’s', () => {
  it.each(CUP_GIR_BOX_CASES.map((c) => [c.title, c] as const))('%s', (_title, box) => {
    const { container } = render(
      <GirReportedBox
        id="b"
        testKey="x"
        reports={box.reports}
        team1Name={box.team1Name}
        team2Name={box.team2Name}
      />,
    );
    const shown = readBox(container, 'side-reports-x');

    expect(shown.firstElementChild?.textContent).toBe(CUP_REPORTED_FIXED.heading);
    expect(shown.getAttribute('aria-label')).toBe(CUP_REPORTED_FIXED.heading);

    const teams = [...shown.querySelectorAll('[data-testid^="side-reports-gir-team"]')];
    expect(teams.map((p) => ({ text: p.textContent, over: p.classList.contains('text-warning-text') }))).toEqual(
      box.teams,
    );
    // The other lines (no testid): the one sentence of an empty box, or the matches that have not reported.
    const others = [...shown.querySelectorAll('p:not([data-testid])')].map((p) => p.textContent);
    expect(others).toEqual(box.empty === null ? box.missing : [box.empty]);
  });
});
