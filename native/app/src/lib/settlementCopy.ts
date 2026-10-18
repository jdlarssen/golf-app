// native/app/src/lib/settlementCopy.ts
// Native (#2221): oppgjørskortets norske tekster, speilet fra webbens
// `messages/no.json` → `leaderboard.common.settlement`.
//
// Samme grunn og samme mønster som `sideTournamentCopy.ts`: kildefila er for
// stor til å bundles for 20 strenger, og paritetstesten
// (`settlementCopy.test.ts`) krever tegn-for-tegn likhet med webben.
// Plassholderne (`{kr}`, `{unit}`, `{from}`, `{to}`, `{count}`,
// `{amount}`, `{game}`, `{mode}`) fylles med `fillCopy` fra
// `sideTournamentCopy.ts`.
//
// Kortet i appen bruker `title`, `stake`, `owes`, `empty` og `units`.
// Kvitteringsnøklene fra `formatKicker` og ned (#2296) er nettsidens og står
// her bare som speil for paritetstesten, til kronene vises i appen.
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
  // Kvitteringen (#2296): bare speil til kronene vises i appen, se toppen.
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
