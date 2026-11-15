// #2283 (part E) — Type B: the app's «Meldt inn fra kampene» is the web's, character for
// character. The approved text lives in `lib/cup/cupSideReportsCopyCases.ts`, as data: the
// cases and the exact Norwegian output. This suite asserts the app's copy (`cupManageCopy.ts`)
// against it; the web renders its real boxes against the same file
// (`app/[locale]/admin/cup/[id]/cupSideReportsCopy.parity.test.tsx`). Neither side imports the
// other, so the web's CI job needs nothing from `native/`. A reworded sentence on either side
// turns that side's suite red.
//
// Each check maps the cases through the app and compares with the fixture, so a failure prints
// the whole case (inputs and expected text), not only the string.
import {
  CUP_GIR_BOX_CASES,
  CUP_REPORTED_FIXED,
  CUP_SLOT_BOX_CASES,
} from '../../../../lib/cup/cupSideReportsCopyCases';
import { SIDE_REPORTED_TEXT, reportedGirBox, reportedSlotBox } from './cupManageCopy';

describe('the box says what the fixture says', () => {
  it('the heading, the empty box and the failed read', () => {
    // `toEqual` on the whole table: a key added to the app's table fails here until the fixture has it.
    expect(SIDE_REPORTED_TEXT).toEqual(CUP_REPORTED_FIXED);
  });

  it.each(CUP_SLOT_BOX_CASES.map((c) => [c.title, c] as const))('closest to pin and longest drive: %s', (_title, box) => {
    const shown = reportedSlotBox(box.kind, box.reports);
    expect({
      lines: shown.lines.map((l) => ({ sender: l.sender, name: l.name, distance: l.distance })),
      missing: shown.missing.map((m) => m.text),
      empty: shown.empty,
    }).toEqual({ lines: box.lines, missing: box.missing, empty: box.empty });
  });

  it.each(CUP_GIR_BOX_CASES.map((c) => [c.title, c] as const))('GIR: %s', (_title, box) => {
    const shown = reportedGirBox(box.reports, box.team1Name, box.team2Name);
    expect({
      teams: shown.teams.map((t) => ({ text: `${t.label}${t.rest}`, over: t.over })),
      missing: shown.missing.map((m) => m.text),
      empty: shown.empty,
    }).toEqual({ teams: box.teams, missing: box.missing, empty: box.empty });
  });
});
