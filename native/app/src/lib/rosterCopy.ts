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
// deler med webbens flight-side. Resten er app-egne koder uten fasit, skrevet i
// husets stemme. Ingen av setningene er oversatt fritt: en arrangør som får
// «laget er fullt» på nettsiden og noe annet i appen begynner å lure på om det
// er to forskjellige regler.
//
// Ingen `default`-gren i noen av switch-ene. Legger noen til en kode i en av
// unionene, faller `tsc` på den manglende returverdien — som er hele poenget
// med å ha ett oversettelses-hjem.
import type { RosterActionFailure } from '../data/rosterActions';
import type { StartRoundRefusal } from '../data/startGame';

/** Fallbacken når serveren svarte med noe vi ikke har en egen setning for. */
const GENERIC_DB = 'Noe gikk galt mot serveren.';

/** Nett-linja. Én formulering for alle skrivingene, så den ikke driver fra hverandre. */
const OFFLINE = 'Du er uten nett. Koble til, så går det gjennom.';

/**
 * ⚠️ Arrangørens EGEN rad (#1868).
 *
 * `guard_game_players_self_update` (0147) blokkerer `team_number`,
 * `flight_number` og `withdrawn_at` på egen rad. Unntakene er service-role og
 * `is_admin()` — det finnes ingen vei ut for en oppretter som ikke også er
 * global admin. Appen skriver alltid under RLS, så knappen ville blitt avvist
 * med 42501 hver eneste gang.
 *
 * Derfor vises den ikke. Dette er setningen som står i stedet: den sier hva
 * appen ikke får til og hvor det gjøres, uten å be arrangøren gjette. En knapp
 * som alltid feiler er verre enn ingen knapp.
 */
export const OWN_ROW_LOCKED_NOTE =
  'Appen får ikke endre ditt eget lag eller trekke deg selv. Det ordner du på nettsiden.';

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
      return OFFLINE;
    case 'not-found':
      return 'Fant ikke spilleren i denne runden.';
    case 'roster-locked':
      return 'Runden er i gang. Nå trekker du spillere i stedet for å fjerne dem.';
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
      return OFFLINE;
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
      return `Formatet krever et annet antall spillere for å starte. Nå er ${count} påmeldt.`;
    }
    case 'db_players':
      return 'Klarte ikke å oppdatere spillerne. Prøv igjen.';
    case 'db_game':
      return 'Klarte ikke å oppdatere spillet. Prøv igjen.';
  }
}
