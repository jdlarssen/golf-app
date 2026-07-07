import { z } from 'zod';

/**
 * #1051 (Penger i potten, del 2): premiebord + sponsor.
 *
 * Valideringens hjem for `games.prizes` (jsonb-kolonne, migrasjon 0136). Et
 * premiebord er en bounded liste av slott: 1.–3. plass + inntil 2 LD + 2 CTP.
 * Hvert slott bærer en premie-beskrivelse og en valgfri sponsor (tekst).
 *
 * Regel-én-hjem (trap #4): taket PRIZE_MAX_SLOTS speiler DB-CHECK-en i
 * 0136_game_prizes.sql (`jsonb_array_length(prizes) <= 7`), og prizes.test.ts
 * asserterer at de er enige. Posisjon-grensene per kategori speiler wizardens
 * slott-emisjon (faste slott, ingen add/remove-rader).
 */

export const PRIZE_CATEGORIES = [
  'placement',
  'longest_drive',
  'closest_to_pin',
] as const;
export type PrizeCategory = (typeof PRIZE_CATEGORIES)[number];

/** Maks antall premie-slott. MÅ speile DB-CHECK i 0136 (3 plasseringer + 2 LD
 *  + 2 CTP). Agreement asserteres i prizes.test.ts. */
export const PRIZE_MAX_SLOTS = 7;

/** Posisjon-grenser per kategori (speiler side-counts + podiets tre trinn). */
export const PLACEMENT_MAX_POSITION = 3; // 1., 2., 3. plass
export const SIDE_MAX_POSITION = 2; // LD1/LD2, CTP1/CTP2

/** Tegn-grenser for brukerdata (premie-beskrivelse + sponsornavn). */
export const PRIZE_DESCRIPTION_MAX = 120;
export const PRIZE_SPONSOR_MAX = 60;

export type GamePrize = {
  category: PrizeCategory;
  /** placement: 1–3; longest_drive/closest_to_pin: 1–2. */
  position: number;
  /** Premien, fritekst 1–120 tegn. Vises verbatim (React-escaping). */
  description: string;
  /** Sponsornavn ≤60 tegn, eller null når slottet ikke har sponsor. */
  sponsor: string | null;
};

const prizeSchema = z
  .object({
    category: z.enum(PRIZE_CATEGORIES),
    position: z.number().int().positive(),
    description: z.string().trim().min(1).max(PRIZE_DESCRIPTION_MAX),
    sponsor: z.string().trim().min(1).max(PRIZE_SPONSOR_MAX).nullable(),
  })
  .refine(
    (p) =>
      p.category === 'placement'
        ? p.position <= PLACEMENT_MAX_POSITION
        : p.position <= SIDE_MAX_POSITION,
    { message: 'position out of range for category' },
  );

const prizesArraySchema = z
  .array(prizeSchema)
  .max(PRIZE_MAX_SLOTS)
  .refine(
    (arr) => {
      const keys = arr.map((p) => `${p.category}:${p.position}`);
      return new Set(keys).size === keys.length;
    },
    { message: 'duplicate (category, position) slot' },
  );

/**
 * Strikt parse — kaster på ugyldig input. Brukes på skrivestien (wizard →
 * INSERT/UPDATE) der ugyldige slott aldri skal nå DB-en.
 */
export function parsePrizes(raw: unknown): GamePrize[] {
  return prizesArraySchema.parse(raw);
}

/**
 * Defensiv parse — returnerer [] på ugyldig input. Brukes på lese-/visningsstien
 * (spill-hjem, leaderboard, spectate, embed, signup) så en malformert prizes-blob
 * aldri krasjer en flate. DB-CHECK + Zod-på-skriv garanterer at data er gyldig,
 * så dette er kun en robusthets-backstop.
 */
export function safeParsePrizes(raw: unknown): GamePrize[] {
  const res = prizesArraySchema.safeParse(raw);
  return res.success ? res.data : [];
}

export type PrizeGameShape = {
  /** false for matchplay-familien (intet podium → ingen plasseringspremier). */
  hasPodium: boolean;
  /** Aktivt antall LD-slott (games.side_ld_count, 0–2). */
  ldCount: number;
  /** Aktivt antall CTP-slott (games.side_ctp_count, 0–2). */
  ctpCount: number;
};

/**
 * Beskjær premier til gyldige slott for valgt modus + side-counts. Dropper
 * plasseringspremier når podium mangler (matchplay), og LD/CTP-premier over
 * aktivt slott-antall (arrangøren senket en count, eller byttet format i edit).
 * Regelen bor her — ett hjem — så DB-en aldri får foreldreløse premier.
 */
export function prunePrizes(
  prizes: GamePrize[],
  shape: PrizeGameShape,
): GamePrize[] {
  return prizes.filter((p) => {
    if (p.category === 'placement') {
      return (
        shape.hasPodium &&
        p.position >= 1 &&
        p.position <= PLACEMENT_MAX_POSITION
      );
    }
    if (p.category === 'longest_drive') {
      return p.position >= 1 && p.position <= shape.ldCount;
    }
    return p.position >= 1 && p.position <= shape.ctpCount;
  });
}

// ── Wizard-slott-katalog (delt: state ↔ hidden inputs ↔ payload-parsing) ───────

export type PrizeSlotKey =
  | 'placement_1'
  | 'placement_2'
  | 'placement_3'
  | 'ld_1'
  | 'ld_2'
  | 'ctp_1'
  | 'ctp_2';

export type PrizeSlot = {
  key: PrizeSlotKey;
  category: PrizeCategory;
  position: number;
};

/** De faste premie-slottene, i visnings-/serialiserings-rekkefølge. Én kilde
 *  for wizard-rendering, hidden-input-navn og payload-parsing (ingen dynamisk
 *  indeksering — faste slott, jf. bruker-vedtak). */
export const PRIZE_SLOTS: readonly PrizeSlot[] = [
  { key: 'placement_1', category: 'placement', position: 1 },
  { key: 'placement_2', category: 'placement', position: 2 },
  { key: 'placement_3', category: 'placement', position: 3 },
  { key: 'ld_1', category: 'longest_drive', position: 1 },
  { key: 'ld_2', category: 'longest_drive', position: 2 },
  { key: 'ctp_1', category: 'closest_to_pin', position: 1 },
  { key: 'ctp_2', category: 'closest_to_pin', position: 2 },
] as const;

/** Hidden-input-/form-felt-navn for et slott. Delt mellom GameWizard (skriver)
 *  og gamePayload (leser) så navnesettet aldri drifter. */
export function prizeFieldName(
  key: PrizeSlotKey,
  field: 'desc' | 'sponsor',
): string {
  return `prize_${key}_${field}`;
}

/** Wizard-utkast: rå fritekst per slott (tomt premie-felt = slottet av). */
export type PrizeDraft = Record<
  PrizeSlotKey,
  { description: string; sponsor: string }
>;

export function emptyPrizeDraft(): PrizeDraft {
  return PRIZE_SLOTS.reduce((acc, s) => {
    acc[s.key] = { description: '', sponsor: '' };
    return acc;
  }, {} as PrizeDraft);
}

/** Fyll et utkast fra en lagret premie-liste (edit-prefill). */
export function prizeDraftFromList(
  prizes: readonly GamePrize[] | undefined,
): PrizeDraft {
  const draft = emptyPrizeDraft();
  for (const p of prizes ?? []) {
    const slot = PRIZE_SLOTS.find(
      (s) => s.category === p.category && s.position === p.position,
    );
    if (slot) {
      draft[slot.key] = { description: p.description, sponsor: p.sponsor ?? '' };
    }
  }
  return draft;
}
