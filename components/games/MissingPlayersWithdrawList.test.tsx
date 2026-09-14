import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  END_ANYWAY_FORM_ID,
  MissingPlayersWithdrawList,
} from './MissingPlayersWithdrawList';

/**
 * One render test (Type C) for form ownership (#1932).
 *
 * The checkboxes sit OUTSIDE the «Avslutt likevel» form on both pages
 * (RemindMissing has its own form in between), so they only reach the server
 * through the `form` attribute. Checking that the attribute exists is not
 * enough: the test builds FormData from the form the way the browser does on
 * submit, and checks that the ticked value is really in it.
 *
 * #1932 also gives the signed-in organiser no checkbox on their own row: the
 * 0168 guard, clause (c), rejects a non-admin withdrawing themselves, which
 * would fail the whole batched write. Same rule as the app
 * (`native/app/src/lib/endGamePlan.ts`: `player.userId !== organiserUserId`).
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
