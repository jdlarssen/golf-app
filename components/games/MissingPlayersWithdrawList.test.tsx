import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  END_ANYWAY_FORM_ID,
  MissingPlayersWithdrawList,
} from './MissingPlayersWithdrawList';

/**
 * Én render-test (Type C) for skjema-eierskapet (#1932).
 *
 * Hakene står UTENFOR «Avslutt likevel»-skjemaet på begge sidene (purreknappen
 * har sitt eget skjema midt i blokka), så de når bare serveren via
 * `form`-attributtet. Å sjekke at attributtet finnes er ikke nok: testen bygger
 * FormData fra skjemaet slik nettleseren gjør ved innsending, og ser at den
 * avkryssede verdien faktisk er med.
 *
 * D8: arrangørens egen rad får ingen hake. Databasevakten (0168, ledd c) nekter
 * en ikke-admin å trekke seg selv, så en hake der ville feilet hele skrivet.
 * Appen har samme regel (`endGamePlan.ts`: `player.userId !== organiserUserId`).
 */
describe('MissingPlayersWithdrawList (#1932)', () => {
  it('sends ticked checkboxes with the end-anyway form, and gives the organiser no checkbox on their own row', () => {
    const { container } = render(
      <>
        <MissingPlayersWithdrawList
          players={[
            { userId: 'user-a', displayName: 'Ada' },
            { userId: 'user-b', displayName: 'Bjørn' },
            { userId: 'organiser-1', displayName: 'Kari' },
          ]}
          allowWd
          formId={END_ANYWAY_FORM_ID}
          selfUserId="organiser-1"
          heading="heading"
          withdrawLabel="withdraw"
        />
        {/* A sibling, never a parent: same layout as both confirm pages. */}
        <form id={END_ANYWAY_FORM_ID} />
      </>,
    );

    const form = container.querySelector<HTMLFormElement>(
      `form#${END_ANYWAY_FORM_ID}`,
    )!;
    fireEvent.click(screen.getByRole('checkbox', { name: /Ada/ }));

    const submitted = new FormData(form);
    expect(submitted.get('withdraw_user-a')).toBe('on');
    expect(submitted.get('withdraw_user-b')).toBeNull();
    expect(
      container.querySelector('input[name="withdraw_organiser-1"]'),
    ).toBeNull();
  });
});
