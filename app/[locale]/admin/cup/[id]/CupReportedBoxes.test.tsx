import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CUP_GIR_BOX_CASES,
  CUP_REPORTED_FIXED,
  CUP_SLOT_BOX_CASES,
} from '@/lib/cup/cupSideReportsCopyCases';
import { girBoxView, slotBoxView } from '@/lib/cup/cupSideReports';
import { GirReportedBox, SlotReportedBox } from './CupReportedBoxes';

// #2283 (part E) — Type B. What a box shows is decided once, by `slotBoxView` and `girBoxView` in
// `lib/cup/cupSideReports.ts` (their rules are tested there). The wording is held to the shared
// fixture in `cupSideReportsCopy.parity.test.tsx`. This file proves the connection: the web's boxes
// ask the shared functions and render the answer, so a rule cannot grow back in this file. The real
// functions are wrapped, as `endGamePlan.test.ts` does in the app; every other test goes through them.
vi.mock('@/lib/cup/cupSideReports', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/cup/cupSideReports')>();
  return { ...actual, slotBoxView: vi.fn(actual.slotBoxView), girBoxView: vi.fn(actual.girBoxView) };
});

const SLOT_WITH_LINES = CUP_SLOT_BOX_CASES.find((c) => c.title === 'one answer, one match that has not answered')!;
const GIR_REPORTED = CUP_GIR_BOX_CASES.find((c) => c.empty === null)!;

beforeEach(() => {
  vi.mocked(slotBoxView).mockClear();
  vi.mocked(girBoxView).mockClear();
});

describe('SlotReportedBox renders the shared view', () => {
  it('asks slotBoxView with the reports it was given', () => {
    render(<SlotReportedBox id="b" testKey="x" kind={SLOT_WITH_LINES.kind} reports={SLOT_WITH_LINES.reports} />);
    expect(slotBoxView).toHaveBeenCalledWith(SLOT_WITH_LINES.reports);
  });

  it('shows the one sentence when the view is «none», however many lines the report holds', () => {
    vi.mocked(slotBoxView).mockReturnValueOnce({ kind: 'none' });
    const { container } = render(
      <SlotReportedBox id="b" testKey="x" kind={SLOT_WITH_LINES.kind} reports={SLOT_WITH_LINES.reports} />,
    );
    expect(container.querySelector('li')).toBeNull();
    expect(container.querySelector('p')?.textContent).toBe(CUP_REPORTED_FIXED.none);
  });

  it('names exactly the matches the view carries: it has no rule of its own for «missing»', () => {
    // A report with no lines, and a view that nevertheless lists a missing match.
    vi.mocked(slotBoxView).mockReturnValueOnce({
      kind: 'lines',
      lines: [],
      missing: [{ gameId: 'g9', matchLabel: 'Four-ball 9' }],
    });
    const { container } = render(
      <SlotReportedBox
        id="b"
        testKey="x"
        kind="ctp"
        reports={{ kind: 'ctp', holeNumber: 3, lines: [], missing: [] }}
      />,
    );
    expect([...container.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['Four-ball 9 har ikke meldt inn']);
  });
});

describe('GirReportedBox renders the shared view', () => {
  const props = { id: 'b', testKey: 'x', team1Name: GIR_REPORTED.team1Name, team2Name: GIR_REPORTED.team2Name };

  it('asks girBoxView with the reports it was given', () => {
    render(<GirReportedBox {...props} reports={GIR_REPORTED.reports} />);
    expect(girBoxView).toHaveBeenCalledWith(GIR_REPORTED.reports);
  });

  it('shows the one sentence when the view is «none», however many matches the report says reported', () => {
    vi.mocked(girBoxView).mockReturnValueOnce({ kind: 'none' });
    const { container } = render(<GirReportedBox {...props} reports={GIR_REPORTED.reports} />);
    expect(container.querySelector('[data-testid^="side-reports-team"]')).toBeNull();
    expect(container.querySelector('p')?.textContent).toBe(CUP_REPORTED_FIXED.none);
  });

  it('names exactly the matches the view carries: it has no rule of its own for «missing»', () => {
    if (GIR_REPORTED.reports === 'failed') throw new Error('fixture case is a failed read');
    vi.mocked(girBoxView).mockReturnValueOnce({
      kind: 'teams',
      team1: GIR_REPORTED.reports.team1,
      team2: GIR_REPORTED.reports.team2,
      maxPerTeam: GIR_REPORTED.reports.maxPerTeam,
      missing: [{ gameId: 'g9', matchLabel: 'Four-ball 9' }],
    });
    const { container } = render(
      <GirReportedBox {...props} reports={{ ...GIR_REPORTED.reports, missing: [] }} />,
    );
    expect([...container.querySelectorAll('p:not([data-testid])')].map((p) => p.textContent)).toEqual([
      'Four-ball 9 har ikke meldt inn',
    ]);
  });
});
