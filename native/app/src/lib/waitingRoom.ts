// #2219: hva venterommet på spill-hjem sier før runden er startet.
//
// Med tee-off starter runden av seg selv (cron start-scheduled-games, 0094/0146),
// og da sier vi det og teller ned. Uten tee-off er det arrangøren som starter.
// Begge overskriftene er webbens (`game.home.scorecardOpensAtTeeOff` og
// `game.home.scorecardOpensWhenOrganizerStarts`), låst mot `messages/no.json` i
// `waitingRoom.test.ts`. Nedtellingen er den delte `formatCountdown`. Ingen
// `Intl` her (Hermes).
//
// #2204: står runden fast etter tee-off, sier venterommet hvorfor i stedet for
// «Starter snart». `fetchStartBlock` (`data/startBlock.ts`) avgjør sperren.
import { formatCountdown } from '../../../../lib/format/countdown';

export const WAITING_ROOM_TEXT = {
  opensAtTeeOff: 'Scorekortet åpner ved tee-off.',
  opensWhenOrganizerStarts: 'Scorekortet åpner når arrangøren starter kampen.',
  // #2204: webbens `game.home.scorecardOpensWhenFixed` og
  // `game.home.matchWillNotBePlayed`.
  opensWhenFixed: 'Scorekortet åpner når oppsettet er i orden.',
  willNotBePlayed: 'Denne kampen blir ikke spilt.',
} as const;

/**
 * Hvorfor runden ikke starter (#2204). `'structural'`: noe arrangøren må ordne.
 * `'will_not_play'`: en cup-kamp avgjort ved trekk. `null`: ingen sperre kjent.
 */
export type WaitingRoomBlock = 'structural' | 'will_not_play' | null;

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
  block: WaitingRoomBlock = null,
): WaitingRoomView {
  const teeOffMs = teeOffAt == null ? Number.NaN : Date.parse(teeOffAt);
  if (block === 'will_not_play') {
    return {
      headline: WAITING_ROOM_TEXT.willNotBePlayed,
      countdown: null,
      teeOffPassed: !Number.isNaN(teeOffMs) && teeOffMs - nowMs <= 0,
    };
  }
  if (Number.isNaN(teeOffMs)) {
    return {
      headline: WAITING_ROOM_TEXT.opensWhenOrganizerStarts,
      countdown: null,
      teeOffPassed: false,
    };
  }
  const msUntil = teeOffMs - nowMs;
  if (block === 'structural' && msUntil <= 0) {
    return { headline: WAITING_ROOM_TEXT.opensWhenFixed, countdown: null, teeOffPassed: true };
  }
  return {
    headline: WAITING_ROOM_TEXT.opensAtTeeOff,
    countdown: formatCountdown(msUntil),
    teeOffPassed: msUntil <= 0,
  };
}
