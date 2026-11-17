// #2460 «Gjenta hver uke»: the switch's words, as data. One fixture, two suites, the way
// #2283 does it (`sideContestCopyCases.ts`).
//
// The web has the text in the message catalog (`wizard.ready.repeat.*`) so the English
// catalog can follow; the app has it in `native/app/src/lib/repeatWeeklyCopy.ts`. Both sides
// assert the SAME cases and the SAME Norwegian text:
//
//   web: `app/[locale]/admin/games/new/sections/RepeatWeeklyCard.test.tsx`
//   app: `native/app/src/lib/repeatWeeklyCopy.parity.test.ts`
//
// Neither suite imports the other side: the web's CI job has no native dependencies
// installed. A reworded sentence on either side turns that side's suite red; changing the
// wording on purpose means editing the text here and in both copies.
//
// Data only: inputs and the exact expected output, hard-coded. The input is the tee-off as an
// Oslo wall clock (`YYYY-MM-DDTHH:mm`, the web's field), or `''` for no tee-off yet. The app
// turns it into its own ISO instant with `parseOsloDateTimeLocal` before asking its copy.

export const REPEAT_FIXED = {
  /** The section heading above the switch. */
  kicker: 'Gjenta',
  title: 'Gjenta hver uke',
} as const;

export type RepeatNextCase = { scheduledTeeOff: string; text: string };

export const REPEAT_NEXT_CASES: readonly RepeatNextCase[] = [
  {
    // The artboard's own example.
    scheduledTeeOff: '2026-10-03T09:00',
    text: 'Neste: lørdag 10. okt kl. 09:00. Samme gjeng får invitasjon når denne runden er ferdig.',
  },
  {
    // Across the new year.
    scheduledTeeOff: '2026-12-28T18:30',
    text: 'Neste: mandag 4. jan kl. 18:30. Samme gjeng får invitasjon når denne runden er ferdig.',
  },
  {
    // Summer time ends in between; the time stays.
    scheduledTeeOff: '2026-10-24T09:00',
    text: 'Neste: lørdag 31. okt kl. 09:00. Samme gjeng får invitasjon når denne runden er ferdig.',
  },
  {
    scheduledTeeOff: '',
    text: 'Neste: samme dag og tid uka etter. Samme gjeng får invitasjon når denne runden er ferdig.',
  },
];
