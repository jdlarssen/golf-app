// #2256: bag-taggen (Type C, én render-test).
//
// Hva kortet sier, er `lib/bagTag.test.ts` sitt (Type A), og tallformatet er
// `profileCopy.test.ts` sitt. Her låses bare koblingene en render kan
// bekrefte: navnet er overskriften, handicapet står, et gammelt handicap er en
// knapp til skjemaet mens et ferskt bare er tekst, uten klubb står
// reserve-kickeren, og med to punkter står kurven og endringen i stedet for
// «Oppdatert …» (tom linje mens kurven lastes). Ingen tall-asserts: endringens
// tekst er `profileCopy.test.ts` sin. #2627: QR-kodens tre tilstander (kode,
// lastes, ingen) og at deleversjonen aldri har den. At koden kan leses, er
// `lib/qrMatrix.test.ts` sitt.
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { BagTagModel } from '../../lib/bagTag';
import {
  PROFILE_TEXT,
  handicapSeasonChange,
  handicapSeasonChangeSpoken,
} from '../../lib/profileCopy';
import { BagTag } from './BagTag';

// QR-arket leser bunnluften over systemlinja; uten navigatorens provider gir
// riggen den.
/* eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock-fabrikken heises over importene */
jest.mock('react-native-safe-area-context', () => require('../../test/safeAreaMock').safeAreaMock());

// Kurven og endringslinja er pynt for skjermleseren (endringen leses i
// handicapet), så de finnes bare med skjulte elementer tatt med.
const HIDDEN = { includeHiddenElements: true };

const STALE: BagTagModel = {
  kicker: PROFILE_TEXT.bagTagFallbackKicker,
  name: 'Kari Nordmann',
  subline: 'Dame · med siden 2026',
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
    expect(screen.queryByTestId('profile-hcp-curve', HIDDEN)).toBeNull();

    // Kurven lastes: linja står tom, så «Oppdatert …» ikke blinker forbi.
    const fresh = { ...STALE, hcpAge: { stale: false, text: 'Oppdatert 26. sep' } };
    await rerender(<BagTag model={fresh} trend="loading" onEditProfile={onEditProfile} />);
    expect(screen.queryByTestId('profile-hcp-age')).toBeNull();
    expect(screen.queryByTestId('profile-hcp-change', HIDDEN)).toBeNull();

    // To punkter: kurven og endringen, og skjermleseren hører endringen i ord.
    const trend = { points: [16.8, 15.9, 14.2], change: -2.6 };
    await rerender(<BagTag model={fresh} trend={trend} onEditProfile={onEditProfile} />);
    expect(screen.getByTestId('profile-hcp-curve', HIDDEN)).toBeTruthy();
    expect(screen.getByTestId('profile-hcp-change', HIDDEN)).toHaveTextContent(handicapSeasonChange(-2.6));
    expect(screen.queryByTestId('profile-hcp-age')).toBeNull();
    expect(screen.getByTestId('profile-hcp')).toHaveProp(
      'accessibilityLabel',
      `${PROFILE_TEXT.handicapLabel} ${STALE.hcpText}, ${handicapSeasonChangeSpoken(-2.6)}`,
    );

    // Et gammelt handicap med kurve: påminnelsen vinner linja.
    await rerender(<BagTag model={STALE} trend={trend} onEditProfile={onEditProfile} />);
    expect(screen.getByRole('button', { name: PROFILE_TEXT.hcpStaleShort })).toBeTruthy();
    expect(screen.queryByTestId('profile-hcp-change', HIDDEN)).toBeNull();

    // Uten handicap sier skjermleseren det i ord, ikke «strek».
    await rerender(
      <BagTag model={{ ...STALE, hcpText: null, hcpAge: null }} onEditProfile={onEditProfile} />,
    );
    expect(screen.getByTestId('profile-hcp')).toHaveProp(
      'accessibilityLabel',
      `${PROFILE_TEXT.handicapLabel} ${PROFILE_TEXT.hcpNotSetSpoken}`,
    );

    // #2627: QR-koden står der ringen sto, som én knapp; navnet er fortsatt
    // overskriften. Trykk åpner arket med koden i stort format.
    const url = 'https://tornygolf.no/venner/legg-til/abcd1234';
    await rerender(<BagTag model={fresh} friendQr={{ url }} onEditProfile={onEditProfile} />);
    expect(screen.getByRole('button', { name: PROFILE_TEXT.friendQrLabel })).toBe(
      screen.getByTestId('bag-tag-qr'),
    );
    expect(screen.queryByText(STALE.initials, HIDDEN)).toBeNull();
    expect(screen.getByRole('header')).toHaveTextContent(STALE.name);
    expect(screen.queryByTestId('friend-qr-sheet')).toBeNull();
    await fireEvent.press(screen.getByTestId('bag-tag-qr'));
    expect(screen.getByTestId('friend-qr-sheet')).toBeTruthy();

    // Mens koden lastes: den tomme flaten, uten ring og uten knapp.
    await rerender(<BagTag model={fresh} friendQr="loading" onEditProfile={onEditProfile} />);
    expect(screen.getByTestId('bag-tag-qr-loading', HIDDEN)).toBeTruthy();
    expect(screen.queryByTestId('bag-tag-qr')).toBeNull();
    expect(screen.queryByText(STALE.initials, HIDDEN)).toBeNull();

    // Uten kode: ringen med initialene, som før.
    await rerender(<BagTag model={fresh} friendQr={null} onEditProfile={onEditProfile} />);
    expect(screen.getByText(STALE.initials, HIDDEN)).toBeTruthy();
    expect(screen.queryByTestId('bag-tag-qr')).toBeNull();
    expect(screen.queryByTestId('bag-tag-qr-loading', HIDDEN)).toBeNull();

    // Bildet som deles har aldri kode, heller ikke når den sendes med.
    await rerender(
      <BagTag variant="share" model={fresh} friendQr={{ url }} onEditProfile={onEditProfile} />,
    );
    expect(screen.getByText(STALE.initials, HIDDEN)).toBeTruthy();
    expect(screen.queryByRole('button', { name: PROFILE_TEXT.friendQrLabel, ...HIDDEN })).toBeNull();
  });
});
