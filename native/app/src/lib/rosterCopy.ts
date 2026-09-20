// native/app/src/lib/rosterCopy.ts
// Native N6b (#1855): fra typet feilkode til en setning arrangøren kan lese.
//
// Samme arbeidsdeling som `actionFeedback.ts`: datalaget svarer med koder,
// skjermen viser tekst, og oversettelsen bor ett sted. To unioner møtes her —
// `RosterActionFailure` (roster-skrivingene) og `StartRoundFailure` (starten).
//
// **Ordforrådet er webbens der webben har et.** Start-kodene er
// `game.errors.*` i `messages/no.json` tegn for tegn; det samme gjelder
// `bad_team`, `team_full`, `bad_flight` og `flight_full`, som roster-skrivingene
// deler med webbens flight-side, og `cup-roster-locked`, som er webbens
// `game.players.errorMessages.cup_roster_locked` (#1937). Resten er app-egne
// koder uten fasit, skrevet i husets stemme. Ingen av setningene er oversatt fritt: en arrangør som får
// «laget er fullt» på nettsiden og noe annet i appen begynner å lure på om det
// er to forskjellige regler.
//
// Ingen `default`-gren i noen av switch-ene. Legger noen til en kode i en av
// unionene, faller `tsc` på den manglende returverdien — som er hele poenget
// med å ha ett oversettelses-hjem.
import type { RosterActionFailure } from '../data/rosterActions';
import type { SelfWithdrawFailure } from '../data/withdrawSelf';
import type { StartRoundRefusal } from '../data/startGame';
import { WEB_LINK_TEXT } from './webLink';

/** Fallbacken når serveren svarte med noe vi ikke har en egen setning for. */
const GENERIC_DB = 'Noe gikk galt mot serveren.';

/**
 * Nett-linja. Én formulering for alle skrivingene, så den ikke driver fra
 * hverandre — også avslutt-copyen (`endGameCopy.ts`) leser den herfra.
 */
export const OFFLINE_NOTE = 'Du er uten nett. Koble til, så går det gjennom.';

/**
 * Selv-frafall (#1917) — etikettene og bekreftelsen begge flatene deler.
 *
 * ⚠️ Handlingen går via `POST`/`DELETE /api/games/[id]/withdraw-self`, aldri en
 * skriving: `guard_game_players_self_update` vakt (c) (0147, uendret i 0168)
 * nekter en ikke-admin å røre `withdrawn_at` på sin egen rad, og appen skriver
 * alltid under RLS. Vakta skal stå — ruta er svaret på den, ikke en omvei rundt.
 *
 * Fram til nå sto det en setning i stedet for knappen: «Du kan ikke trekke deg
 * selv herfra. Det ordner du på nettsiden.» #1891 ga den en lenke; #1917 ga den
 * handlingen, og da er henvisningen en beskrivelse av en app som ikke finnes
 * lenger.
 *
 * Teksten ligger her og ikke i skjermene fordi arrangør-seksjonen, avslutt-
 * skjermen og trukket-banneret viser den samme handlingen. Tre flater med hver
 * sin ordlyd ville lest som tre forskjellige handlinger.
 */
export const WITHDRAW_SELF = {
  label: 'Trekk meg',
  confirmTitle: 'Trekk deg fra runden?',
  // Samme todeling som avslutt-skjermens `withdrawHint`: ute av rangeringen,
  // men slagene slettes ikke. Radene i `scores` blir liggende, og spilleren kan
  // fortsatt åpne sitt eget kort.
  confirmBody: 'Du teller ikke med i resultatene. Slagene blir liggende.',
  confirmCta: 'Trekk meg',
  undoLabel: 'Angre trekk',
  undoTitle: 'Angre frafallet?',
  undoBody: 'Du teller med i resultatene igjen.',
  undoCta: 'Angre',
} as const;

