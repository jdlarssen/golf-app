// #2262: stempelet på et levert scorekort.
//
// Hvilken godkjenningslinje et kort får, er `lib/scorecard/scorecardStamp.test.ts`
// sitt. Her prøves to ting: at hver linje blir riktig tekst (`stampCopy`, ren
// funksjon), og én render-test som låser at stempelet er ett skjermleser-
// element med hele teksten, og at godkjenningslinja bare står når det finnes
// en.
import { render, screen } from '@testing-library/react-native';
import type { ScorecardStamp as Stamp } from '../../../../../lib/scorecard/scorecardStamp';
import { ScorecardStamp, stampCopy } from './ScorecardStamp';

// 12:32Z; jest kjører med TZ=UTC, så klokka står som 12:32.
const BASE: Stamp = {
  signedAt: '2026-09-27T12:32:00.000Z',
  signedBy: { kind: 'self' },
  approval: { kind: 'none' },
  locked: false,
};

describe('stampCopy', () => {
  it('dato, klokkeslett og «Signert av deg» med eierens navn', () => {
    expect(stampCopy(BASE, 'Kari Nordmann')).toEqual({
      signedAt: '27. september 2026 · 12:32',
      signedBy: 'Signert av deg, Kari Nordmann',
      approval: null,
      lock: 'Arrangøren låser resultatet når alle har levert',
    });
  });

  it.each([
    { signedBy: { kind: 'other', fullName: 'Ola Nordmann' }, text: 'Signert av Ola Nordmann' },
    { signedBy: { kind: 'other', fullName: null }, text: 'Signert av en annen spiller' },
  ] as const)('$text', ({ signedBy, text }) => {
    expect(stampCopy({ ...BASE, signedBy }, 'Kari Nordmann').signedBy).toBe(text);
  });

  it.each([
    { approval: { kind: 'marker', name: 'Anders' }, text: 'Markør: Anders har godkjent' },
    { approval: { kind: 'organizer' }, text: 'Godkjent av arrangøren' },
    { approval: { kind: 'approved' }, text: 'Godkjent' },
    { approval: { kind: 'pending' }, text: 'Venter på at noen i flighten godkjenner' },
    { approval: { kind: 'none' }, text: null },
  ] as const)('godkjenning $approval.kind → $text', ({ approval, text }) => {
    expect(stampCopy({ ...BASE, approval }, 'Kari Nordmann').approval).toBe(text);
  });

  it('et avsluttet spill er låst', () => {
    expect(stampCopy({ ...BASE, locked: true }, 'Kari Nordmann').lock).toBe('Resultatet er låst');
  });
});

const HIDDEN = { includeHiddenElements: true };

describe('ScorecardStamp', () => {
  it('er ett skjermleser-element, og har godkjenningslinja bare når det finnes en', async () => {
    const { rerender } = await render(
      <ScorecardStamp stamp={{ ...BASE, approval: { kind: 'pending' } }} ownerFullName="Kari Nordmann" />,
    );

    const stamp = screen.getByTestId('scorecard-stamp');
    expect(stamp.props.accessible).toBe(true);
    expect(stamp.props.accessibilityLabel).toBe('Signert, 27. september 2026 kl. 12:32');
    // Sjekklista (#2385): hvem som signerte er gjort, godkjenningen venter, og
    // låsingen gjenstår.
    expect(screen.getByTestId('scorecard-signed-by')).toHaveTextContent('Signert av deg, Kari Nordmann');
    expect(screen.getByTestId('scorecard-signed-by-done', HIDDEN)).toBeTruthy();
    expect(screen.getByTestId('scorecard-approval-pending', HIDDEN)).toBeTruthy();
    expect(screen.getByTestId('scorecard-lock-pending', HIDDEN)).toBeTruthy();

    await rerender(<ScorecardStamp stamp={BASE} ownerFullName="Kari Nordmann" />);
    expect(screen.queryByTestId('scorecard-approval')).toBeNull();
  });
});
