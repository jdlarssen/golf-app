// #2749 PR B: kontingent og premiebord i «Sett opp runden» (Type C). Hva som
// lagres, er Type A i `wizardPayload.test.ts`; her er det feltene som kommer og går.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { emptyPrizeDraft } from '../../../../../lib/games/prizes';
import type { AppGameMode } from '../../lib/appFormats';
import { FeeAndPrizes, type FeeDraft } from './FeeAndPrizes';

function Harness({
  mode = 'stableford',
  side = { enabled: false, ldCount: 0, ctpCount: 0 },
}: {
  mode?: AppGameMode;
  side?: { enabled: boolean; ldCount: number; ctpCount: number };
}) {
  const [fee, setFee] = useState<FeeDraft>({
    entryFee: '',
    paymentLink: '',
    prizes: emptyPrizeDraft(),
    prizesOpen: false,
  });
  return <FeeAndPrizes mode={mode} side={side} fee={fee} onFee={(patch) => setFee((prev) => ({ ...prev, ...patch }))} />;
}

describe('FeeAndPrizes', () => {
  it('lenkefeltet kommer først når beløpet er over 0', async () => {
    await render(<Harness />);
    expect(screen.queryByTestId('create-payment-link')).toBeNull();

    await fireEvent.changeText(screen.getByTestId('create-entry-fee'), '0');
    expect(screen.queryByTestId('create-payment-link')).toBeNull();

    // Bare sifre blir stående, som i de andre tallfeltene.
    await fireEvent.changeText(screen.getByTestId('create-entry-fee'), '2a00');
    expect(screen.getByTestId('create-entry-fee').props.value).toBe('200');
    expect(screen.getByTestId('create-payment-link')).toBeTruthy();
    expect(screen.getByText('Legg inn Vipps-nummeret ditt, eller lim inn en betalingslenke.')).toBeTruthy();
  });

  it('premiebordet: «Legg til», så «Skjul», og antallet når det er lukket', async () => {
    await render(<Harness />);
    const toggle = () => screen.getByTestId('create-prizes-toggle');
    expect(toggle()).toHaveTextContent('Legg til');
    expect(screen.queryByTestId('create-prizes')).toBeNull();

    await fireEvent.press(toggle());
    expect(toggle()).toHaveTextContent('Skjul');
    await fireEvent.changeText(screen.getByTestId('create-prize-placement_1-desc'), 'Middag for to');
    await fireEvent.changeText(screen.getByTestId('create-prize-placement_2-desc'), 'Tolv baller');

    await fireEvent.press(toggle());
    expect(toggle()).toHaveTextContent('2 premier');
  });

  it('sponsorfeltet kommer først når premien har tekst', async () => {
    await render(<Harness />);
    await fireEvent.press(screen.getByTestId('create-prizes-toggle'));
    expect(screen.queryByTestId('create-prize-placement_1-sponsor')).toBeNull();

    await fireEvent.changeText(screen.getByTestId('create-prize-placement_1-desc'), 'Middag for to');
    const sponsor = screen.getByTestId('create-prize-placement_1-sponsor');
    expect(sponsor.props.accessibilityLabel).toBe('Sponsor (valgfritt) for 1. plass');

    await fireEvent.changeText(screen.getByTestId('create-prize-placement_1-desc'), '   ');
    expect(screen.queryByTestId('create-prize-placement_1-sponsor')).toBeNull();
  });

  it('slottene følger formatet og sideturneringen', async () => {
    await render(<Harness side={{ enabled: true, ldCount: 1, ctpCount: 2 }} />);
    await fireEvent.press(screen.getByTestId('create-prizes-toggle'));
    const slots = screen.getAllByTestId(/^create-prize-[a-z_0-9]+$/).map((node) => node.props.testID);
    expect(slots).toEqual([
      'create-prize-placement_1',
      'create-prize-placement_2',
      'create-prize-placement_3',
      'create-prize-ld_1',
      'create-prize-ctp_1',
      'create-prize-ctp_2',
    ]);
    // Ett LD-hull gir «Lengste drive», to CTP-hull gir nummer.
    expect(screen.getByTestId('create-prize-ld_1')).toHaveTextContent('Lengste drive');
    expect(screen.getByTestId('create-prize-ctp_2')).toHaveTextContent('Nærmest pinnen 2');
  });

  it('matchplay har ingen pallplasser, og uten sideturnering ingen premierad', async () => {
    await render(<Harness mode="singles_matchplay" />);
    expect(screen.queryByTestId('create-prizes-toggle')).toBeNull();
  });
});