/**
 * Hvilken av de to handlingene som feilet.
 *
 * To koder leses motsatt avhengig av retningen: `not_registered` betyr «du står
 * ikke i runden» når du trekker deg og «du står ikke som trukket» når du angrer,
 * og en catch-all som sier «fikk ikke trukket deg» etter et trykk på «Angre
 * trekk» forteller spilleren det motsatte av det som skjedde. Derfor ett
 * oversettelses-hjem med en retning, ikke to switcher som kan drive fra
 * hverandre.
 */
export type SelfWithdrawAction = 'withdraw' | 'undo';

/**
 * Kode → setning for selv-frafallet. Ingen `default`-gren: legger noen en kode
 * til i {@link SelfWithdrawFailure}, faller `tsc` på den manglende returverdien.
 *
 * `no-web-base-url` og `unauthorized` sier det samme som purringen sier
 * (`describeReminderFailure`) — det er den samme mangelen i bygget og den samme
 * tapte sesjonen, og to ordlyder for én årsak ville bare gitt skjermen et valg
 * den ikke trenger å ta.
 */
export function describeSelfWithdrawFailure(
  reason: SelfWithdrawFailure,
  action: SelfWithdrawAction = 'withdraw',
): string {
  switch (reason) {
    case 'offline':
      return OFFLINE_NOTE;
    case 'no-web-base-url':
      return WEB_LINK_TEXT.missingBaseUrl;
    case 'unauthorized':
      return 'Logg inn på nytt og prøv igjen.';
    case 'not_registered':
      return action === 'undo'
        ? 'Du står ikke som trukket i denne runden.'
        : 'Du står ikke oppført i denne runden.';
    // Ferdig runde, eller et format uten frafall. Knappen vises ikke i noen av
    // dem — men rekker runden å bli avsluttet mellom tegningen og trykket, er
    // dette svaret, og da skal det si hva som gjelder og ikke bare «feil».
    case 'game_locked':
      return action === 'undo'
        ? 'Frafallet kan du ikke angre nå.'
        : 'Denne runden kan du ikke trekke deg fra nå.';
    case 'not_found':
      return 'Fant ikke runden. Den er kanskje slettet.';
    case 'network':
    case 'withdraw_failed':
      return action === 'undo'
        ? 'Fikk ikke angret frafallet. Prøv igjen.'
        : 'Fikk ikke trukket deg. Prøv igjen.';
  }
}

/**
 * Roster-skrivingene: legg til, fjern, lag, flight, trekk og angre.
 *
 * @param reason koden fra `RosterActionResult`.
 * @param message serverens egen tekst, brukt kun som fallback ved `db`.
 */
export function describeRosterFailure(
  reason: RosterActionFailure,
  message?: string,
): string {
  switch (reason) {
    case 'no-session':
      return 'Du er ikke logget inn lenger. Logg inn på nytt.';
    case 'offline':
      return OFFLINE_NOTE;
    case 'not-found':
      return 'Fant ikke spilleren i denne runden.';
    case 'roster-locked':
      return 'Runden er i gang. Nå trekker du spillere i stedet for å fjerne dem.';
    case 'cup-roster-locked':
      return 'Dette er en cupkamp. Bytt spilleren på cupsiden i stedet.';
    case 'roster-full':
      return 'Formatet har ikke plass til flere spillere.';
    case 'not-active':
      return 'Dette kan du ikke gjøre slik runden står nå.';
    case 'no-team-mode':
      return 'Dette formatet har ingen lag å fordele spillerne på.';
    case 'withdrawal-unsupported':
      return 'I dette formatet kan du ikke trekke en spiller.';
    case 'bad-team':
      return 'Ugyldig lagnummer. Velg et lag fra listen.';
    case 'bad-flight':
      return 'Ugyldig flight-nummer. Velg en positiv flight fra listen.';
    case 'team-full':
      return 'Det laget er fullt. Velg et annet lag.';
    case 'flight-full':
      return 'Den valgte flighten er full (maks 4 spillere). Velg en annen flight.';
    case 'rls-denied':
      return 'Du har ikke lov til å endre dette.';
    case 'already-submitted':
      return 'Spilleren rakk å levere kortet først, så frafallet gikk ikke gjennom. Ingenting er endret.';
    case 'no-rows':
      return 'Ingenting ble endret. Du har kanskje ikke tilgang, eller noen andre rakk det først.';
    case 'db':
      return message ?? GENERIC_DB;
  }
}

