// native/app/src/lib/settlementCopy.ts
// Native (#2221): oppgjørskortets norske tekster, speilet fra webbens
// `messages/no.json` → `leaderboard.common.settlement`.
//
// Samme grunn og samme mønster som `sideTournamentCopy.ts`: kildefila er for
// stor til å bundles for fem strenger, og paritetstesten
// (`settlementCopy.test.ts`) krever tegn-for-tegn likhet med webben.
// Plassholderne (`{kr}`, `{unit}`, `{from}`, `{to}`) fylles med `fillCopy`
// fra `sideTournamentCopy.ts`.
//
// Ingen av strengene er skrevet for hånd.
export const SETTLEMENT_TEXT = {
  title: 'Oppgjør',
  stake: '{kr} kr per {unit}',
  owes: '{from} → {to}',
  empty: 'Ingen penger skifter hender.',
  units: {
    skin: 'skin',
    poeng: 'poeng',
    seksjon: 'seksjon',
  },
  // Nettsidens kvittering (#2296). Appen viser ikke kroner ved lansering, så
  // kortet bruker ikke disse tekstene ennå. De står her for paritetstesten.
  formatKicker: '{game} · {mode}',
  titleFinal: 'Oppgjøret',
  titleSoFar: 'Oppgjøret så langt',
  stakeLine: '{kr} kr per {unit} · {count} spillere',
  receiptKicker: 'Kvittering',
  receiptTitle: 'Hvem betaler hvem',
  totalHeading: 'Sluttsum',
  paymentSentence: '{from} betaler {to} {amount}',
  copyHeading: 'Oppgjør: {game} ({mode})',
  copyButton: 'Kopier til gruppechatten',
  copied: 'Kopiert!',
  copyFailed: 'Klarte ikke å kopiere. Prøv igjen.',
  disclaimer: 'Tørny holder ikke på pengene. Dere gjør opp selv.',
} as const;
