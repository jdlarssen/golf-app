/**
 * Trekk underveis i en cup — utfallsregelen (#1814). Ren funksjon, zero IO.
 *
 * Eieren valgte Ryder Cup-modellen: **et trekk er et trekk, ikke et bytte**
 * (E1). Ingen erstatter settes inn, og den trukne spillerens ikke-startede
 * kamper spilles ikke. Denne modulen er det ENESTE hjemmet for hva som da
 * skjer med kamppoengene:
 *
 *   E2  Trekk ≥ 30 min før tee-off  → kampen halveres (tie_points til begge).
 *       Trekk < 30 min før tee-off (eller etter) → walkover-tap; motstander-
 *       laget får win_points.
 *   E3  Startede (`active`) og ferdige (`finished`) kamper røres aldri.
 *   E4  I fourball kan makkeren spille alene (én ball mot to) — arrangøren
 *       registrerer valget som `mode_config.withdrawal_play_on`. Foursomes,
 *       greensome, chapman og gruesome deler ball og har ikke valget.
 *
 * Utfallet LAGRES aldri. Kamp-radenes `status` forblir `scheduled`; alt
 * utledes her fra `game_players.withdrawn_at` mot `games.scheduled_tee_off_at`
 * hver gang cup-snapshotet bygges. Det er derfor «angre trekk» bare er å
 * nulle `withdrawn_at` — ingen poeng å rulle tilbake.
 */

/**
 * Grensa mellom «meldte fra i tide» og «meldte fra på oppløpet», i
 * millisekunder. Ett hjem for 30-tallet — copy og tester leser det herfra.
 */
export const WITHDRAWAL_LATE_WINDOW_MS = 30 * 60 * 1000;

/**
 * Fourball er den eneste lag-modusen der én spiller kan fullføre alene: hver
 * spiller har sin egen ball, så «best ball av én» er hens egen ball. De øvrige
 * lag-modusene deler ball mellom partnerne og har ingen meningsfull
 * alene-variant (E4).
 */
const PLAY_ON_CAPABLE_MODE = 'fourball_matchplay';

/**
 * Leser arrangørens «makkeren spiller alene»-valg ut av `games.mode_config`
 * (#1814, D10-presedensen: kamp-spesifikke overstyringer bor der, ingen ny
 * kolonne). Defensiv mot rå JSON — alt annet enn `true` betyr «etter regelen».
 */
export function readWithdrawalPlayOn(modeConfig: unknown): boolean {
  if (!modeConfig || typeof modeConfig !== 'object') return false;
  return (modeConfig as { withdrawal_play_on?: unknown }).withdrawal_play_on === true;
}

/**
 * Har arrangøren TATT valget ennå? Fravær av nøkkelen betyr «ikke bestemt», mens
 * en eksplisitt `false` betyr «etter regelen» — begge gir samme utfall i
 * regelen over, men bare den første skal mase på arrangøren med et
 * venter-banner (#1814, E4). Derfor skriver `setFourballWithdrawalChoice` en
 * eksplisitt `false` i stedet for å slette nøkkelen.
 */
export function hasWithdrawalPlayOnChoice(modeConfig: unknown): boolean {
  if (!modeConfig || typeof modeConfig !== 'object') return false;
  return typeof (modeConfig as { withdrawal_play_on?: unknown }).withdrawal_play_on === 'boolean';
}

/** Én spillerrad i kampen, redusert til det regelen faktisk trenger. */
export type CupWithdrawalPlayer = {
  userId: string;
  /** `game_players.team_number` — rader utenfor {1, 2} hører til ingen side. */
  side: 1 | 2;
  /** `game_players.withdrawn_at`, ISO-streng. `null` = aktiv spiller. */
  withdrawnAt: string | null;
};

export type CupWithdrawalInput = {
  status: 'draft' | 'scheduled' | 'active' | 'finished';
  /** `games.game_mode` — fri tekst fra DB, kun fourball får alene-valget. */
  gameMode: string;
  /** `games.scheduled_tee_off_at`. `null` (eldre cup uten plan) = ingen frist. */
  scheduledTeeOffAt: string | null;
  /** `mode_config.withdrawal_play_on === true` (E4). Fravær/false = etter regelen. */
  playOn: boolean;
  players: readonly CupWithdrawalPlayer[];
};

