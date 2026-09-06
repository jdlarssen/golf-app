// Native (#1832): valg-feilene spilleren faktisk får se.
//
// Poenget med testen er ikke ordlyden — det er at hver kode gir sin EGEN
// setning. Faller to av dem sammen (lett gjort når en ny kode limes inn
// under en gammel), kan ikke spilleren lenger skille «du har ikke lov» fra
// «prøv igjen når nettet er tilbake», og det er hele forskjellen på om det er
// noe vits i å trykke en gang til.
import type { TeamSubmitFailure } from '../data/submitTeam';
import { describeChoiceFailure, describeTeamSubmitFailure } from './actionFeedback';
import { WEB_LINK_TEXT } from './webLink';

type ChoiceFailure = Parameters<typeof describeChoiceFailure>[0];

// Kartet — ikke en håndholdt liste — er det som gjør dekningen komplett:
// mangler en kode her, faller `tsc` på `satisfies` i det en ny feilkode dukker
// opp i unionen. Da rekker den aldri ut i appen uten sin egen setning.
const CODE_MAP = {
  not_authenticated: true,
  invalid_hole: true,
  invalid_choice: true,
  partner_required: true,
  partner_must_be_null: true,
  partner_cannot_be_wolf: true,
  game_finished: true,
  game_not_found: true,
  rls_denied: true,
  no_rows: true,
  db_error: true,
} as const satisfies Record<ChoiceFailure, true>;

const ALL_CODES = Object.keys(CODE_MAP) as readonly ChoiceFailure[];

describe('describeChoiceFailure', () => {
  it('gir hver feilkode sin egen norske setning', () => {
    const messages = ALL_CODES.map(describeChoiceFailure);

    expect(new Set(messages).size).toBe(ALL_CODES.length);
    for (const message of messages) {
      expect(message.length).toBeGreaterThan(0);
    }
  });
});

// -----------------------------------------------------------------------------
// Lagkort-levering (#1918)
// -----------------------------------------------------------------------------

const TEAM_SUBMIT_REASONS: readonly TeamSubmitFailure[] = [
  'offline',
  'no-web-base-url',
  'unauthorized',
  'network',
  'forbidden',
  'not_found',
  'not_active',
  'withdrawn',
  'submit_failed',
];

/** Ingen halvferdig interpolering skal nå fram til skjermen. */
function isFinishedSentence(text: string): boolean {
  return text.trim().length > 0 && !/[{}]/.test(text);
}

describe('describeTeamSubmitFailure', () => {
  it.each(TEAM_SUBMIT_REASONS)('gir en ferdig setning for «%s»', (reason) => {
    expect(isFinishedSentence(describeTeamSubmitFailure(reason))).toBe(true);
  });

  it('skiller de fire årsakene spilleren kan gjøre noe med', () => {
    // Fire ulike neste-steg: koble til, logg inn, innse at runden er lukket,
    // innse at du ikke står i den. Faller to av dem sammen, mister spilleren
    // rådet — og med et lagkort er det hele laget som blir stående.
    const actionable = (['offline', 'unauthorized', 'not_active', 'withdrawn'] as const).map(
      describeTeamSubmitFailure,
    );

    expect(new Set(actionable).size).toBe(actionable.length);
    // Delt med lenke-knappene: samme mangel i bygget stopper begge, og
    // meldingen skal derfor ikke nevne én av dem.
    expect(describeTeamSubmitFailure('no-web-base-url')).toBe(
      WEB_LINK_TEXT.missingBaseUrl,
    );
  });
});
