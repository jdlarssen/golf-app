// #2255: den ene render-testen (Type C) for startbilletten.
//
// Hva feltene og linjene SIER, er låst i `gameTicket.test.ts`. Her låses
// koblingen: banenavnet er overskriften, de tre feltene er hver sin node med
// etikett og verdi, avatarraden er én node med navnene, dekoren er skjult, og
// stubben havner under perforeringen. Og designets drakt der den er et valg:
// gull kicker, deg først i skogfargen og bare fornavn i navnekolonnen.
import { render, screen, within } from '@testing-library/react-native';
import { Text } from 'react-native';
import { homePlayer } from '../../test/homeFixtures';
import { PALETTES, ThemeScope, themeFor } from '../../theme';
import { GameTicket, type TicketField } from './GameTicket';

const HIDDEN = { includeHiddenElements: true };

const FIELDS: TicketField[] = [
  { label: 'Start', value: '09:30', sub: 'Lør 3. okt', a11y: 'Start: A', testID: 'ticket-start' },
  { label: 'Flight', value: '2 av 3', a11y: 'Flight: B', testID: 'ticket-slot' },
  { label: 'Dine slag', value: '15', a11y: 'Dine slag: C', testID: 'ticket-strokes' },
];

it('tegner hode, tre felt, avatarrad og stubben', async () => {
  const players = [
    homePlayer({ userId: 'me', name: 'Siri Aas', flightNumber: 2 }),
    homePlayer({ userId: 'marte', name: 'Marte Holm', flightNumber: 2 }),
    homePlayer({ userId: 'jonas', name: 'Jonas Rud', flightNumber: 2 }),
    homePlayer({ userId: 'ola', name: 'Ola Nordmann', flightNumber: 1 }),
  ];

  await render(
    <GameTicket
      kicker="Torsdagsrunden"
      title="Losby"
      headerLine="Gul tee · Stableford"
      statusLabel="Planlagt"
      fields={FIELDS}
      roster={{ players, userId: 'me', flightNumber: 2 }}
    >
      <Text testID="stub-child">stubb</Text>
    </GameTicket>,
  );

  expect(screen.getByRole('header')).toHaveTextContent('Losby');
  expect(screen.getByTestId('game-ticket-kicker')).toHaveTextContent('Torsdagsrunden');
  // Gull kicker: eierens valg fra designet, unntaket står i DESIGN.md.
  expect(screen.getByTestId('game-ticket-kicker')).toHaveStyle({ color: PALETTES.light.accent });
  expect(screen.getByTestId('game-ticket-status')).toHaveTextContent('Planlagt');
  // Merket som i designet: salvie i 22 % og krem tekst, uten linlag over.
  expect(screen.getByTestId('game-ticket-status')).toHaveStyle({ backgroundColor: 'rgba(125, 170, 138, 0.22)' });
  expect(within(screen.getByTestId('game-ticket-status')).getByText('Planlagt')).toHaveStyle({ color: PALETTES.light.onStrongWarm });

  // Hvert felt er én node: skjermleseren får etikett og verdi i én setning.
  for (const field of FIELDS) {
    const node = screen.getByTestId(field.testID);
    expect(node.props.accessible).toBe(true);
    expect(node.props.accessibilityLabel).toBe(field.a11y);
  }
  expect(screen.getByTestId('ticket-start')).toHaveTextContent(/09:30/);

  // Avatarraden: de andre i flighten (Ola er i flight 1), én etikett med
  // navnene, og bare fornavn i kolonnen ved skivene.
  const roster = screen.getByTestId('game-ticket-roster');
  expect(roster.props.accessibilityLabel).toBe('Flighten din: Du, Marte og Jonas');
  expect(within(roster).getByTestId('game-ticket-names', HIDDEN)).toHaveTextContent('Du, Marte og Jonas');
  // Deg først i skogfargen (`primary`, salvie i mørk), så de andre som egne skiver.
  const self = within(roster).getByTestId('game-ticket-avatars-self', HIDDEN);
  expect(self).toHaveStyle({ backgroundColor: PALETTES.light.primary });
  expect(self).toHaveTextContent('SA');
  // Dine initialer i krem, som designlerretet (ikke hvitt).
  expect(within(self).getByText('SA', HIDDEN)).toHaveStyle({ color: PALETTES.light.onStrong });
  const others = within(roster).getAllByTestId('game-ticket-avatars-disc', HIDDEN);
  expect(others).toHaveLength(2);
  expect(others[0]).toHaveStyle({ backgroundColor: PALETTES.light.primarySoft });

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
      roster={{ players: [homePlayer({ userId: 'me' })], userId: 'me', flightNumber: null }}
    >
      {null}
    </GameTicket>,
  );

  expect(screen.getByRole('header')).toHaveTextContent('Torsdagsrunden');
  expect(screen.queryByTestId('game-ticket-kicker')).toBeNull();
  expect(screen.queryByTestId('game-ticket-roster')).toBeNull();
});

it('fire skiver på det meste: deg og tre andre; navnelista tar med resten', async () => {
  const players = [
    homePlayer({ userId: 'me', name: 'Siri Aas', flightNumber: null }),
    ...['Marte Holm', 'Jonas Rud', 'Kari Li', 'Per Dal', 'Ane Vik'].map((name, i) =>
      homePlayer({ userId: `p${i}`, name, flightNumber: null }),
    ),
  ];

  await render(
    <GameTicket
      kicker={null}
      title="Losby"
      headerLine=""
      statusLabel="Planlagt"
      fields={FIELDS}
      roster={{ players, userId: 'me', flightNumber: null }}
    >
      {null}
    </GameTicket>,
  );

  const roster = screen.getByTestId('game-ticket-roster');
  expect(within(roster).getByTestId('game-ticket-avatars-self', HIDDEN)).toBeTruthy();
  expect(within(roster).getAllByTestId('game-ticket-avatars-disc', HIDDEN)).toHaveLength(3);
  expect(screen.getByTestId('game-ticket-names', HIDDEN).props.children).toBe('Du, Marte, Jonas, Kari og 2 til');
});

it('klubbhus-natt: skiva di er salvie og de andres dyp skoggrønn, så begge skiller seg fra kortet', async () => {
  const players = [
    homePlayer({ userId: 'me', name: 'Siri Aas', flightNumber: null }),
    homePlayer({ userId: 'marte', name: 'Marte Holm', flightNumber: null }),
  ];

  await render(
    <ThemeScope theme={themeFor('dark')}>
      <GameTicket
        kicker={null}
        title="Losby"
        headerLine=""
        statusLabel="Pågår"
        fields={FIELDS}
        roster={{ players, userId: 'me', flightNumber: null }}
      >
        {null}
      </GameTicket>
    </ThemeScope>,
  );

  // Designets lyse toner (`primarySoft`, `surfaceStrong` for deg) står nesten
  // likt med kortet i mørk (1,03:1 og 1,2:1); disse skiller seg ut.
  expect(screen.getByTestId('game-ticket-avatars-self', HIDDEN)).toHaveStyle({
    backgroundColor: PALETTES.dark.primary,
  });
  expect(screen.getByTestId('game-ticket-avatars-disc', HIDDEN)).toHaveStyle({
    backgroundColor: PALETTES.dark.surfaceStrong,
  });
});
