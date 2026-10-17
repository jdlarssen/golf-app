// native/app/src/lib/launchRules.ts
// Regler som gjelder appen ved lansering, med ett hjem hver (#2561 PR C).
//
// **Kroner.** Eierens svar 13.10 («Eierbeslutning 2026-10-13: veien til
// butikkene» på #1954): «Skjul kronene i appen ved lansering». Poeng i appen,
// kroner på nettet: pengeoppgjøret på resultatskjermen og feltet «Kroner per …»
// i «Opprett spill» vises ikke, og beløpet i varselet om startkontingent er
// borte fra push til iPhone (`lib/notifications/cardContent.ts`, `surface:
// 'app'`). Nettsiden viser kronene som før: oppgjøret, feltet i veiviseren og
// varselet med beløp.
//
// «Ved lansering» betyr midlertidig, så koden står: `SettlementCard` og visningene
// som tegner det, er urørt og blir nåbare igjen når konstanten snus. Spill som
// alt har `kr_per_unit`, beholder verdien; appen viser den bare ikke.

/** Viser appen kroner? Nei ved lansering (eierens svar 13.10). */
export const SHOW_KRONER_IN_APP = false;
