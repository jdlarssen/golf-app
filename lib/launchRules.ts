// lib/launchRules.ts
// Regler som gjelder appen ved lansering, med ett hjem hver (#2561 PR C). Fila
// ligger i rot-`lib/` fordi appen (`native/app`, som importerer herfra) leser
// regelen.
//
// **Pengeoppgjøret.** Eierens svar 13.10 («Eierbeslutning 2026-10-13: veien til
// butikkene» på #1954) skjulte alle kroner i appen ved lansering. Eieren snudde
// det delvis 01.11 (#2749): startkontingenten, betalingslenka og premiebordet
// vises i appen, men oppgjøret mellom spillerne holdes skjult. Når konstanten
// er `false`:
// - appens resultatskjerm viser ikke pengeoppgjøret (`Leaderboard.tsx`)
// - «Opprett spill» i appen spør ikke om kroner per enhet (`SetupStep.tsx`)
// Nettsiden viser oppgjøret og feltet i veiviseren som før.
//
// «Ved lansering» betyr midlertidig, så koden står: `SettlementCard` og visningene
// som tegner det, er urørt og blir nåbare igjen når konstanten snus. Spill som
// alt har `kr_per_unit`, beholder verdien; appen viser den bare ikke.

/** Viser appen pengeoppgjøret? Nei ved lansering (eierens svar 13.10, #2749). */
export const SHOW_SETTLEMENT_IN_APP = false;
