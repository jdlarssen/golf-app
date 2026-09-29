// Native (#1832): valg-feilene spilleren faktisk får se.
//
// Poenget med testen er ikke ordlyden — det er at hver kode gir sin EGEN
// setning. Faller to av dem sammen (lett gjort når en ny kode limes inn
// under en gammel), kan ikke spilleren lenger skille «du har ikke lov» fra
// «prøv igjen når nettet er tilbake», og det er hele forskjellen på om det er
// noe vits i å trykke en gang til.
import type { ActionFailure } from '../data/playerActions';
import type { SubmitCardFailure } from '../data/submitCard';
import { isFinishedSentence } from '../test/copy';
import {
  describeChoiceFailure,
  describeFailure,
  describeSubmitFailure,
} from './actionFeedback';
import { OFFLINE_NOTE } from './rosterCopy';
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
// Levering, solo og lag (#1918, #2215)
// -----------------------------------------------------------------------------

// Samme port som `CODE_MAP` over: mangler en kode i kartet, faller `tsc` på
// `satisfies` i det `SubmitCardFailure` får et nytt medlem.
const SUBMIT_REASON_MAP = {
  offline: true,
  'no-web-base-url': true,
  unauthorized: true,
  network: true,
  bad_request: true,
  forbidden: true,
  not_found: true,
  not_active: true,
  withdrawn: true,
  submit_failed: true,
} as const satisfies Record<SubmitCardFailure, true>;

const SUBMIT_REASONS = Object.keys(SUBMIT_REASON_MAP) as readonly SubmitCardFailure[];

describe('describeSubmitFailure', () => {
  it.each(SUBMIT_REASONS)('gir en ferdig setning for «%s»', (reason) => {
    expect(isFinishedSentence(describeSubmitFailure(reason))).toBe(true);
  });

  it('skiller de fire årsakene spilleren kan gjøre noe med', () => {
    // Fire ulike neste-steg: koble til, logg inn, innse at runden er lukket,
    // innse at du ikke står i den. Faller to av dem sammen, mister spilleren
    // rådet — og med et lagkort er det hele laget som blir stående.
    const actionable = (['offline', 'unauthorized', 'not_active', 'withdrawn'] as const).map(
      describeSubmitFailure,
    );

    expect(new Set(actionable).size).toBe(actionable.length);
    // Delt med lenke-knappene: samme mangel i bygget stopper begge, og
    // meldingen skal derfor ikke nevne én av dem.
    expect(describeSubmitFailure('no-web-base-url')).toBe(
      WEB_LINK_TEXT.missingBaseUrl,
    );
  });

  it('sier den felles nett-linja, ikke en lagkort-setning — solo går samme vei (#2215)', () => {
    expect(describeSubmitFailure('offline')).toBe(OFFLINE_NOTE);
  });
});

// -----------------------------------------------------------------------------
// Godkjenning og avvisning (#2215: via ruta)
// -----------------------------------------------------------------------------

// Samme port: en ny kode i `ActionFailure` uten rad her gir rød `tsc`.
const ACTION_REASON_MAP = {
  offline: true,
  'no-web-base-url': true,
  'no-session': true,
  'not-active': true,
  'no-rows': true,
  db: true,
} as const satisfies Record<ActionFailure, true>;

const ACTION_REASONS = Object.keys(ACTION_REASON_MAP) as readonly ActionFailure[];

describe('describeFailure', () => {
  it.each(ACTION_REASONS)('gir en ferdig setning for «%s»', (reason) => {
    const text = describeFailure({ ok: false, reason });
    expect(text).not.toBeNull();
    expect(isFinishedSentence(text!)).toBe(true);
  });

  it('bruker de eksisterende setningene for de to nye kodene', () => {
    // Én årsak, én ordlyd: nett-linja og bygg-mangelen sier det samme her som
    // i de andre rute-kallene.
    expect(describeFailure({ ok: false, reason: 'offline' })).toBe(OFFLINE_NOTE);
    expect(describeFailure({ ok: false, reason: 'no-web-base-url' })).toBe(
      WEB_LINK_TEXT.missingBaseUrl,
    );
  });

  it('viser aldri noe for et vellykket utfall', () => {
    expect(describeFailure({ ok: true, alreadyDone: false })).toBeNull();
    expect(describeFailure({ ok: true, alreadyDone: true })).toBeNull();
  });
});
