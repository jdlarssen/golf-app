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
