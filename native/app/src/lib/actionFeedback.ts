// Native N3 (#1825): fra typet handlings-utfall til noe spilleren kan lese.
//
// Poenget er at INGEN feil forsvinner. `{ ok: false }` — inkludert 0-rads-
// tilfellet der PostgREST svarte `error == null` — må havne på skjermen, ellers
// er vi tilbake i #667/#704: en skriving som aldri skjedde, meldt som suksess.
import type {
  BingoBangoBongoValidationError,
  ChoiceWriteFailure,
  WolfChoiceValidationError,
} from '../data/choices';
import type { ActionResult } from '../data/playerActions';

export function describeFailure(result: ActionResult): string | null {
  if (result.ok) return null;
  switch (result.reason) {
    case 'no-session':
      return 'Du er ikke logget inn lenger. Logg inn på nytt.';
    case 'not-active':
      return 'Spillet er ikke aktivt lenger.';
    case 'withdrawn':
      return 'Du er trukket fra dette spillet.';
    case 'no-rows':
      return 'Ingenting ble endret. Du har kanskje ikke tilgang, eller noen andre rakk det først.';
    case 'db':
      return result.message ?? 'Noe gikk galt mot serveren.';
  }
}

/**
 * Samme jobb for wolf- og BBB-valgene (#1832): typet feilkode → norsk setning.
 *
 * Ett oppslag for begge skrivingene fordi de deler halve unionen (`invalid_hole`
 * og hele `ChoiceWriteFailure`), og fordi to nesten like tabeller er nettopp
 * det som driver fra hverandre. Ordlyden er webbens der webben har en
 * (`messages/no.json` → `holes.wolf.errors`); de app-egne kodene er
 * `no_rows` og `db_error`.
 *
 * Skillet mellom «du har ikke lov» og «prøv igjen» er det som betyr noe på
 * banen: det ene er endelig, det andre går over når nettet er tilbake.
 */
export function describeChoiceFailure(
  error:
    | WolfChoiceValidationError
    | BingoBangoBongoValidationError
    | ChoiceWriteFailure,
): string {
  switch (error) {
    case 'not_authenticated':
      return 'Du er ikke logget inn lenger. Logg inn på nytt.';
    case 'invalid_hole':
      return 'Ugyldig hullnummer.';
    case 'invalid_choice':
      return 'Ugyldig valg.';
    case 'partner_required':
      return 'Du må velge en partner.';
    case 'partner_must_be_null':
      return 'Lone og Blind Wolf spilles uten partner.';
    case 'partner_cannot_be_wolf':
      return 'Du kan ikke velge deg selv som partner.';
    case 'game_finished':
      return 'Runden er avsluttet. Nå kan ingenting registreres mer.';
    case 'rls_denied':
      return 'Du har ikke lov til å lagre dette valget.';
    case 'no_rows':
      return 'Ingenting ble lagret. Prøv igjen.';
    case 'db_error':
      return 'Fikk ikke lagret valget. Sjekk nettet og prøv igjen.';
  }
}
