// #2942: plassholderen i HCP-andel-feltet viser tallet et tomt felt sender
// (Type C). Hva som lagres, er Type A i `wizardPayload.test.ts`.
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { emptyPrizeDraft } from '../../../../../lib/games/prizes';
import type { AppGameMode } from '../../lib/appFormats';
import type { ModeSetup } from '../../lib/wizardPayload';
import { SetupStep, type CommonSetup, type SetupText } from './SetupStep';

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

// #3002: the scramble field as the web (Netto/Brutto, then «Standard» or
// «Egen prosent» under Netto) and patsome's share on holes 1–6. What is sent is Type A in wizardPayload.test.ts.
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

  it('Texas starter på Netto og Standard: tabellen for fire, ingen tallfelt', async () => {
    await renderSetup('texas_scramble');
    expect(screen.getByTestId('create-team-hcp-netto').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId('create-team-hcp-ngf').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId('create-team-hcp-ngf-helper')).toHaveTextContent(/25, 20, 15 og 10/);
    expect(screen.queryByTestId('create-team-hcp')).toBeNull();
  });

  it('«Egen prosent» er ett trykk og viser tallfeltet', async () => {
    const onSetup = jest.fn();
    await renderSetup('texas_scramble', {}, '', { onSetup });
    fireEvent.press(screen.getByTestId('create-team-hcp-pct'));
    expect(onSetup).toHaveBeenLastCalledWith({ teamHandicapRule: 'pct' });
  });

  it('Florida på tre viser trelagsraden', async () => {
    await renderSetup('florida_scramble', { teamSize: 3 });
    expect(screen.getByTestId('create-team-hcp-ngf-helper')).toHaveTextContent(/30, 20 og 10/);
  });

  it('Ambrose starter på egen prosent med tallfeltet', async () => {
    await renderSetup('ambrose');
    expect(screen.getByTestId('create-team-hcp-pct').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId('create-team-hcp')).toBeTruthy();
    expect(screen.queryByTestId('create-team-hcp-ngf-helper')).toBeNull();
  });

  it('Brutto skriver regelen pct og prosenten 0', async () => {
    const onSetup = jest.fn();
    const onText = jest.fn();
    await renderSetup('texas_scramble', {}, '', { onSetup, onText });
    fireEvent.press(screen.getByTestId('create-team-hcp-brutto'));
    expect(onSetup).toHaveBeenLastCalledWith({ teamHandicapRule: 'pct' });
    expect(onText).toHaveBeenLastCalledWith({ allowance: '0' });
  });

  it('Netto fra brutto går tilbake til formatets start og tømmer feltet', async () => {
    const onSetup = jest.fn();
    const onText = jest.fn();
    await renderSetup('texas_scramble', { teamHandicapRule: 'pct' }, '0', { onSetup, onText });
    expect(screen.getByTestId('create-team-hcp-brutto').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.queryByTestId('create-team-hcp-ngf')).toBeNull();
    fireEvent.press(screen.getByTestId('create-team-hcp-netto'));
    expect(onSetup).toHaveBeenLastCalledWith({ teamHandicapRule: undefined });
    expect(onText).toHaveBeenLastCalledWith({ allowance: '' });
  });

  it('patsome viser andelen på hull 1–6 under Netto, og skjuler den i Brutto', async () => {
    await renderSetup('patsome');
    expect(screen.getByTestId('create-patsome-fourball-allowance').props.placeholder).toBe('85');
    await renderSetup('patsome', { patsomeScoring: 'gross' });
    expect(screen.queryByTestId('create-patsome-fourball-allowance')).toBeNull();
  });
});

// #3002: the app does what the web field does (TeamHandicapField). The harness
// holds `setup` and `text` as CreateGame does, so a tap reaches the screen.
describe('SetupStep — lag-handicapet som på nettet (#3002)', () => {
  function Harness() {
    const [setup, setSetup] = useState<ModeSetup>({});
    const [text, setText] = useState<SetupText>({ allowance: '', krPerUnit: '' });
    return (
      <SetupStep
        mode="texas_scramble"
        common={COMMON}
        onCommon={() => {}}
        setup={setup}
        onSetup={(patch) => setSetup((prev) => ({ ...prev, ...patch }))}
        text={text}
        onText={(patch) => setText((prev) => ({ ...prev, ...patch }))}
        fee={{ entryFee: '', paymentLink: '', prizes: emptyPrizeDraft(), prizesOpen: false }}
        onFee={() => {}}
      />
    );
  }
  const selected = (testID: string) => screen.getByTestId(testID).props.accessibilityState?.selected;

  it('Netto etter Brutto henter tilbake «Egen prosent» og andelen arrangøren hadde', async () => {
    await render(<Harness />);
    await fireEvent.press(screen.getByTestId('create-team-hcp-pct'));
    await fireEvent.changeText(screen.getByTestId('create-team-hcp'), '60');
    await fireEvent.press(screen.getByTestId('create-team-hcp-brutto'));
    expect(selected('create-team-hcp-brutto')).toBe(true);
    await fireEvent.press(screen.getByTestId('create-team-hcp-netto'));
    expect(selected('create-team-hcp-pct')).toBe(true);
    expect(screen.getByTestId('create-team-hcp').props.value).toBe('60');
  });

  it('Netto etter Brutto fra Standard går tilbake til Standard', async () => {
    await render(<Harness />);
    await fireEvent.press(screen.getByTestId('create-team-hcp-brutto'));
    await fireEvent.press(screen.getByTestId('create-team-hcp-netto'));
    expect(selected('create-team-hcp-ngf')).toBe(true);
  });

  it('å skrive 0 under «Egen prosent» bytter aldri til Brutto', async () => {
    await render(<Harness />);
    await fireEvent.press(screen.getByTestId('create-team-hcp-pct'));
    await fireEvent.changeText(screen.getByTestId('create-team-hcp'), '60');
    await fireEvent.changeText(screen.getByTestId('create-team-hcp'), '0');
    expect(selected('create-team-hcp-netto')).toBe(true);
    expect(screen.getByTestId('create-team-hcp').props.value).toBe('60');
    await fireEvent.changeText(screen.getByTestId('create-team-hcp'), '00');
    expect(selected('create-team-hcp-netto')).toBe(true);
    expect(screen.getByTestId('create-team-hcp').props.value).toBe('60');
  });
});
