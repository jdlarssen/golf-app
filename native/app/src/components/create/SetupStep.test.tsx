// #2942: plassholderen i HCP-andel-feltet viser tallet et tomt felt sender
// (Type C). Hva som lagres, er Type A i `wizardPayload.test.ts`.
import { render, screen } from '@testing-library/react-native';
import { emptyPrizeDraft } from '../../../../../lib/games/prizes';
import type { AppGameMode } from '../../lib/appFormats';
import type { ModeSetup } from '../../lib/wizardPayload';
import { SetupStep, type CommonSetup } from './SetupStep';

const COMMON: CommonSetup = {
  name: '',
  requirePeerApproval: false,
  scoreVisibility: 'live',
  sideTournamentEnabled: false,
  sideLdCount: 0,
  sideCtpCount: 0,
  sideLdHoles: [],
  sideCtpHoles: [],
};

async function renderStep(mode: AppGameMode, setup: ModeSetup = {}) {
  await render(
    <SetupStep
      mode={mode}
      common={COMMON}
      onCommon={() => {}}
      setup={setup}
      onSetup={() => {}}
      text={{ allowance: '', krPerUnit: '' }}
      onText={() => {}}
      fee={{ entryFee: '', paymentLink: '', prizes: emptyPrizeDraft(), prizesOpen: false }}
      onFee={() => {}}
    />,
  );
  return screen.getByTestId('create-allowance').props.placeholder;
}

describe('SetupStep — plassholderen for HCP-andelen (#2942)', () => {
  it('best ball viser 85', async () => {
    expect(await renderStep('best_ball')).toBe('85');
  });

  it.each(['stableford', 'modified_stableford'] as const)('%s i par viser 85', async (mode) => {
    expect(await renderStep(mode, { stablefordTeamSize: 2 })).toBe('85');
  });

  it.each(['stableford', 'singles_matchplay', 'solo_strokeplay'] as const)('%s alene viser 100', async (mode) => {
    expect(await renderStep(mode)).toBe('100');
  });
});
