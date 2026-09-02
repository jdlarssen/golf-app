// Native N3 (#1825): de små visnings-hjelperne skjermene deler.
//
// Ingen i18n i appen ennå (N8 eier paritet med webbens no/en) — spike-copyen er
// norsk og bor rett i skjermene. Dette er bare formatering.
import type { ActiveCardState } from '../../../../lib/games/activeCardState';

/** Badge-teksten for et aktivt spill på hjem-kortet. */
export const ACTIVE_CARD_LABELS: Record<ActiveCardState, string> = {
  continue: 'Fortsett',
  submitted: 'Levert',
  pending_approval: 'Til godkjenning',
  withdrawn: 'Trukket',
};

/** Kallenavn hvis det finnes, ellers navn, ellers en rolig plassholder. */
export function displayName(player: {
  name: string | null;
  nickname: string | null;
}): string {
  const nickname = player.nickname?.trim();
  if (nickname) return nickname;
  const name = player.name?.trim();
  if (name) return name;
  return 'Ukjent spiller';
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Tee-off som «30.08. kl. 15:30» i enhetens egen tid.
 *
 * Enheten står i Oslo-tid når spilleren er på banen, så `new Date()` sine
 * lokale gettere er riktig her — i motsetning til på serveren, som kjører UTC
 * og derfor må gå veien om Oslo-hjelperne.
 */
export function formatTeeOff(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}. kl. ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/**
 * Bare klokkeslettet, som «14:05» — til «Sist purret kl. …» (#1889).
 *
 * **Enhetens egne gettere, ikke en Oslo-konvertering.** Webben pinner alt
 * bruker-synlig til `Europe/Oslo` via `Intl.DateTimeFormat`
 * (`lib/format/teeOff.ts`), fordi serveren kjører UTC. Den veien er stengt
 * her: Hermes har ikke ICU-tidssonene, og forsøket på å gjette sone-offset ved
 * å streng-sammenligne `Intl`-utdata lagret en tee-off én time feil på
 * simulatoren (hele historien står i `wizardPayload.ts`, `teeOffInstant`).
 * Appen bruker derfor gjennomgående enhetens lokaltid — samme valg som
 * {@link formatTeeOff}, og riktig for en arrangør som står på banen.
 *
 * Kolon og ikke punktum: begge er korrekt norsk, men {@link formatTeeOff} rett
 * over skriver «kl. 15:30», og to skrivemåter for klokkeslett i samme app er
 * verre for arrangøren enn valget mellom dem. Kontrakten skrev «HH.MM», men ga
 * samtidig formatet som byggerens skjønn — og da veier appens egen form tyngst.
 *
 * @param iso tidsstempel fra basen, eller `null` når det ikke finnes noe.
 * @returns klokkeslettet, eller `null` for både manglende og ulesbar verdi —
 *   kalleren dropper linja i stedet for å vise «Sist purret kl. NaN».
 */
export function formatClock(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
