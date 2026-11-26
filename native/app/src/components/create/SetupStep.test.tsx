// #2942: plassholderen i HCP-andel-feltet viser tallet et tomt felt sender
// (Type C). Hva som lagres, er Type A i `wizardPayload.test.ts`.
import { fireEvent, render, screen } from '@testing-library/react-native';
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

// #3002: the scramble field's three cards (variant A, as the web) and
// patsome's share on holes 1–6. What is sent is Type A in wizardPayload.test.ts.
describe('SetupStep — lag-handicap og patsome-andel (#3002)', () => {
  async function renderSetup(
    mode: AppGameMode,
    setup: ModeSetup = {},
    allowance = '',
    handlers: { onSetup?: (patch: Partial<ModeSetup>) => void; onText?: (patch: { allowance?: string }) => void } = {},
  ) {
    await render(
      <SetupStep
        mode={mode}
        common={COMMON}
        onCommon={() => {}}
        setup={setup}
        onSetup={handlers.onSetup ?? (() => {})}
        text={{ allowance, krPerUnit: '' }}
        onText={handlers.onText ?? (() => {})}
        fee={{ entryFee: '', paymentLink: '', prizes: emptyPrizeDraft(), prizesOpen: false }}
        onFee={() => {}}
      />,
    );
  }

  it('Texas starter på forbundets vekting: tabellen for fire, ingen tallfelt', async () => {
    await renderSetup('texas_scramble');
    expect(screen.getByTestId('create-team-hcp-ngf-helper')).toHaveTextContent(/25, 20, 15 og 10/);
    expect(screen.queryByTestId('create-team-hcp')).toBeNull();
  });

  it('Florida på tre viser trelagsraden, og et byttet lag beholder valget', async () => {
    await renderSetup('florida_scramble', { teamSize: 3 });
    expect(screen.getByTestId('create-team-hcp-ngf-helper')).toHaveTextContent(/30, 20 og 10/);
  });

  it('Ambrose starter på egen prosent med tallfeltet', async () => {
    await renderSetup('ambrose');
    expect(screen.getByTestId('create-team-hcp')).toBeTruthy();
    expect(screen.queryByTestId('create-team-hcp-ngf-helper')).toBeNull();
  });

  it('Brutto skriver regelen pct og prosenten 0; egen prosent fra brutto tømmer feltet', async () => {
    const onSetup = jest.fn();
    const onText = jest.fn();
    await renderSetup('texas_scramble', {}, '', { onSetup, onText });
    fireEvent.press(screen.getByTestId('create-team-hcp-brutto'));
    expect(onSetup).toHaveBeenLastCalledWith({ teamHandicapRule: 'pct' });
    expect(onText).toHaveBeenLastCalledWith({ allowance: '0' });
  });

  it('patsome viser andelen på hull 1–6 under Netto, og skjuler den i Brutto', async () => {
    await renderSetup('patsome');
    expect(screen.getByTestId('create-patsome-fourball-allowance').props.placeholder).toBe('85');
    await renderSetup('patsome', { patsomeScoring: 'gross' });
    expect(screen.queryByTestId('create-patsome-fourball-allowance')).toBeNull();
  });
});
