// Native N3 (#1825): fra typet handlings-utfall til noe spilleren kan lese.
//
// Poenget er at INGEN feil forsvinner. `{ ok: false }` — inkludert 0-rads-
// tilfellet der PostgREST svarte `error == null` — må havne på skjermen, ellers
// er vi tilbake i #667/#704: en skriving som aldri skjedde, meldt som suksess.
import type {
  BingoBangoBongoValidationError,
  BingoBangoBongoWriteError,
  ChoiceWriteFailure,
  WolfChoiceValidationError,
} from '../data/choices';
import type { ActionResult } from '../data/playerActions';
// Kun typen: `data/submitTeam.ts` drar med seg supabase-klienten gjennom
// `webApi`, og en oversetter-modul skal ikke koble på noe av det.
// `import type` forsvinner i kompileringen, så koden her er fortsatt ren tekst.
import type { TeamSubmitFailure } from '../data/submitTeam';
import { WEB_LINK_TEXT } from './webLink';

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
    | BingoBangoBongoWriteError
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
    case 'game_not_found':
      return 'Fant ikke spillet. Det kan ha blitt slettet.';
    case 'rls_denied':
      return 'Du har ikke lov til å lagre dette valget.';
    case 'no_rows':
      return 'Ingenting ble lagret. Prøv igjen.';
    case 'db_error':
      return 'Fikk ikke lagret valget. Sjekk nettet og prøv igjen.';
  }
}

/**
 * Hvorfor lagkortet ikke ble levert (#1918).
 *
 * Fire av kodene har hver sin setning fordi de krever fire helt ulike ting av
 * spilleren: koble til nett, logge inn på nytt, innse at runden er lukket,
 * eller innse at hen ikke står i den lenger. Resten («ikke deltaker», «fant
 * ikke runden», nettverksfeil, serverfeil) ender i samme «prøv igjen» — de er
 * alle utenfor spillerens kontroll her og nå, og fire varianter av samme råd
 * hjelper ingen. Samme arbeidsdeling som `describeReminderFailure`.
 *
 * Ingen `default`-gren: legger ruta til en kode i `TeamSubmitFailure`, faller
 * `tsc` på den manglende returverdien.
 */
export function describeTeamSubmitFailure(reason: TeamSubmitFailure): string {
  switch (reason) {
    case 'offline':
      return 'Levering av lagkort krever nett.';
    // Delt med lenke-knappene: den samme mangelen i bygget stopper begge, og
    // meldingen skal ikke nevne én av dem.
    case 'no-web-base-url':
      return WEB_LINK_TEXT.missingBaseUrl;
    case 'unauthorized':
      return 'Logg inn på nytt og prøv igjen.';
    // Samme setning som solo-greina (`describeFailure` → `not-active`): begge
    // havner i det samme feltet på scorekortet, og formatet skal ikke avgjøre
    // om det står «spillet» eller «runden».
    case 'not_active':
      return 'Spillet er ikke aktivt lenger.';
    case 'withdrawn':
      return 'Du er trukket fra dette spillet.';
    case 'network':
    case 'forbidden':
    case 'not_found':
    case 'submit_failed':
      return 'Fikk ikke levert kortet. Prøv igjen.';
  }
}
