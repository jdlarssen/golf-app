// native/app/src/components/create/webLinks.test.tsx
// Native #1891: veiviserens fire blindveier har fått en vei ut.
//
// **Én fil for fire komponenter, med vilje.** Dette er ikke fire uavhengige
// render-tester — det er ÉN strukturell kontrakt (`docs/test-discipline.md`,
// Type B-mønsteret: strukturelle kontrakter bor i én delt fil): står det
// «på nettsiden» i veiviseren, skal det stå en knapp under. Kartleggingen i
// #1891 fant ti slike setninger i appen; fire av dem er her, og en spredt
// assertion per steg-fil ville gjort det umulig å se om noen manglet.
//
// Testene rendrer steg-komponentene DIREKTE og ikke gjennom `CreateGame`.
// Tilstandene som utløser tekstene — tom formatkatalog, tomt kandidatsett, en
// bane uten aktive teer, et format appen ikke kan opprette — krever hver sin
// spesielle backend-respons, og å drive veiviseren dit ville testet
// veiviserens navigasjon om igjen (den er dekket i `CreateGame.test.tsx`).
//
// Selve knappen — underteksten, at trykket åpner riktig URL, den ærlige
// feilen uten env — er dekket i `components/WebLinkButton.test.tsx` og
// gjentas ikke her. Her spørres det bare: står den der?
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { render, screen } from '@testing-library/react-native';
import { CourseStep } from './CourseStep';
import { FormatStep } from './FormatStep';
import { PlayersStep } from './PlayersStep';
import { SummaryStep } from './SummaryStep';

// Steg-filene drar med seg datalags-moduler for typene og de faste notene
// sine, og de kobler på Supabase-klienten ved import. Ingen av testene her
// leser noe fra basen.
jest.mock('../../supabase', () => require('../../test/supabaseMock'));

describe('veiviserens lenkeknapper (#1891)', () => {
  it('gir en vei videre når ingen formater er slått på', async () => {
    // Katalogen er tom, ikke feilet: appen kan ikke opprette noe som helst, og
    // uten knapp sto arrangøren i steg 1 uten neste trykk.
    await render(
      <FormatStep
        entries={[]}
        failed={false}
        selected={null}
        onSelect={jest.fn()}
        onRetry={jest.fn()}
      />,
    );

    expect(screen.getByTestId('create-format-empty')).toBeTruthy();
    expect(screen.getByTestId('create-format-empty-link')).toBeTruthy();
  });

  it('gir en vei videre når det ikke finnes medspillere å velge', async () => {
    // Invitasjon er Resend + rate-limit og dermed server-eid til #1919 lander.
    // Veiviseren har ingen runde ennå, så knappen går til webbens veiviser —
    // den nærmeste flaten som gater på «innlogget arrangør».
    await render(
      <PlayersStep
        candidates={[]}
        failed={false}
        meId="me"
        mode="stableford"
        players={[]}
        teamLayout={null}
        onToggle={jest.fn()}
        onTeam={jest.fn()}
        onRetry={jest.fn()}
      />,
    );

    expect(screen.getByTestId('create-players-empty')).toBeTruthy();
    expect(screen.getByTestId('create-players-empty-link')).toBeTruthy();
  });

  it('gir en vei videre når banen mangler aktive teer — men bare til den som slipper inn', async () => {
    const props = {
      courses: [{ id: 'course-1', name: 'Testbanen', tees: [] }],
      failed: false,
      courseId: 'course-1',
      teeBoxId: null,
      teeOff: new Date('2026-09-02T12:00:00.000Z'),
      onCourse: jest.fn(),
      onTee: jest.fn(),
      onTeeOff: jest.fn(),
      onRetry: jest.fn(),
    };

    const { rerender } = await render(<CourseStep {...props} isAdmin />);

    expect(screen.getByTestId('create-tee-none')).toBeTruthy();
    expect(screen.getByTestId('create-tee-none-link')).toBeTruthy();

    // Og INGEN knapp for alle andre (#1934): tee-editoren er admin-only
    // (`requireAdmin` sender resten hjem), så knappen var en blindvei. Noten
    // står igjen, med en beskjed om hva som faktisk må skje.
    await rerender(<CourseStep {...props} isAdmin={false} />);
    expect(screen.getByTestId('create-tee-none')).toBeTruthy();
    expect(screen.queryByTestId('create-tee-none-link')).toBeNull();
  });

  it('gir en vei videre når formatet ikke kan opprettes i appen — og bare da', async () => {
    const props = {
      lines: [],
      warnings: [],
      busy: false,
      canPublish: true,
      onPublish: jest.fn(),
    };

    const { rerender } = await render(
      <SummaryStep
        {...props}
        error="Dette formatet opprettes på nettsiden ennå."
        errorOnWeb
      />,
    );
    expect(screen.getByTestId('create-error-link')).toBeTruthy();

    // Og INGEN knapp for de andre feilene: «lagene er ikke jevne» løses her i
    // appen, og en knapp til nettsiden ville sendt arrangøren bort fra svaret.
    await rerender(
      <SummaryStep {...props} error="Lagene er ikke jevne." errorOnWeb={false} />,
    );
    expect(screen.getByTestId('create-error')).toBeTruthy();
    expect(screen.queryByTestId('create-error-link')).toBeNull();
  });
});
