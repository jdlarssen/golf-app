// #2256 PR 4: et trykk på et spillvarsel åpner spillet, alt annet åpner Hjem.
import { pushNotificationId, pushTarget, pushUrl } from './pushRoute';

const GAME = '0f8e6c1a-2b3d-4e5f-8a9b-0c1d2e3f4a5b';
const NOTE = '5f0c1b2a-3d4e-4f60-8a71-92b3c4d5e6f7';

describe('pushUrl', () => {
  it('leser url fra APNs-payloaden, der vår server legger den', () => {
    expect(
      pushUrl({
        content: { data: null },
        trigger: { type: 'push', payload: { aps: {}, url: `/games/${GAME}`, kind: 'invite' } },
      }),
    ).toBe(`/games/${GAME}`);
  });

  it('faller tilbake til content.data, og gir null uten url', () => {
    expect(pushUrl({ content: { data: { url: '/profile' } }, trigger: { type: 'push' } })).toBe('/profile');
    expect(pushUrl({ content: { data: {} }, trigger: { type: 'push', payload: { url: 42 } } })).toBeNull();
    expect(pushUrl(null)).toBeNull();
  });
});

describe('pushTarget', () => {
  it.each([
    [`/games/${GAME}`],
    [`/games/${GAME}/approve`],
    [`/games/${GAME}/leaderboard`],
    [`/no/games/${GAME}`],
  ])('%s åpner spillets side', (url) => {
    expect(pushTarget(url)).toEqual({ name: 'GameHome', params: { gameId: GAME } });
  });

  // #2268: påminnelsen om et hull uten slag peker på hullet.
  it.each([
    [`/games/${GAME}/holes/10`, 10],
    [`/en/games/${GAME}/holes/1`, 1],
    [`/games/${GAME}/holes/18?from=push`, 18],
  ])('%s åpner hull %d', (url, holeNumber) => {
    expect(pushTarget(url)).toEqual({ name: 'Hole', params: { gameId: GAME, holeNumber } });
  });

  it.each([[`/games/${GAME}/holes/0`], [`/games/${GAME}/holes/19`], [`/games/${GAME}/holes/x`]])(
    '%s er ikke et hull og åpner spillets side',
    (url) => {
      expect(pushTarget(url)).toEqual({ name: 'GameHome', params: { gameId: GAME } });
    },
  );

  // `/games/%E0%A4%A` er en ødelagt `%`-sekvens: `decodeURIComponent` kaster.
  it.each([['/'], [`/admin/games/${GAME}`], ['/profile/venner'], ['/games/'], ['/games/%E0%A4%A'], [null]])(
    '%p åpner Hjem',
    (url) => {
      expect(pushTarget(url)).toEqual({ name: 'Home' });
    },
  );
});

// #2201 PR 2: serveren legger `?varsel=<id>` på lenka, så trykket kan merke
// akkurat det varselet som lest. Markøren skal ikke endre hvor trykket går.
describe('?varsel= på lenka', () => {
  it.each([
    [`/games/${GAME}?varsel=${NOTE}`, { name: 'GameHome', params: { gameId: GAME } }],
    [`/games/${GAME}/holes/3?varsel=${NOTE}`, { name: 'Hole', params: { gameId: GAME, holeNumber: 3 } }],
    [`/?varsel=${NOTE}`, { name: 'Home' }],
  ])('%s åpner samme skjerm som uten markør', (url, target) => {
    expect(pushTarget(url)).toEqual(target);
  });

  it.each<[string | null, string | null]>([
    [`/games/${GAME}?varsel=${NOTE}`, NOTE],
    [`/games/${GAME}/approve?from=x&varsel=${NOTE}`, NOTE],
    [`/?varsel=${NOTE}`, NOTE],
    [`/games/${GAME}?varsel=${NOTE}#top`, NOTE],
    [`/games/${GAME}`, null],
    [`/games/${GAME}?varsel=ikke-en-id`, null],
    [null, null],
  ])('pushNotificationId(%s) → %s', (url, id) => {
    expect(pushNotificationId(url)).toBe(id);
  });
});