export type CupMatchWithdrawal = {
  outcome: 'halved' | 'walkover';
  /** Hvem som får poengene: motstandersiden ved walkover, `'tied'` ved halvert. */
  winnerSide: 1 | 2 | 'tied';
  withdrawnSide: 1 | 2 | 'both';
  /** Alle trukne spillere i kampen, i radrekkefølge — driver «{navn} trakk seg». */
  withdrawnUserIds: string[];
  /** True når minst én trukket side meldte fra innenfor 30-minutters-vinduet. */
  late: boolean;
};

/**
 * True når et trekk registrert `withdrawnAt` faller innenfor 30-minutters-
 * vinduet foran `teeOff` (eller etter tee-off). Grensa er «mindre enn»:
 * nøyaktig 30 minutter før er i tide. Uten planlagt tee-off finnes ingen frist
 * å bryte, og trekket er aldri sent.
 */
function isLate(withdrawnAt: string, teeOff: string | null): boolean {
  if (!teeOff) return false;
  const teeOffMs = Date.parse(teeOff);
  const withdrawnMs = Date.parse(withdrawnAt);
  if (Number.isNaN(teeOffMs) || Number.isNaN(withdrawnMs)) return false;
  return withdrawnMs > teeOffMs - WITHDRAWAL_LATE_WINDOW_MS;
}

/**
 * Avgjør om en cup-kamp er avgjort ved trekk, og med hvilket utfall.
 * Returnerer `null` når kampen fortsatt skal spilles.
 */
export function resolveCupMatchWithdrawal(
  input: CupWithdrawalInput,
): CupMatchWithdrawal | null {
  // E3: en startet eller ferdig kamp står som den står — et trekk registrert
  // underveis flagger bare de øvrige, ikke-startede kampene.
  if (input.status === 'active' || input.status === 'finished') return null;

  const sides = [1, 2] as const;
  const withdrawnBySide = sides.map((side) =>
    input.players.filter((p) => p.side === side && p.withdrawnAt != null),
  );
  const activeBySide = sides.map((side) =>
    input.players.filter((p) => p.side === side && p.withdrawnAt == null),
  );

  const withdrawnSides = sides.filter((side) => withdrawnBySide[side - 1].length > 0);
  if (withdrawnSides.length === 0) return null;

  // E4: fourball med arrangørens «makkeren spiller alene»-valg. Kampen spilles
  // så lenge HVER trukket side fortsatt har minst én spiller igjen — trekker
  // begge på samme side seg, er det ingen ball igjen å slå og kampen avgjøres
  // uansett flagg.
  if (
    input.playOn &&
    input.gameMode === PLAY_ON_CAPABLE_MODE &&
    withdrawnSides.every((side) => activeBySide[side - 1].length > 0)
  ) {
    return null;
  }

  const withdrawnUserIds = input.players
    .filter((p) => p.withdrawnAt != null && (p.side === 1 || p.side === 2))
    .map((p) => p.userId);

  const lateBySide = sides.map((side) =>
    withdrawnBySide[side - 1].some((p) => isLate(p.withdrawnAt as string, input.scheduledTeeOffAt)),
  );
  const late = withdrawnSides.some((side) => lateBySide[side - 1]);

  // Begge sider trukket → alltid halvert. Ingen av lagene stilte opp, så ingen
  // skal få gratis poeng — heller ikke om den ene meldte fra senere enn den
  // andre.
  if (withdrawnSides.length === 2) {
    return {
      outcome: 'halved',
      winnerSide: 'tied',
      withdrawnSide: 'both',
      withdrawnUserIds,
      late,
    };
  }

  const withdrawnSide = withdrawnSides[0];
  if (!lateBySide[withdrawnSide - 1]) {
    return {
      outcome: 'halved',
      winnerSide: 'tied',
      withdrawnSide,
      withdrawnUserIds,
      late: false,
    };
  }

  return {
    outcome: 'walkover',
    winnerSide: withdrawnSide === 1 ? 2 : 1,
    withdrawnSide,
    withdrawnUserIds,
    late: true,
  };
}
