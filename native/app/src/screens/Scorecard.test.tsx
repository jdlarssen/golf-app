// native/app/src/screens/Scorecard.test.tsx
// Native #1918: den ene render-testen (Type C) for scorekortet.
//
// Kortets tall er dekket av `lib/scorecardRows.test.ts`, lag-oppslaget av
// `lib/teamPlay.test.ts`, lever-skrivingen av `data/playerActions.test.ts` og
// rute-kallet av `data/submitTeam.test.ts`. Ingen av dem gjentas her.
//
// Det som blir igjen er den ene koblingen: **i et format som kollapser til ett
// lagkort leverer appen nå selv.** Fram til #1918 sto det en setning og en
// lenke ut («Levering av lagkort gjøres på nettsiden ennå»), fordi lag-
// leveringen markerer alle medlemmenes rader med service-role — en evne appen
// ikke har. Nå gjør ruta det på appens vegne, og testen låser at det er lagets
// knapp som står der: ikke setningen, ikke lenka, og ikke solo-knappen.
//
// Kø-vakta testes ikke her. `listQueue` er mocket tom, så en disabled-assertion
// ville krevd en andre render, og fila har ÉN (Type C).
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { render, screen, waitFor } from '@testing-library/react-native';
import type { ScreenProps } from '../navigation';
import { Scorecard } from './Scorecard';

const GAME_ID = 'game-1';

const HOLES = Array.from({ length: 18 }, (_, i) => ({
  holeNumber: i + 1,
  parMens: 4,
  parLadies: 5,
  parJuniors: 4,
  strokeIndex: i + 1,
}));

const PLAYER_BASE = {
  nickname: null,
  flightNumber: null as number | null,
  teeGender: 'mens',
  acceptedAt: null,
  submittedAt: null,
  approvedAt: null,
  rejectionReason: null,
  withdrawnAt: null,
};

// Greensome: 2v2 alternate shot — hele laget deler kapteinens rad hele veien
// til hull 18, så `modeCollapsesToTeamCard` er sann og kortet er lagets.
const mockBundle = {
  game: {
    id: GAME_ID,
    name: 'Torsdagsrunden',
    status: 'active',
    gameMode: 'greensome_matchplay',
    modeConfig: {
      kind: 'greensome_matchplay',
      team_size: 2,
      teams_count: 2,
      allowance_pct: 50,
    },
    courseId: 'course-1',
    teeBoxId: 'tee-1',
    requirePeerApproval: false,
    scheduledTeeOffAt: null,
    holeSegment: 'full',
    sourceGameId: null,
    createdBy: 'me',
    scoreVisibility: 'live',
    tournamentId: null,
    foursomesSide1TeeStarterUserId: null,
    foursomesSide2TeeStarterUserId: null,
    sideTournamentEnabled: false,
    sideLdCount: 0,
    sideCtpCount: 0,
    sideDisabledCategories: [],
  },
  players: [
    { ...PLAYER_BASE, userId: 'me', name: 'Meg Selv', teamNumber: 1, courseHandicap: 20 },
    {
      ...PLAYER_BASE,
      userId: 'makker',
      name: 'Makker Makkersen',
      teamNumber: 1,
      courseHandicap: 20,
    },
    { ...PLAYER_BASE, userId: 'rival-a', name: 'Rival Ravn', teamNumber: 2, courseHandicap: 0 },
    { ...PLAYER_BASE, userId: 'rival-b', name: 'Rita Rask', teamNumber: 2, courseHandicap: 0 },
  ],
  courseName: 'Testbanen',
  teeBoxName: 'Gul',
  holes: HOLES,
  fetchedAt: '2026-09-01T10:00:00.000Z',
};

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('../data/gameBundle', () => ({
  loadGameBundle: jest.fn(async () => mockBundle),
  refreshGameBundle: jest.fn(async () => mockBundle),
}));
jest.mock('../data/playerActions', () => ({
  submitScorecard: jest.fn(async () => ({ ok: true, alreadyDone: false })),
}));
jest.mock('../data/submitTeam', () => ({
  submitTeam: jest.fn(async () => ({ ok: true, alreadySubmitted: false })),
}));
jest.mock('../data/seedScores', () => ({ seedGameScores: jest.fn(async () => 0) }));
jest.mock('../data/syncWorker', () => ({ drainQueue: jest.fn(async () => undefined) }));
jest.mock('../data/db', () => ({
  getDb: jest.fn(async () => ({})),
  listQueue: jest.fn(async () => []),
  listScoresForGame: jest.fn(async () => []),
}));
jest.mock('../session', () => ({
  useSession: () => ({ userId: 'me', email: 'meg@example.test' }),
}));
// Fokus-refetchen kommer fra navigasjonen. En hel NavigationContainer for én
// render-test er mer rigg enn testen er verdt; effekten er den samme.
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));

describe('Scorecard', () => {
  it('viser lever-knappen for laget i stedet for en vei til nettsiden', async () => {
    await render(
      <Scorecard
        {...({
          route: { params: { gameId: GAME_ID } },
          navigation: { navigate: jest.fn() },
        } as unknown as ScreenProps<'Scorecard'>)}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('submit-team-card')).toBeTruthy();
    });
    // Veien ut av appen er borte, og det samme er setningen som sto der i
    // stedet for en knapp.
    expect(screen.queryByTestId('team-submit-link')).toBeNull();
    expect(screen.queryByTestId('team-submit-gate')).toBeNull();
    // Og det er LAGETS knapp som står der, ikke solo-knappen: leveringen går
    // gjennom ruta, ikke gjennom spillerens egen rad.
    expect(screen.queryByTestId('submit-scorecard')).toBeNull();
  });
});
