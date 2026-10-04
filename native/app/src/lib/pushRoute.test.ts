// #2256 PR 4: et trykk på et spillvarsel åpner spillet, alt annet åpner Hjem.
import { pushTarget, pushUrl } from './pushRoute';

const GAME = '0f8e6c1a-2b3d-4e5f-8a9b-0c1d2e3f4a5b';

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
