import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PreStartWithdrawItems } from './PreStartWithdrawItems';

// Type B (#2607 hole 1): «Dette skjer» says what the core does when the
// player taps «Trekk meg» before the start. The guests a captain brought are
// withdrawn too, by name; the line about unanswered invitations is for
// teammates with an account only.

async function items(captain: Parameters<typeof PreStartWithdrawItems>[0]['captain']) {
  render(await PreStartWithdrawItems({ captain }));
  return Array.from(
    screen.getByTestId('withdraw-pre-start-items').querySelectorAll('li'),
    (li) => li.textContent,
  );
}

describe('PreStartWithdrawItems', () => {
  it('a captain whose team is only guests: the guests by name, no line about invitations', async () => {
    expect(await items({ marksRequest: true, unanswered: 0, guestNames: ['Gunn Gjest', 'Geir Gjest'] }))
      .toMatchInlineSnapshot(`
        [
          "Påmeldingen din slettes",
          "Påmeldingen din står som trukket hos arrangøren",
          "Lag-medlemmer og kaptein får varsel hvis du var på lag",
          "Gjestene dine, Gunn Gjest og Geir Gjest, trekkes også",
        ]
      `);
  });

  it('a captain with one guest and an unanswered teammate: both lines', async () => {
    expect(await items({ marksRequest: true, unanswered: 1, guestNames: ['Gunn Gjest'] }))
      .toMatchInlineSnapshot(`
        [
          "Påmeldingen din slettes",
          "Påmeldingen din står som trukket hos arrangøren",
          "Lag-medlemmer og kaptein får varsel hvis du var på lag",
          "Lagkamerater som ikke har svart, mister invitasjonen og får beskjed",
          "Gjesten din, Gunn Gjest, trekkes også",
        ]
      `);
  });

  it('a player who is not a captain: no guest line', async () => {
    expect(await items(null)).toMatchInlineSnapshot(`
      [
        "Påmeldingen din slettes",
        "Eventuell forespørsel om å bli med slettes også",
        "Lag-medlemmer og kaptein får varsel hvis du var på lag",
      ]
    `);
  });
});
