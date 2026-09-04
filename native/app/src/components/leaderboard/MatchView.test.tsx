// Native (#1842): den ene render-testen (Type C) på duellkortet.
//
// Den asserter STRUKTUR, ikke stilling. Standing, linje og stripe er dekket av
// `leaderboardModel`s egne tester; å telle dem om igjen her ville låst samme
// regel to steder.
//
// Det denne testen alene kan svare på: at et langt sidenavn fortsatt står helt
// på kortet. Toppraden klippet den høyre siden fordi ingen av navnene hadde noe
// flex-grunnlag å krympe fra (#1842). Derfor låser vi de tre tingene som gjør at
// navnet får bryte over linjer i stedet for å bli kuttet.
//
// RNTL 14 er asynkron hele veien: `render` returnerer en promise, og `screen` er
// tom til den er ventet på.
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { MatchView } from './MatchView';

const NAMES: Record<string, string> = {
  a: 'Test Spiller',
  b: 'Bjørn Bunkersen',
  c: 'Kari Treputt',
  d: 'Ola Nordmann Hansen',
};

const SIDE1_LABEL = 'Test Spiller & Bjørn Bunkersen';
const SIDE2_LABEL = 'Kari Treputt & Ola Nordmann Hansen';

describe('MatchView', () => {
  it('viser begge de lange sidenavnene i sin helhet, uten klipping', async () => {
    await render(
      <MatchView
        side1={{ sideNumber: 1, userIds: ['a', 'b'] }}
        side2={{ sideNumber: 2, userIds: ['c', 'd'] }}
        holes={[]}
        holesUp={0}
        holesPlayed={0}
        result={null}
        nameOf={(userId) => NAMES[userId] ?? userId}
      />,
    );

    const side1 = screen.getByTestId('match-side1-name');
    const side2 = screen.getByTestId('match-side2-name');

    // 1: hele navnet står der — ingen forkortelse på veien inn.
    expect(side1).toHaveTextContent(SIDE1_LABEL);
    expect(side2).toHaveTextContent(SIDE2_LABEL);

    // 2: ingen `numberOfLines`, og begge navnene har et flex-grunnlag å krympe
    // fra, slik at teksten bryter over linjer i stedet for å renne ut av kortet.
    for (const name of [side1, side2]) {
      expect(name.props.numberOfLines).toBeUndefined();
      expect(StyleSheet.flatten(name.props.style)).toMatchObject({ flex: 1 });
    }

    // «mot» skal aldri klemmes bort mellom to lange navn.
    expect(StyleSheet.flatten(screen.getByText('mot').props.style)).toMatchObject({
      flexShrink: 0,
    });
  });
});
