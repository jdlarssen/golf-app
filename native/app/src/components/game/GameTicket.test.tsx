// #2255: den ene render-testen (Type C) for startbilletten.
//
// Hva feltene og linjene SIER, er låst i `gameTicket.test.ts`. Her låses
// koblingen: banenavnet er overskriften, de tre feltene er hver sin node med
// etikett og verdi, avatarraden er én node med navnene, dekoren er skjult, og
// stubben havner under perforeringen.
import { render, screen, within } from '@testing-library/react-native';
import { Text } from 'react-native';
import { homePlayer } from '../../test/homeFixtures';
import { GameTicket, type TicketField } from './GameTicket';

const HIDDEN = { includeHiddenElements: true };

const FIELDS: TicketField[] = [
  { label: 'Start', value: 'Lør 3. okt', sub: 'kl. 09:30', a11y: 'Start: A', testID: 'ticket-start' },
  { label: 'Flight', value: '2 av 3', a11y: 'Flight: B', testID: 'ticket-slot' },
  { label: 'Dine slag', value: '15', a11y: 'Dine slag: C', testID: 'ticket-strokes' },
];

it('tegner hode, tre felt, faktalinje, avatarrad og stubben', async () => {
  const players = [
    homePlayer({ userId: 'me', flightNumber: 2 }),
    homePlayer({ userId: 'marte', name: 'Marte', flightNumber: 2 }),
    homePlayer({ userId: 'jonas', name: 'Jonas', flightNumber: 2 }),
    homePlayer({ userId: 'ola', name: 'Ola', flightNumber: 1 }),
  ];

  await render(
    <GameTicket
      kicker="Torsdagsrunden"
      title="Losby"
      headerLine="Tee: Gul · Stableford"
      statusLabel="Planlagt"
      fields={FIELDS}
      facts="18 hull · Par 72"
      roster={{ players, userId: 'me', flightNumber: 2 }}
    >
      <Text testID="stub-child">stubb</Text>
    </GameTicket>,
  );

  expect(screen.getByRole('header')).toHaveTextContent('Losby');
  expect(screen.getByTestId('game-ticket-kicker')).toHaveTextContent('Torsdagsrunden');
  expect(screen.getByTestId('game-ticket-status')).toHaveTextContent('Planlagt');

  // Hvert felt er én node: skjermleseren får etikett og verdi i én setning.
  for (const field of FIELDS) {
    const node = screen.getByTestId(field.testID);
    expect(node.props.accessible).toBe(true);
    expect(node.props.accessibilityLabel).toBe(field.a11y);
  }
  expect(screen.getByTestId('ticket-start')).toHaveTextContent(/kl\. 09:30/);

  // Avatarraden: de andre i flighten (Ola er i flight 1), én etikett med navnene.
  const roster = screen.getByTestId('game-ticket-roster');
  expect(roster.props.accessibilityLabel).toBe('Flighten din: Du, Marte og Jonas');
  expect(within(roster).getAllByTestId('game-ticket-avatars-disc', HIDDEN)).toHaveLength(2);

  // Dekoren er skjult for skjermleseren.
  expect(screen.queryByTestId('game-ticket-perforation')).toBeNull();
  expect(screen.getByTestId('game-ticket-perforation', HIDDEN)).toBeTruthy();

  expect(within(screen.getByTestId('game-ticket-stub')).getByTestId('stub-child')).toBeTruthy();
});

it('uten bane er spillnavnet tittelen, og uten andre spillere står ingen avatarrad', async () => {
  await render(
    <GameTicket
      kicker={null}
      title="Torsdagsrunden"
      headerLine=""
      statusLabel="Utkast"
      fields={FIELDS}
      facts=""
      roster={{ players: [homePlayer({ userId: 'me' })], userId: 'me', flightNumber: null }}
    >
      {null}
    </GameTicket>,
  );

  expect(screen.getByRole('header')).toHaveTextContent('Torsdagsrunden');
  expect(screen.queryByTestId('game-ticket-kicker')).toBeNull();
  expect(screen.queryByTestId('game-ticket-roster')).toBeNull();
  expect(screen.queryByTestId('game-ticket-facts')).toBeNull();
});
