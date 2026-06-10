/**
 * Rene klientside-validatorer for lag-påmeldings-skjemaet (#362).
 *
 * Speiler server-action-ens regler ([teamActions.ts]) slik at kapteinen får
 * inline-feil FØR submit i stedet for den misvisende `team_name_invalid`-
 * feilen serveren returnerer når en slot-e-post mangler `@`. Serveren er
 * fortsatt sannhetskilden — dette er bare tidlig, vennlig feedback.
 *
 * Alle funksjoner er rene: tar input, returnerer feilmelding (norsk) eller
 * `null` når feltet er gyldig. Cross-felt-sjekker (duplikat, kaptein-egen-
 * e-post) ligger i `findSlotConflicts` som ser hele slot-lista samtidig.
 */

export const TEAM_NAME_MIN = 3;
export const TEAM_NAME_MAX = 40;

/** Pragmatisk e-post-form: ett `@`, tegn rundt, og en prikk i domenet. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateTeamName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return 'Skriv inn et lag-navn.';
  if (trimmed.length < TEAM_NAME_MIN)
    return `Lag-navnet må være minst ${TEAM_NAME_MIN} tegn.`;
  if (trimmed.length > TEAM_NAME_MAX)
    return `Lag-navnet kan være maks ${TEAM_NAME_MAX} tegn.`;
  return null;
}

export function validateSlotEmail(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 'Fyll inn e-post til medspilleren.';
  if (!EMAIL_RE.test(trimmed)) return 'Skriv inn en gyldig e-postadresse.';
  return null;
}

/**
 * Cross-felt-sjekker over alle slots samtidig. Returnerer en map fra
 * slot-indeks til feilmelding for slots som kolliderer — duplikat-e-post
 * eller kapteinens egen e-post. Slots uten konflikt (eller tomme) er ikke
 * i map-en.
 *
 * Tar rå (utrimmet) verdier og normaliserer internt (trim + lowercase),
 * samme som server-action-en, så «Ola@x.no» og «ola@x.no» teller som dup.
 */
export function findSlotConflicts(
  values: string[],
  captainEmail: string | null,
): Record<number, string> {
  const normalized = values.map((v) => v.trim().toLowerCase());
  const cap = (captainEmail ?? '').trim().toLowerCase();

  const indicesByEmail = new Map<string, number[]>();
  normalized.forEach((email, i) => {
    if (!email) return;
    const arr = indicesByEmail.get(email) ?? [];
    arr.push(i);
    indicesByEmail.set(email, arr);
  });

  const errors: Record<number, string> = {};
  normalized.forEach((email, i) => {
    if (!email) return;
    if (cap && email === cap) {
      errors[i] = 'Dette er din egen e-post. Du er allerede med som kaptein.';
      return;
    }
    if ((indicesByEmail.get(email)?.length ?? 0) > 1) {
      errors[i] = 'Samme e-post er brukt på flere plasser.';
    }
  });
  return errors;
}
