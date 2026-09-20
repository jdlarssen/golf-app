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

/**
 * Miljøet åpningstidspunktet leses fra. Bare de to nøklene betyr noe her;
 * indeks-signaturen er der så `process.env` kan sendes inn direkte.
 */
export type KavalkadeEnv = {
  /** ISO-tid som flytter åpningen — kun for staging-verifisering. */
  KAVALKADE_OPEN_AT?: string;
  /** Vercels miljønavn. `'production'` slår av overstyringen. */
  VERCEL_ENV?: string;
  readonly [key: string]: string | undefined;
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

/**
 * 1.12.2026 kl. 00:00 i Oslo = 30.11.2026 kl. 23:00 UTC.
 *
 * Eierens beslutning (kommentar på #2131, 2026-09-16): forsiden teaser
 * Kavalkaden fra 1. desember og fram til den åpner. Datoen står bare her.
 */
export const KAVALKADE_TEASER_START = new Date('2026-11-30T23:00:00Z');

/**
 * 1.2.2027 kl. 00:00 i Oslo = 31.1.2027 kl. 23:00 UTC — **eksklusiv** slutt, så
 * lenken på forsiden står ut hele 31. januar og er borte 1. februar (#1040 K5).
 */
export const KAVALKADE_LINK_END = new Date('2027-01-31T23:00:00Z');

/**
 * Hvor lenge før åpningen teaseren står, og hvor lenge etter lenken står.
 *
 * Vinduene er avledet som avstander fra frysegrensen, ikke som to nye absolutte
 * datoer. Da flytter de seg med `KAVALKADE_OPEN_AT` på staging: setter du
 * åpningen til «om en time», havner du i teaser-vinduet, og setter du den til
 * «for en time siden», havner du i lenke-vinduet. Uten det kunne ingen av de to
 * flatene sees før desember.
 */
const TEASER_LEAD_MS = KAVALKADE_CUTOFF.getTime() - KAVALKADE_TEASER_START.getTime();
const LINK_TRAIL_MS = KAVALKADE_LINK_END.getTime() - KAVALKADE_CUTOFF.getTime();

/** Når teaseren dukker opp på forsiden i dette miljøet. */
export function kavalkadeTeaserStartsAt(env: KavalkadeEnv = process.env): Date {
  return new Date(kavalkadeOpensAt(env).getTime() - TEASER_LEAD_MS);
}

/** Når lenken på forsiden forsvinner igjen (eksklusiv). */
export function kavalkadeLinkEndsAt(env: KavalkadeEnv = process.env): Date {
  return new Date(kavalkadeOpensAt(env).getTime() + LINK_TRAIL_MS);
}

/**
 * Hva forsiden skal vise om Kavalkaden akkurat nå (#2131, K5).
 *
 *  - `'teaser'`: fra 1. desember til åpningen — «Kavalkaden kommer 24. desember».
 *  - `'link'`: fra åpningen til og med 31. januar — en lenke inn i kortstokken.
 *  - `null`: resten av året. Forsiden nevner den ikke.
 *
 * Ren funksjon av `now` og miljøet. Hvem som får se den — spillere med minst én
 * ferdig runde i år — avgjøres av kallstedet, ikke her.
 */
export type KavalkadeHomeSlot = 'teaser' | 'link';

export function kavalkadeHomeSlot(
  now: Date,
  env: KavalkadeEnv = process.env,
): KavalkadeHomeSlot | null {
  const at = now.getTime();
  if (at < kavalkadeTeaserStartsAt(env).getTime()) return null;
  if (!isKavalkadeOpen(now, env)) return 'teaser';
  return at < kavalkadeLinkEndsAt(env).getTime() ? 'link' : null;
}
