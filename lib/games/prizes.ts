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
