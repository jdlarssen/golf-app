/**
 * Kaptein-uttakets validering (#1884) — ren logikk, ingen I/O.
 *
 * Kapteinen leverer en ORDNET liste med plasser. Slot 1 møter slot 1, slot 2
 * møter slot 2, og så videre. Det finnes altså ingen paringslogikk å teste
 * her: rekkefølgen kapteinen sender inn ER paringen, og denne modulen sier
 * bare om lista er gyldig og hvordan den ser ut som rader.
 *
 * Feilkodene følger `CupPlanError`-mønsteret: maskinlesbare strenger som
 * uttaks-flatene slår opp i i18n-katalogen, aldri norsk prosa i logikk-laget.
 */

import type { CupSessionFormat } from './cupTemplates';

/** Ett seter-antall per plass: singel spiller én mot én, resten to mot to. */
export function seatsPerSlot(format: CupSessionFormat): 1 | 2 {
  return format === 'singles_matchplay' ? 1 : 2;
}

/** Én plass slik kapteinens skjema sender den. */
export type LineupSlotInput = {
  /** 0-basert plass i økta. */
  slotIndex: number;
  /** Spillerne i setene, i seter-rekkefølge. */
  userIds: string[];
};

/** Én lagret rad i `cup_lineup_slots` (uten session/team, som kalleren eier). */
export type LineupSlotRow = {
  slotIndex: number;
  seat: 1 | 2;
  userId: string;
};

export type LineupValidationError =
  /** En plass eller et sete står tomt — uttaket kan ikke leveres. */
  | 'lineup_incomplete'
  /** Samme spiller står i to seter i samme økt. */
  | 'lineup_duplicate_player'
  /** En spiller hører ikke til kapteinens eget lag. */
  | 'lineup_not_in_squad'
  /** Feil antall seter, ukjent plass-nummer eller samme plass to ganger. */
  | 'lineup_slot_shape'
  /** Laget har rett og slett ikke nok spillere til å fylle økta. */
  | 'lineup_squad_too_small';

export type LineupValidationResult =
  | { ok: true; slots: LineupSlotRow[] }
  | { ok: false; error: LineupValidationError };

/**
 * Validerer ett lags uttak for én økt og returnerer radene som skal lagres.
 *
 * Rekkefølgen på sjekkene er valgt så kapteinen får den mest handlingsbare
 * feilen først: «laget ditt er for lite» før «du har brukt samme spiller
 * to ganger», siden det andre da er en uunngåelig følge av det første.
 *
 * `lineup_not_in_squad` dekker BÅDE en spiller fra motstanderlaget og en som
 * ikke er i cupen i det hele tatt — for kapteinen er begge samme feil, og å
 * skille dem ville lekket hvem som står på motstanderens liste.
 */
export function validateLineupSubmission(input: {
  format: CupSessionFormat;
  slotCount: number;
  /** Kapteinens egen stall: deltakere med varig lag på hennes lag. */
  squadUserIds: string[];
  slots: LineupSlotInput[];
}): LineupValidationResult {
  const { format, slotCount, squadUserIds, slots } = input;
  const seats = seatsPerSlot(format);

  if (squadUserIds.length < slotCount * seats) {
    return { ok: false, error: 'lineup_squad_too_small' };
  }

  // Formen først: et plass-nummer utenfor økta eller en dobbel plass er en
  // manipulert payload, ikke en kaptein som har glemt noen.
  const seenIndexes = new Set<number>();
  for (const slot of slots) {
    if (
      !Number.isInteger(slot.slotIndex) ||
      slot.slotIndex < 0 ||
      slot.slotIndex >= slotCount ||
      seenIndexes.has(slot.slotIndex) ||
      slot.userIds.length > seats
    ) {
      return { ok: false, error: 'lineup_slot_shape' };
    }
    seenIndexes.add(slot.slotIndex);
  }

  if (seenIndexes.size !== slotCount) {
    return { ok: false, error: 'lineup_incomplete' };
  }

  const squad = new Set(squadUserIds);
  const used = new Set<string>();
  const rows: LineupSlotRow[] = [];

  for (const slot of [...slots].sort((a, b) => a.slotIndex - b.slotIndex)) {
    if (slot.userIds.length !== seats) {
      return { ok: false, error: 'lineup_incomplete' };
    }
    for (let i = 0; i < seats; i++) {
      const userId = slot.userIds[i]?.trim();
      if (!userId) return { ok: false, error: 'lineup_incomplete' };
      if (used.has(userId)) {
        return { ok: false, error: 'lineup_duplicate_player' };
      }
      if (!squad.has(userId)) {
        return { ok: false, error: 'lineup_not_in_squad' };
      }
      used.add(userId);
      rows.push({ slotIndex: slot.slotIndex, seat: (i + 1) as 1 | 2, userId });
    }
  }

  return { ok: true, slots: rows };
}

/** Én match slik avdekkingen skal opprette den: lag 1s plass mot lag 2s. */
export type LineupPair = {
  slotIndex: number;
  side1: string[];
  side2: string[];
};

/**
 * Setter de to lagrede uttakene mot hverandre — avdekkings-øyeblikket.
 *
 * Radene kommer fra databasen og har ingen garantert rekkefølge, så både
 * plass og sete sorteres her i stedet for å stole på lese-rekkefølgen: en
 * feil sortering ville byttet om på hvem som spiller mot hvem, uten at noe
 * feilet synlig.
 */
export function planLineupPairs(input: {
  slotCount: number;
  team1: LineupSlotRow[];
  team2: LineupSlotRow[];
}): LineupPair[] {
  const side = (rows: LineupSlotRow[], slotIndex: number): string[] =>
    rows
      .filter((r) => r.slotIndex === slotIndex)
      .sort((a, b) => a.seat - b.seat)
      .map((r) => r.userId);

  return Array.from({ length: input.slotCount }, (_, slotIndex) => ({
    slotIndex,
    side1: side(input.team1, slotIndex),
    side2: side(input.team2, slotIndex),
  }));
}
