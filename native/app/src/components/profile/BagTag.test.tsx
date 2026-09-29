// #2256: bag-taggen (Type C, én render-test).
//
// Hva kortet sier, er `lib/bagTag.test.ts` sitt (Type A), og tallformatet er
// `profileCopy.test.ts` sitt. Her låses bare koblingene en render kan
// bekrefte: navnet er overskriften, handicapet står, et gammelt handicap er en
// knapp til skjemaet mens et ferskt bare er tekst, og uten klubb står
// reserve-kickeren. Ingen tall-asserts.
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { BagTagModel } from '../../lib/bagTag';
import { PROFILE_TEXT } from '../../lib/profileCopy';
import { BagTag } from './BagTag';

const STALE: BagTagModel = {
  kicker: PROFILE_TEXT.bagTagFallbackKicker,
  name: 'Kari Nordmann',
  subline: 'Dame · Junior · med siden 2026',
  hcpText: '14,2',
  hcpAge: { stale: true, text: PROFILE_TEXT.hcpStaleShort },
  initials: 'KN',
};

describe('BagTag', () => {
  it('names the player as the heading, and links a stale handicap to the form', async () => {
    const onEditProfile = jest.fn();
    const { rerender } = await render(<BagTag model={STALE} onEditProfile={onEditProfile} />);

    expect(screen.getByRole('header')).toHaveTextContent(STALE.name);
    expect(screen.getByTestId('bag-tag-kicker')).toHaveTextContent(PROFILE_TEXT.bagTagFallbackKicker);
    expect(screen.getByTestId('profile-hcp-value')).toHaveTextContent(STALE.hcpText!);

    // Gammelt handicap: påminnelsen er en knapp til skjemaet.
    await fireEvent.press(screen.getByRole('button', { name: PROFILE_TEXT.hcpStaleShort }));
    expect(onEditProfile).toHaveBeenCalledTimes(1);

    // Ferskt handicap: bare en linje, ingen knapp.
    await rerender(
      <BagTag
        model={{ ...STALE, kicker: 'Losby GK', hcpAge: { stale: false, text: 'Oppdatert 26. sep' } }}
        onEditProfile={onEditProfile}
      />,
    );
    expect(screen.getByTestId('bag-tag-kicker')).toHaveTextContent('Losby GK');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByTestId('profile-hcp-age')).toHaveTextContent('Oppdatert 26. sep');

    // Uten handicap sier skjermleseren det i ord, ikke «strek».
    await rerender(
      <BagTag model={{ ...STALE, hcpText: null, hcpAge: null }} onEditProfile={onEditProfile} />,
    );
    expect(screen.getByTestId('profile-hcp')).toHaveProp(
      'accessibilityLabel',
      `${PROFILE_TEXT.handicapLabel} ${PROFILE_TEXT.hcpNotSetSpoken}`,
    );
  });
});
