// #2219: venterommet på spill-hjem i appen (Type A).
//
// Webben sier «Scorekortet åpner ved tee-off.» og teller ned, eller
// «Scorekortet åpner når arrangøren starter kampen.» når ingen tee-off er satt.
// Appen sa det siste også når tee-off var satt, og da starter runden av seg
// selv. Begge overskriftene hentes fra `messages/no.json` og sammenlignes tegn
// for tegn, som i `loginCopy.test.ts`.
import source from '../../../../messages/no.json';
import { WAITING_ROOM_TEXT, waitingRoomView } from './waitingRoom';

const NOW = Date.parse('2026-09-29T08:00:00.000Z');
const MINUTE = 60_000;

describe('waitingRoomView', () => {
  it.each<[string, string | null, ReturnType<typeof waitingRoomView>]>([
    [
      'uten tee-off',
      null,
      {
        headline: WAITING_ROOM_TEXT.opensWhenOrganizerStarts,
        countdown: null,
        teeOffPassed: false,
      },
    ],
    [
      'tee-off om 12 min',
      new Date(NOW + 12 * MINUTE).toISOString(),
      {
        headline: WAITING_ROOM_TEXT.opensAtTeeOff,
        countdown: 'Starter om 12 min',
        teeOffPassed: false,
      },
    ],
    [
      'tee-off akkurat nå',
      new Date(NOW).toISOString(),
      {
        headline: WAITING_ROOM_TEXT.opensAtTeeOff,
        countdown: 'Starter snart',
        teeOffPassed: true,
      },
    ],
    [
      'tee-off passert',
      new Date(NOW - 5 * MINUTE).toISOString(),
      {
        headline: WAITING_ROOM_TEXT.opensAtTeeOff,
        countdown: 'Starter snart',
        teeOffPassed: true,
      },
    ],
    [
      'tee-off med tidssone-offset leses som samme øyeblikk',
      '2026-09-29T10:12:00+02:00',
      {
        headline: WAITING_ROOM_TEXT.opensAtTeeOff,
        countdown: 'Starter om 12 min',
        teeOffPassed: false,
      },
    ],
    [
      'ugyldig dato',
      'ikke-en-dato',
      {
        headline: WAITING_ROOM_TEXT.opensWhenOrganizerStarts,
        countdown: null,
        teeOffPassed: false,
      },
    ],
  ])('%s', (_label, teeOffAt, expected) => {
    expect(waitingRoomView(teeOffAt, NOW)).toEqual(expected);
  });

  it('sier nøyaktig det samme som webben', () => {
    expect(WAITING_ROOM_TEXT.opensAtTeeOff).toBe(
      source.game.home.scorecardOpensAtTeeOff,
    );
    expect(WAITING_ROOM_TEXT.opensWhenOrganizerStarts).toBe(
      source.game.home.scorecardOpensWhenOrganizerStarts,
    );
  });
});