/**
 * Starten. Kodene er kjernens, og setningene er webbens `game.errors.*`.
 *
 * To av dem trenger mer enn en fast streng:
 *  - `pending_players` får lista fra `startRoundNow`, som alt har byttet
 *    e-postene mot navn der navnet var lesbart. Webbens format er `: a, b` rett
 *    inn i setningen — samme her, så de to flatene leses likt.
 *  - `rotation_player_count` (#969) har én setning per format, med det faktiske
 *    antallet påmeldte. Uten `rotationMode` finnes ingen riktig setning, og da
 *    står den generelle igjen — bedre enn å gjette på wolf.
 */
export function describeStartRefusal(refusal: StartRoundRefusal): string {
  switch (refusal.reason) {
    case 'offline':
      return OFFLINE_NOTE;
    case 'not_found':
      return 'Spillet ble ikke funnet.';
    case 'not_scheduled':
      return 'Spillet kan ikke startes (det er ikke planlagt).';
    case 'tee_missing':
      return 'Tee-box mangler. Kan ikke beregne handicap.';
    case 'tee_missing_rating':
      return 'Den valgte teen mangler rating for en spillers kjønn (M/D/J). Sjekk bane-administrasjon eller endre spillerens tee-kjønn.';
    case 'no_players':
      return 'Ingen spillere på dette spillet.';
    case 'pending_players': {
      const list = refusal.pendingLabels?.length
        ? `: ${refusal.pendingLabels.join(', ')}`
        : '';
      return `Disse spillerne har ikke fullført registreringen ennå${list}. De må logge inn og fylle inn navn + HCP før spillet kan startes.`;
    }
    case 'incomplete_sides':
      return 'En eller begge sider mangler spillere. Alle spillere må ha en side og begge sider må være fulltallige før spillet kan startes.';
    case 'decided_by_withdrawal':
      return 'Kampen er allerede avgjort uten spill — noen trakk seg. Kan ikke startes.';
    case 'unassigned_teams':
      return 'Noen spillere står uten lag. Fordel dem på lag før du starter runden.';
    case 'unassigned_flights':
      return 'Spillerne er ikke fordelt i flighter ennå. Del inn flightene før spillet kan startes.';
    case 'rotation_player_count': {
      const count = refusal.rotationActiveCount ?? 0;
      if (refusal.rotationMode === 'wolf') {
        return `Wolf trenger 3–5 spillere for å starte. Nå er ${count} påmeldt.`;
      }
      if (refusal.rotationMode === 'round_robin') {
        return `Round Robin trenger nøyaktig 4 spillere for å starte. Nå er ${count} påmeldt.`;
      }
      if (refusal.rotationMode === 'acey_deucey') {
        return `Acey Deucey trenger nøyaktig 4 spillere for å starte. Nå er ${count} påmeldt.`;
      }
      if (refusal.rotationMode === 'nines') {
        return `Nines trenger nøyaktig 3 spillere for å starte. Nå er ${count} påmeldt.`;
      }
      if (refusal.rotationMode === 'nassau') {
        return `Nassau trenger 2–16 spillere for å starte. Nå er ${count} påmeldt.`;
      }
      if (refusal.rotationMode === 'skins') {
        return `Skins trenger 2–16 spillere for å starte. Nå er ${count} påmeldt.`;
      }
      if (refusal.rotationMode === 'bingo_bango_bongo') {
        return `Bingo Bango Bongo trenger 2–16 spillere for å starte. Nå er ${count} påmeldt.`;
      }
      return `Formatet krever et annet antall spillere for å starte. Nå er ${count} påmeldt.`;
    }
    case 'db_players':
      return 'Klarte ikke å oppdatere spillerne. Prøv igjen.';
    case 'db_game':
      return 'Klarte ikke å oppdatere spillet. Prøv igjen.';
  }
}
