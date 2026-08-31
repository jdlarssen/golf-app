// native/app/src/lib/createGameCopy.ts
// Native N6a (#1854): typet feilkode fra opprett-flyten → én norsk setning.
//
// Samme jobb som `actionFeedback.ts` gjør for føringen, men i egen fil fordi
// unionen er stor (32 koder) og halvparten av copyen er SPEILET fra webbens
// `messages/no.json` → `wizard.errors.*`. Paritetstesten leser kilden fra
// node-siden og krever tegn-for-tegn likhet for den speilede halvparten.
//
// **Fem koder er bevisst IKKE speilet.** Webbens strenger for dem navngir tall
// som bare stemmer for ett format: «Hver spiller må tilhøre et lag (1–4)» er
// riktig for best ball og feil for matchplay, «Singles matchplay krever
// nøyaktig 2 spillere» står under en kode som også fyrer for wolf (maks 5) og
// skins (maks 16), og «minst én spiller» er feil for alle formatene appen
// tilbyr utenom stableford. Appen skriver dem format-agnostisk i stedet. De
// står oppført i {@link UNMIRRORED_WIZARD_ERROR_KEYS} så avviket er lest ut av
// koden og ikke oppdaget som en rar melding på banen.
//
// **Switchen har ingen `default`.** Det er hele poenget: en ny feilkode i
// `CreateGameFailure` gjør `tsc` rød her til noen har skrevet setningen. Ingen
// feil kan snike seg ut som `undefined`.
import type { CreateGameFailure } from '../data/createGame';

/**
 * Kodene der appen bruker egen tekst i stedet for webbens.
 * Listet her, ikke bare i kommentaren over, så paritetstesten kan se dem.
 */
export const UNMIRRORED_WIZARD_ERROR_KEYS = [
  'bad_team',
  'bad_flight',
  'team_balance',
  'min_players_for_mode',
  'too_many_players_for_mode',
] as const;

export function describeCreateGameFailure(error: CreateGameFailure): string {
  switch (error) {
    // ── Speilet fra wizard.errors.* ────────────────────────────────────────
    case 'name_required':
      return 'Spillet må ha et navn.';
    case 'course_required':
      return 'Velg en bane.';
    case 'tee_required':
      return 'Velg en tee-boks.';
    case 'bad_allowance':
      return 'HCP-andelen må være et helt tall mellom 0 og 100.';
    case 'duplicate_player':
      return 'Samme spiller kan ikke velges flere ganger.';
    case 'mode_required':
      return 'Du må velge en spillmodus før du kan publisere spillet.';
    case 'unsupported_mode_size_combo':
      return 'Den valgte lagstørrelsen er ikke støttet for denne spillmodusen ennå.';
    case 'mode_locked_after_publish':
      return 'Spillmodus kan ikke endres etter at spillet er publisert. Slett spillet og opprett et nytt hvis du vil bytte modus.';
    case 'invalid_game_mode':
      return 'Den valgte spillmodusen er ikke tilgjengelig. Velg en annen modus og prøv igjen.';
    case 'bad_registration_mode':
      return 'Valget for hvem som kan melde seg på er ugyldig. Sett det på nytt under «Hvem kan melde seg på?».';
    case 'bad_registration_type':
      return 'Typen påmelding er ugyldig. Velg solo, lag eller begge deler.';
    case 'team_registration_unsupported_mode':
      return 'Lag-påmelding funker ikke med dette formatet. Velg solo-påmelding, eller bytt til et format som spilles i lag.';
    case 'tee_off_required':
      return 'Tee-off-tidspunkt er påkrevd.';
    case 'tee_off_in_past':
      return 'Tee-off kan ikke være i fortiden. Velg et tidspunkt fra nå av.';
    case 'bad_side_ld_count':
      return 'Antall longest-drive-vinnere må være 0, 1 eller 2.';
    case 'bad_side_ctp_count':
      return 'Antall closest-to-pin-vinnere må være 0, 1 eller 2.';
    case 'db_roster':
      return 'Klarte ikke å lese spillerlisten fra databasen.';
    case 'db_game':
      return 'Klarte ikke å lagre spillet. Prøv igjen om litt.';
    case 'db_players':
      return 'Klarte ikke å lagre spillerne. Prøv igjen om litt.';
    // Webbens `pending_players` interpolerer en e-postliste. Appen bruker
    // `pending_players_generic` — arrangøren er ikke nødvendigvis admin, og
    // medspilleres adresser skal ikke lekke (#435).
    case 'pending_players':
      return 'Noen på spillerlista har ikke fullført registreringen ennå. De må logge inn og fylle inn navn + HCP før spillet kan publiseres.';

    // ── Egen tekst (webbens navngir tall som ikke gjelder alle formater) ───
    case 'bad_team':
      return 'Alle spillerne må ha et lag før du publiserer.';
    case 'bad_flight':
      return 'Alle spillerne må ha en flight før du publiserer.';
    case 'team_balance':
      return 'Lagene er ikke jevne. Fordel spillerne likt før du publiserer.';
    case 'min_players_for_mode':
      return 'Formatet trenger flere spillere. Legg til noen før du publiserer.';
    case 'too_many_players_for_mode':
      return 'Du har valgt flere spillere enn formatet tar. Ta bort noen før du publiserer.';

    // ── App-egne koder ────────────────────────────────────────────────────
    case 'not_authenticated':
      return 'Du er ikke logget inn lenger. Logg inn på nytt.';
    case 'unsupported_mode':
      return 'Dette formatet opprettes på nettsiden ennå.';
    case 'db_format':
      return 'Fikk ikke sjekket formatet. Sjekk nettet og prøv igjen.';
    case 'rls_denied':
      return 'Du har ikke lov til å opprette dette spillet.';
    case 'no_rows':
      return 'Spillet ble ikke lagret. Prøv igjen.';
    // Den ene meldingen som ikke kan avsluttes med «prøv igjen»: games-raden
    // kan stå igjen i databasen, og et nytt forsøk ville laget en runde til.
    case 'orphan_game':
      return 'Spillerne ble ikke lagret, og vi fikk ikke ryddet bort spillet. Se om det ligger under «Mine spill» — da kan du slette det og prøve på nytt.';
  }
}
