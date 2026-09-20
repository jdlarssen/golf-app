/**
 * Kavalkadens dato — året, frysegrensen og når siden åpner (#2127, epic #1040).
 *
 * Datoen har ett hjem. Eieren bestemte 2026-09-16 at Kavalkaden blir offentlig for
 * alle **24. desember 2026**, og at innholdet tar med runder fram til **midnatt
 * Oslo-tid natt til 24. desember** og fryses der. De to tallene er det samme
 * instantet, og de står bare her — en kopi i en side, en jobb eller en spørring er
 * felle 4 (`docs/bug-prevention.md`).
 *
 * Samme instant brukes to steder:
 *  - som **frysegrense for data**: bare runder avsluttet før det teller med, og
 *  - som **åpningstidspunkt**: før det er siden skjult.
 *
 * Fordi siden er skjult til frysegrensen, er dataene allerede endelige første gang
 * en kavalkade bygges. Da trengs verken fingeravtrykk eller regenerering (K2).
 *
 * Ren og I/O-fri bortsett fra `process.env`-defaulten, som kallstedet kan sende inn
 * selv (Type A, jf. `lib/scoring/AGENTS.md`).
 */

/** Året Kavalkaden forteller om. Én konstant — 2027 er ikke automatisert (#1040). */
export const KAVALKADE_YEAR = 2026;

/**
 * 24.12.2026 kl. 00:00 i Oslo = 23.12.2026 kl. 23:00 UTC (vintertid, UTC+1).
 *
 * Skrevet som et absolutt instant, ikke som en lokal dato: Vercel kjører UTC, og en
 * `new Date(2026, 11, 24)` ville åpnet Kavalkaden en time for tidlig (#648). Testen
 * holder vakt ved å lese den tilbake med `osloParts`.
 *
 * Objektet deles av alle kallsteder — les det, muter det aldri. Helperne under
 * returnerer kopier.
 */
export const KAVALKADE_CUTOFF = new Date('2026-12-23T23:00:00Z');

/** Miljøet åpningstidspunktet leses fra. Bare de to nøklene betyr noe her. */
export type KavalkadeEnv = {
  /** ISO-tid som flytter åpningen — kun for staging-verifisering. */
  KAVALKADE_OPEN_AT?: string;
  /** Vercels miljønavn. `'production'` slår av overstyringen. */
  VERCEL_ENV?: string;
};

/**
 * Når Kavalkaden åpner i dette miljøet.
 *
 * Normalt frysegrensen. `KAVALKADE_OPEN_AT` kan flytte åpningen så staging kan se
 * siden før jul — men den **ignoreres i production**, slik at en glemt eller feilsatt
 * miljøvariabel aldri kan avsløre Kavalkaden for ekte spillere før 24. desember.
 * En uleselig verdi faller tilbake til frysegrensen (fail-closed).
 *
 * Merk: overstyringen flytter bare åpningen. Frysegrensen for data er alltid
 * `KAVALKADE_CUTOFF`, så staging og prod forteller om samme runder.
 */
export function kavalkadeOpensAt(env: KavalkadeEnv = process.env): Date {
  if (env.VERCEL_ENV === 'production') return new Date(KAVALKADE_CUTOFF);
  const override = env.KAVALKADE_OPEN_AT;
  if (!override) return new Date(KAVALKADE_CUTOFF);
  const parsed = new Date(override);
  return Number.isNaN(parsed.getTime())
    ? new Date(KAVALKADE_CUTOFF)
    : parsed;
}

/** Er Kavalkaden åpen nå? Sann fra og med åpningstidspunktet. */
export function isKavalkadeOpen(
  now: Date,
  env: KavalkadeEnv = process.env,
): boolean {
  return now.getTime() >= kavalkadeOpensAt(env).getTime();
}
