// lib/launchRules.ts
// Regler som gjelder appen ved lansering, med ett hjem hver (#2561 PR C). Fila
// ligger i rot-`lib/` fordi både appen (`native/app`, som importerer herfra) og
// serveren (push til appen) leser regelen.
//
// **Kroner.** Eierens svar 13.10 («Eierbeslutning 2026-10-13: veien til
// butikkene» på #1954): «Skjul kronene i appen ved lansering». Poeng i appen,
// kroner på nettet. Når konstanten er `false`:
// - appens resultatskjerm viser ikke pengeoppgjøret (`Leaderboard.tsx`)
// - «Opprett spill» i appen spør ikke om kroner per enhet (`SetupStep.tsx`)
// - push til appen (APNs) sier ikke beløpet i påminnelsen om startkontingent
//   (`lib/notifications/push/sendPush.ts`, `surface: 'app'`).
// Nettsiden viser kronene som før: oppgjøret, feltet i veiviseren, varselet i
// innboksen og web push med beløp, og e-posten.
//
// «Ved lansering» betyr midlertidig, så koden står: `SettlementCard` og visningene
// som tegner det, er urørt og blir nåbare igjen når konstanten snus. Spill som
// alt har `kr_per_unit`, beholder verdien; appen viser den bare ikke.

/** Viser appen kroner? Nei ved lansering (eierens svar 13.10). */
export const SHOW_KRONER_IN_APP = false;
