// #1874: den ene render-testen (Type C) for roster-raden på spill-hjem.
//
// Hva raden SIER er ren logikk og dekket i `roster.test.ts` — det gjentas ikke
// her. Det som blir igjen er de to koblingene ingen ren funksjon kan bekrefte:
//
//  1. **Merkelappene kommer faktisk ut på skjermen** — wolf-raden med sine hull
//     og uten «Flight N»/«Lag N», round robin uten noe, lag-formatene som før.
//     Eieren leste «Flight 3 · Lag 3» som «dere går hver for dere»; det er
//     motsatt av sant, og feilen var synlig først i tapptest.
//  2. **Den lengste merkelappen får plass.** «Wolf på hull 3, 6, 9, 12, 15 og
//     18» er så lang som det blir, og uten `flexShrink` renner den ut av raden
//     på en smal telefon (#1842: tekst som klippes er tekst som lyver).
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { render, screen } from '@testing-library/react-native';
import type { BundlePlayer } from '../data/gameBundle';
import { RosterRow } from './GameHome';

// Skjermen drar inn arrangør-seksjonen, som drar inn klienten. Raden selv rører
// ingenting av det — mocken er der bare for at modulgrafen skal kunne lastes.
jest.mock('../supabase', () => require('../test/supabaseMock'));

function player(overrides: Partial<BundlePlayer> & { userId: string }): BundlePlayer {
  return {
    name: overrides.userId,
    nickname: null,
    teamNumber: null,
    flightNumber: null,
    courseHandicap: 12,
    teeGender: 'mens',
    acceptedAt: null,
    submittedAt: null,
    approvedAt: null,
    rejectionReason: null,
    withdrawnAt: null,
    ...overrides,
  };
}

/** n spillere med slot 1..n, slik `assignRotationSlots` setter dem ved start. */
function rotation(n: number): BundlePlayer[] {
  return Array.from({ length: n }, (_, i) =>
    player({ userId: `p${i + 1}`, name: `Spiller ${i + 1}`, teamNumber: i + 1, flightNumber: i + 1 }),
  );
}

describe('RosterRow', () => {
  it('tegner rotasjons-plassen som hull i wolf, ingenting i round robin, og lag som før', async () => {
    // 1. Wolf: hullene plassen gir Wolf-rollen på — og INGEN Flight/Lag.
    const four = rotation(4);
    const { rerender } = await render(
      <RosterRow player={four[2]} isMe={false} gameMode="wolf" players={four} />,
    );
    expect(screen.getByTestId('roster-marks-p3')).toHaveTextContent(
      'Wolf på hull 3, 7, 11 og 15',
    );
    expect(screen.queryByText(/Flight/)).toBeNull();
    expect(screen.queryByText(/Lag/)).toBeNull();

    // 2. Den lengste merkelappen som finnes står hel, og raden lar den krympe
    //    i stedet for å la den renne ut av kanten.
    const three = rotation(3);
    await rerender(
      <RosterRow player={three[2]} isMe={false} gameMode="wolf" players={three} />,
    );
    const longest = screen.getByTestId('roster-marks-p3');
    expect(longest).toHaveTextContent('Wolf på hull 3, 6, 9, 12, 15 og 18');
    expect(longest).toHaveStyle({ flexShrink: 1 });

    // 3. Round robin: rekkefølgen er rent kosmetisk for poengene, og nettsiden
    //    viser heller ingenting. Ingen merkelapp i det hele tatt.
    await rerender(
      <RosterRow player={four[1]} isMe={false} gameMode="round_robin" players={four} />,
    );
    expect(screen.getByTestId('roster-row-p2')).toBeTruthy();
    expect(screen.queryByTestId('roster-marks-p2')).toBeNull();

    // 4. Lag-formatene er urørt av denne slicen.
    const teamPlayer = player({
      userId: 'a',
      name: 'Anna',
      teamNumber: 1,
      flightNumber: 2,
    });
    await rerender(
      <RosterRow player={teamPlayer} isMe gameMode="best_ball" players={[teamPlayer]} />,
    );
    expect(screen.getByTestId('roster-marks-a')).toHaveTextContent('Flight 2 · Lag 1');
    expect(screen.getByTestId('roster-row-a')).toHaveTextContent(/Anna \(deg\)/);
  });
});
