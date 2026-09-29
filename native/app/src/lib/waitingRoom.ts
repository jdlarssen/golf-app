// #2219: hva venterommet på spill-hjem sier før runden er startet.
//
// Med tee-off starter runden av seg selv (cron start-scheduled-games, 0094/0146),
// og da sier vi det og teller ned. Uten tee-off er det arrangøren som starter.
// Begge overskriftene er webbens (`game.home.scorecardOpensAtTeeOff` og
// `game.home.scorecardOpensWhenOrganizerStarts`), låst mot `messages/no.json` i
// `waitingRoom.test.ts`. Nedtellingen er den delte `formatCountdown`. Ingen
// `Intl` her (Hermes).
import { formatCountdown } from '../../../../lib/format/countdown';

export const WAITING_ROOM_TEXT = {
  opensAtTeeOff: 'Scorekortet åpner ved tee-off.',
  opensWhenOrganizerStarts: 'Scorekortet åpner når arrangøren starter kampen.',
} as const;

export interface WaitingRoomView {
  headline: string;
  /** «Starter om 12 min» / «Starter snart». `null` uten gyldig tee-off. */
  countdown: string | null;
  /**
   * Tee-off er nådd, men bundelen sier fortsatt «planlagt». Venterommet
   * henter da spillet på nytt ved hvert tikk, i tilfelle realtime ligger nede.
   */
  teeOffPassed: boolean;
}

export function waitingRoomView(
  teeOffAt: string | null,
  nowMs: number,
): WaitingRoomView {
  const teeOffMs = teeOffAt == null ? Number.NaN : Date.parse(teeOffAt);
  if (Number.isNaN(teeOffMs)) {
    return {
      headline: WAITING_ROOM_TEXT.opensWhenOrganizerStarts,
      countdown: null,
      teeOffPassed: false,
    };
  }
  const msUntil = teeOffMs - nowMs;
  return {
    headline: WAITING_ROOM_TEXT.opensAtTeeOff,
    countdown: formatCountdown(msUntil),
    teeOffPassed: msUntil <= 0,
  };
}
