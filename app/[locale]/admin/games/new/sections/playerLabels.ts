/**
 * How a player is named in the new-game form (#2321): one home for the
 * picker's label («Ola Nordmann «Ola» — HCP 12,0») and the short name on chips,
 * team slots and flight rows. Lifted out of `PlayersSection` and
 * `TeamsAssignmentSection`, which each had their own copy.
 *
 * A pending player (profile not finished) has no name yet: the e-mail when the
 * page has it (admin), otherwise the «Invitert spiller» fallback.
 */

import type { PlayerOption } from '../GameForm';
import { formatHcpDisplay } from '@/lib/handicap/signFormat';
import type { AppLocale } from '@/i18n/routing';

export function playerOptionShortName(p: PlayerOption, pendingLabel: string): string {
  if (p.pending) return p.email ?? pendingLabel;
  // Defensive: a player who is not pending always has a name.
  const displayName = p.name ?? p.email ?? pendingLabel;
  return p.nickname ? `${displayName} «${p.nickname}»` : displayName;
}

export function playerOptionLabel(p: PlayerOption, pendingLabel: string, locale: AppLocale): string {
  if (p.pending) return p.email ?? pendingLabel;
  return `${playerOptionShortName(p, pendingLabel)} — HCP ${formatHcpDisplay(p.hcp_index, locale)}`;
}
