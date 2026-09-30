// #2254: den ene render-testen (Type C) for billetten «Neste start».
//
// Datoene og nærheten er dekket av `homeDates.test.ts`. Her låses koblingen:
// stubben og linja til høyre kommer på skjermen, flighten gir deg og inntil to
// andre som skiver og «+N til», og hele billetten er ett trykkfelt med én
// samlet etikett.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { homeBundle, homeCard, homePlayer } from '../../test/homeFixtures';
import { NextStartTicket, dashCount } from './NextStartTicket';

const HIDDEN = { includeHiddenElements: true };

it('viser stubb, detaljer og flighten, og åpner spillet ved trykk', async () => {
  const now = new Date(2026, 8, 29, 12, 0);
  const teeOff = new Date(2026, 9, 2, 9, 30).toISOString();
  const card = homeCard({
    gameId: 'next',
    name: 'Klubbmesterskap',
    status: 'scheduled',
    scheduledTeeOffAt: teeOff,
    flightNumber: 2,
    gameMode: 'stableford',
  });
  const bundle = homeBundle({
    game: { id: 'next', status: 'scheduled' },
    players: [
      homePlayer({ userId: 'me', flightNumber: 2 }),
      homePlayer({ userId: 'marte', name: 'Marte Kirkerud', flightNumber: 2 }),
      homePlayer({ userId: 'ola', name: 'Ola Nordmann', flightNumber: 2 }),
      homePlayer({ userId: 'kari', name: 'Kari Nordmann', flightNumber: 2 }),
      homePlayer({ userId: 'per', name: 'Per Hansen', flightNumber: 2 }),
      homePlayer({ userId: 'siri', name: 'Siri Dahl', flightNumber: 2 }),
      homePlayer({ userId: 'annen', name: 'Annen Flight', flightNumber: 3 }),
      homePlayer({
        userId: 'trukket',
        name: 'Trukket Spiller',
        flightNumber: 2,
        withdrawnAt: '2026-09-28T10:00:00.000Z',
      }),
    ],
  });
  const onPress = jest.fn();

  const { rerender } = await render(
    <NextStartTicket card={card} bundle={bundle} userId="me" now={now} onPress={onPress} />,
  );

  expect(screen.getByTestId('home-ticket-date', HIDDEN)).toHaveTextContent('Fre 2. okt');
  expect(screen.getByTestId('home-ticket-clock', HIDDEN)).toHaveTextContent('09:30');
  expect(screen.getByTestId('home-ticket-proximity', HIDDEN)).toHaveTextContent('om 3 dager');
  expect(screen.getByTestId('home-ticket-detail', HIDDEN)).toHaveTextContent(
    'Losby · Flight 2 · Stableford',
  );
  // Fem andre i flighten (den trukne og den i flight 3 er ikke med): deg først,
  // to andre og «+3 til», som i designet.
  expect(screen.getByTestId('home-ticket-avatars-self', HIDDEN)).toBeTruthy();
  expect(screen.getAllByTestId('home-ticket-avatars-disc', HIDDEN)).toHaveLength(2);
  expect(screen.getByTestId('home-ticket-avatars-more', HIDDEN)).toHaveTextContent('+3 til');
  expect(screen.getByTestId('home-ticket-perforation', HIDDEN)).toBeTruthy();

  // Ett element for skjermleseren, med det øyet leser.
  const ticket = screen.getByTestId('home-ticket-next');
  expect(ticket.props.accessibilityLabel).toBe(
    'Neste start. Klubbmesterskap. Fre 2. okt kl. 09:30. om 3 dager. Losby, Flight\u00A02, Stableford. ' +
      'Flighten din: Marte Kirkerud, Ola Nordmann og 3 til',
  );
  await fireEvent.press(ticket);
  expect(onPress).toHaveBeenCalled();

  // Uten tee-off og uten bundel: «Tid ikke satt», ingen nærhet og ingen skiver.
  // Formatnavnet kommer fra appens åtte opprett-formater (`APP_MODE_LABELS`);
  // et format utenfor dem står ikke i linja.
  await rerender(
    <NextStartTicket
      card={{ ...card, scheduledTeeOffAt: null, gameMode: 'solo_strokeplay' }}
      bundle={null}
      userId="me"
      now={now}
      onPress={onPress}
    />,
  );
  expect(screen.getByTestId('home-ticket-no-time', HIDDEN)).toHaveTextContent('Tid ikke satt');
  expect(screen.queryByTestId('home-ticket-proximity', HIDDEN)).toBeNull();
  expect(screen.queryByTestId('home-ticket-avatars', HIDDEN)).toBeNull();
  expect(screen.getByTestId('home-ticket-detail', HIDDEN)).toHaveTextContent('Losby · Flight 2');
});

it('perforeringen får streker fra ende til ende, som designets stiplede kant', () => {
  // Designets billett er 106,3 pt høy innvendig: 11 streker på 6 pt med rundt
  // 4 pt mellom, målt i nettleseren (Hjem v2, #2385).
  expect(dashCount(106.33)).toBe(11);
  // Aldri færre enn én strek i hver ende.
  expect(dashCount(0)).toBe(2);
});
