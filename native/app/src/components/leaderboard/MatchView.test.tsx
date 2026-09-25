// Native (#1842, #1990): den ene render-testen (Type C) på duellkortet.
//
// Den asserter STRUKTUR, ikke stilling. Standing, linje og cellenes utfall er
// dekket av `leaderboardModel`s egne tester; å telle dem om igjen her ville
// låst samme regel to steder.
//
// Det denne testen alene kan svare på, er to ting om layout:
//
// 1. At et langt sidenavn fortsatt står helt på kortet. Toppraden klippet den
//    høyre siden fordi ingen av navnene hadde noe flex-grunnlag å krympe fra
//    (#1842). Derfor låser vi de tre tingene som gjør at navnet får bryte over
//    linjer i stedet for å bli kuttet.
// 2. At hele banen står på skjermen samtidig (#1990). Stripen lå i en sidelengs
//    ScrollView, og på en vanlig iPhone fikk nøyaktig åtte ruter plass — resten
//    lå utenfor uten noe hint om at det fantes mer. Nå er den et rutenett med ni
//    ruter per rad, og uspilte hull står som tomme ruter.
//
// RNTL 14 er asynkron hele veien: `render` returnerer en promise, og `screen` er
// tom til den er ventet på.
import { render, screen, within } from '@testing-library/react-native';
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

// Seksten avgjorte hull og to som gjenstår — en match som fortsatt går.
const DECIDED = ['side1_wins', 'side2_wins', 'tied'] as const;
const EIGHTEEN_HOLES = Array.from({ length: 18 }, (_, i) => ({
  holeNumber: i + 1,
  result: i < 16 ? DECIDED[i % 3]! : ('unplayed' as const),
}));

describe('MatchView', () => {
  it('viser de lange sidenavnene i sin helhet, og hele banen i rader på ni uten sidelengs scrolling', async () => {
    const { rerender } = await render(
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

    // 3: uten hull fra motoren er det ingen stripe å tegne, bare ventenoten.
    expect(screen.getByTestId('match-strip-empty')).toBeTruthy();
    expect(screen.queryByTestId('match-strip')).toBeNull();

    await rerender(
      <MatchView
        side1={{ sideNumber: 1, userIds: ['a', 'b'] }}
        side2={{ sideNumber: 2, userIds: ['c', 'd'] }}
        holes={EIGHTEEN_HOLES}
        holesUp={1}
        holesPlayed={16}
        result={null}
        nameOf={(userId) => NAMES[userId] ?? userId}
      />,
    );

    // 4: én rute per hull på banen, også de to som ikke er spilt.
    expect(screen.queryByTestId('match-strip-empty')).toBeNull();
    expect(screen.getAllByTestId(/^match-strip-\d+$/)).toHaveLength(18);

    // 5: ni ruter per rad — hull 1–9 i første rad, 10–18 i andre.
    const firstRow = screen.getByTestId('match-strip-row-1');
    const secondRow = screen.getByTestId('match-strip-row-2');
    for (let hole = 1; hole <= 18; hole++) {
      const row = hole <= 9 ? firstRow : secondRow;
      const otherRow = hole <= 9 ? secondRow : firstRow;
      expect(within(row).getByTestId(`match-strip-${hole}`)).toBeTruthy();
      expect(within(otherRow).queryByTestId(`match-strip-${hole}`)).toBeNull();
    }

    // 6: de uspilte hullene står som tomme ruter med strek, ikke som hull
    // som mangler.
    for (const hole of [17, 18]) {
      expect(within(screen.getByTestId(`match-strip-${hole}`)).getByText('—')).toBeTruthy();
    }

    // 7: ingen sidelengs scrolling — stripen er en vanlig View, ikke en
    // horisontal ScrollView som skjuler hullene utenfor skjermen.
    expect(screen.getByTestId('match-strip').props.horizontal).toBeUndefined();
  });
});
