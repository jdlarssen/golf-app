// native/app/src/components/create/PlayersStep.test.tsx
// Type B (#2148): lagknappene under hver spiller følger antallet valgte, som
// lag-rutenettet på nettsiden (`teamGridSize`), og et fullt lag kan ikke velges
// av en tredje spiller.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { render, screen } from '@testing-library/react-native';
import type { RosterCandidate } from '../../data/createGame';
import { maxTeamsForSize } from '../../../../../lib/games/teamFormatLimits';
import { teamLayoutFor } from '../../lib/rosterLimits';
import type { DraftPlayer } from '../../lib/wizardPayload';
import { PlayersStep } from './PlayersStep';

jest.mock('../../supabase', () => require('../../test/supabaseMock'));

function candidate(id: string): RosterCandidate {
  return { id, name: `Spiller ${id}`, nickname: null, hcpIndex: 18, gender: null, pending: false } as RosterCandidate;
}

function renderStep(players: DraftPlayer[], candidates: RosterCandidate[]) {
  return render(
    <PlayersStep
      candidates={candidates}
      failed={false}
      meId="me"
      mode="best_ball"
      players={players}
      teamLayout={teamLayoutFor('best_ball', false)}
      teeAvailability={{ M: true, D: false, J: false }}
      onToggle={jest.fn()}
      onTeam={jest.fn()}
      onTee={jest.fn()}
      onRetry={jest.fn()}
    />,
  );
}

function disabled(testID: string): boolean {
  return screen.getByTestId(testID).props.accessibilityState?.disabled === true;
}

describe('PlayersStep — lagknapper for flere enn fire lag (#2148)', () => {
  const ids = ['me', 'a', 'b', 'c', 'd', 'e'];
  const candidates = ids.map(candidate);

  it('med 6 valgte i best ball vises Lag 1–3 og ingen Lag 4', async () => {
    const players: DraftPlayer[] = ids.map((userId) => ({ userId, teeGender: 'M', teamNumber: null }));
    await renderStep(players, candidates);
    expect(screen.getByTestId('create-team-a-3')).toBeTruthy();
    expect(screen.queryByTestId('create-team-a-4')).toBeNull();
  });

  it('et fullt lag er disabled for en tredje spiller, men ikke for de to som står i det', async () => {
    const players: DraftPlayer[] = [
      { userId: 'me', teeGender: 'M', teamNumber: 1 },
      { userId: 'a', teeGender: 'M', teamNumber: 1 },
      { userId: 'b', teeGender: 'M', teamNumber: null },
      { userId: 'c', teeGender: 'M', teamNumber: null },
      { userId: 'd', teeGender: 'M', teamNumber: null },
      { userId: 'e', teeGender: 'M', teamNumber: null },
    ];
    await renderStep(players, candidates);
    expect(disabled('create-team-b-1')).toBe(true);
    expect(disabled('create-team-a-1')).toBe(false);
    expect(disabled('create-team-me-1')).toBe(false);
    expect(disabled('create-team-b-2')).toBe(false);
  });

  it('et lag som alt har spillere, vises selv om antallet valgte ikke krever det', async () => {
    const players: DraftPlayer[] = [
      { userId: 'me', teeGender: 'M', teamNumber: 5 },
      { userId: 'a', teeGender: 'M', teamNumber: null },
    ];
    await renderStep(players, candidates);
    expect(screen.getByTestId('create-team-a-5')).toBeTruthy();
    expect(screen.queryByTestId('create-team-a-6')).toBeNull();
  });

  it('med 40 valgte vises 20 lag, aldri flere', async () => {
    const many = Array.from({ length: 40 }, (_, i) => (i === 0 ? 'me' : `x${i}`));
    const players: DraftPlayer[] = many.map((userId) => ({ userId, teeGender: 'M', teamNumber: null }));
    await renderStep(players, many.map(candidate));
    expect(screen.getByTestId(`create-team-x1-${maxTeamsForSize(2)}`)).toBeTruthy();
    expect(screen.queryByTestId(`create-team-x1-${maxTeamsForSize(2) + 1}`)).toBeNull();
  });
});
