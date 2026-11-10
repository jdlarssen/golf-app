import { playerNameWithNickname } from './playerName';

/** The board style `Ola "Kalle" Nordmann`; its home is `playerNameWithNickname` (#2813). */
export function formatRevealName(name: string, nickname: string | null): string {
  return playerNameWithNickname(name, nickname);
}
