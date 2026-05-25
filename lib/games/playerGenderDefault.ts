export type UserGender = 'mens' | 'ladies' | null;
export type PlayerLevel = 'junior' | 'normal' | 'senior';
export type TeeGenderChoice = 'M' | 'D' | 'J';

/**
 * Maps a user's profile (gender + level) to the M/D/J-toggle default
 * used in the game-wizards tee selection.
 *
 * Rule: `level === 'junior'` overrides gender — junior boys AND girls
 * are routed to a junior tee if the course has one. Senior status does
 * NOT affect the toggle today (reserved for future senior-tee logic).
 */
export function playerGenderDefault(
  gender: UserGender,
  level: PlayerLevel,
): TeeGenderChoice {
  if (level === 'junior') return 'J';
  if (gender === 'ladies') return 'D';
  return 'M';
}
