// native/app/src/lib/formatSetupCopy.ts
// #2753 D3: oppsettet for formatene appen fikk i D3, med nettets ord
// (`wizard.sections.*` i `messages/no.json`). Paritetstesten ved siden av låser
// dem tegn for tegn.

/** `wizard.sections.patsome`. */
export const PATSOME_TEXT = {
  legend: 'Patsome-oppsett',
  segments: [
    {
      holes: 'Hull 1–6',
      format: '4BBB.',
      body: 'Begge spiller sin egen ball, og lagets beste stableford-poeng per hull teller.',
    },
    {
      holes: 'Hull 7–12',
      format: 'Greensome.',
      body: 'Begge slår ut, dere velger det beste utslaget, og så slår dere annethvert slag.',
    },
    {
      holes: 'Hull 13–18',
      format: 'Foursomes.',
      body: 'Dere deler én ball og slår annethvert slag, også fra tee.',
    },
  ],
  handicapNote:
    'Netto bruker riktige handicap per segment: full handicap i 4BBB, 60/40 i greensome og 50 % av summen i foursomes.',
  scoringFrom: 'Poeng fra',
  net: 'Netto',
  gross: 'Brutto',
} as const;
