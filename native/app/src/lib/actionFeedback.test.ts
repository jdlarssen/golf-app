// Native (#1832): valg-feilene spilleren faktisk får se.
//
// Poenget med testen er ikke ordlyden — det er at de ti kodene gir TI ulike
// setninger. Faller to av dem sammen (lett gjort når en ny kode limes inn
// under en gammel), kan ikke spilleren lenger skille «du har ikke lov» fra
// «prøv igjen når nettet er tilbake», og det er hele forskjellen på om det er
// noe vits i å trykke en gang til.
import { describeChoiceFailure } from './actionFeedback';

type ChoiceFailure = Parameters<typeof describeChoiceFailure>[0];

const ALL_CODES: readonly ChoiceFailure[] = [
  'not_authenticated',
  'invalid_hole',
  'invalid_choice',
  'partner_required',
  'partner_must_be_null',
  'partner_cannot_be_wolf',
  'game_finished',
  'rls_denied',
  'no_rows',
  'db_error',
];

describe('describeChoiceFailure', () => {
  it('gir hver feilkode sin egen norske setning', () => {
    const messages = ALL_CODES.map(describeChoiceFailure);

    expect(new Set(messages).size).toBe(ALL_CODES.length);
    for (const message of messages) {
      expect(message.length).toBeGreaterThan(0);
    }
  });
});
