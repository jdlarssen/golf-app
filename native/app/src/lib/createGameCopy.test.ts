// native/app/src/lib/createGameCopy.test.ts
// Paritets-porten mellom appens opprett-feilmeldinger og webbens
// `messages/no.json` → `wizard.errors.*`.
//
// Samme grep som `sideTournamentCopy.test.ts`: kilden leses fra node-siden
// (testen bundles aldri) og likheten kreves tegn for tegn. Rettes en melding på
// web uten at appen følger etter, blir CI rød i stedet for at to flater sier
// hver sin ting om samme feil.
//
// Porten er to regnskap (#1904). `FAILURE_MAP` klassifiserer hver kode i
// `CreateGameFailure` — webbens nøkkel eller `null` for app-egne — så en ny
// kode (unionen arver `GameValidationErrorCode` fra webben) gir rød `tsc` til
// noen har valgt. Og hver nøkkel under `wizard.errors` er enten vist av en kode
// eller står på `WEB_ONLY` med en begrunnelse, så en ny web-melding gir rødt
// til noen har tatt stilling til om appen skal vise den.
import source from '../../../../messages/no.json';
import type { CreateGameFailure } from '../data/createGame';
import { describeCreateGameFailure, describePendingPlayers } from './createGameCopy';

const wizardErrors = source.wizard.errors as Record<string, string>;

type WizardErrorKey = keyof typeof source.wizard.errors;

// Kartet, ikke lista, er porten: en ny kode i unionen uten rad her gir rød `tsc`.
// Verdien er webbens nøkkel appen viser ordrett, eller `null` der appen skriver
// selv fordi webben ikke har koden.
const FAILURE_MAP = {
  name_required: 'name_required',
  course_required: 'course_required',
  tee_required: 'tee_required',
  bad_allowance: 'bad_allowance',
  duplicate_player: 'duplicate_player',
  mode_required: 'mode_required',
  unsupported_mode_size_combo: 'unsupported_mode_size_combo',
  mode_locked_after_publish: 'mode_locked_after_publish',
  invalid_game_mode: 'invalid_game_mode',
  bad_registration_mode: 'bad_registration_mode',
  bad_registration_type: 'bad_registration_type',
  team_registration_unsupported_mode: 'team_registration_unsupported_mode',
  tee_off_required: 'tee_off_required',
  tee_off_in_past: 'tee_off_in_past',
  bad_side_ld_count: 'bad_side_ld_count',
  bad_side_ctp_count: 'bad_side_ctp_count',
  db_roster: 'db_roster',
  db_game: 'db_game',
  db_players: 'db_players',
  // #1858 og #1882: webbens tekster for disse fem navnga ett format under en
  // kode som fyrer for mange — nå er de format-agnostiske, og appen speiler
  // dem igjen.
  bad_team: 'bad_team',
  team_balance: 'team_balance',
  too_many_players_for_mode: 'too_many_players_for_mode',
  bad_flight: 'bad_flight',
  min_players_for_mode: 'min_players_for_mode',
  // Webben interpolerer en e-postliste i `pending_players`; appen bruker den
  // generiske varianten (#435). Egen test under.
  pending_players: 'pending_players_generic',
  not_authenticated: null,
  unsupported_mode: null,
  db_format: null,
  rls_denied: null,
  no_rows: null,
  orphan_game: null,
} as const satisfies Record<CreateGameFailure, WizardErrorKey | null>;

const ALL = Object.keys(FAILURE_MAP) as CreateGameFailure[];

/** Kodene appen speiler ordrett fra webben: [kode, web-nøkkel]. */
const MIRRORED = (
  Object.entries(FAILURE_MAP) as [CreateGameFailure, WizardErrorKey | null][]
).filter((entry): entry is [CreateGameFailure, WizardErrorKey] => entry[1] !== null);

/** Nøkler under `wizard.errors` appen med vilje IKKE viser. */
const WEB_ONLY: Partial<Record<WizardErrorKey, string>> = {
  pending_players: 'webbens variant med e-postliste; appen viser `pending_players_generic` (#435)',
  tee_missing_rating: 'ingen opprett-kode sender den; start-avslaget med samme navn speiles i rosterCopy',
  db_users: 'ingen kode på web sender den i dag',
  db_tee: 'ingen kode på web sender den i dag',
  not_editable: 'redigerings-flyten på web; appen oppretter bare',
  unexpected: 'webbens fallback med rå kode for ukjente koder; appen har en setning per kode',
};

describe('paritet med wizard.errors i messages/no.json', () => {
  it.each(MIRRORED)('%s er identisk med kilden («%s»)', (code, webKey) => {
    expect(describeCreateGameFailure(code)).toBe(wizardErrors[webKey]);
  });

  // Webben interpolerer en e-postliste i `pending_players`; appen bruker den
  // generiske varianten fordi arrangøren ikke nødvendigvis er admin og
  // medspilleres adresser ikke skal lekke (#435).
  it('pending_players bruker den generiske varianten', () => {
    expect(describeCreateGameFailure('pending_players')).toBe(
      wizardErrors.pending_players_generic,
    );
  });

  it('hver nøkkel under wizard.errors vises av en kode eller står på WEB_ONLY (#1904)', () => {
    const accounted = new Set<string>([
      ...MIRRORED.map(([, webKey]) => webKey),
      ...Object.keys(WEB_ONLY),
    ]);
    expect(Object.keys(wizardErrors).sort()).toEqual([...accounted].sort());
  });
});

describe('describeCreateGameFailure', () => {
  it('gir en ikke-tom norsk setning for hver kode', () => {
    for (const code of ALL) {
      const message = describeCreateGameFailure(code);
      expect(message.length).toBeGreaterThan(0);
      // Ingen kode skal lekke ut som identifikator på skjermen.
      expect(message).not.toContain(code);
    }
  });

  it('har unik tekst per kode — to feil skal ikke lyde likt', () => {
    const messages = ALL.map(describeCreateGameFailure);
    expect(new Set(messages).size).toBe(messages.length);
  });

  // Den ene meldingen som ikke kan avsluttes med «prøv igjen»: games-raden kan
  // stå igjen, og et nytt forsøk ville laget runde nummer to.
  it('peker arrangøren til «Mine spill» når kompensasjonen feilet', () => {
    expect(describeCreateGameFailure('orphan_game')).toContain('Mine spill');
  });

  it('skiller «du har ikke lov» fra «prøv igjen»', () => {
    expect(describeCreateGameFailure('rls_denied')).not.toContain('Prøv igjen');
    expect(describeCreateGameFailure('db_format')).toContain('prøv igjen');
  });
});

// #1979: RPC-en `incomplete_profiles_for_ids` ekskluderer ikke kalleren, så en
// arrangør med ufullført profil kom tilbake i sin egen liste — og leste en
// melding om «noen på spillerlista … De må logge inn». Om seg selv.
describe('describePendingPlayers', () => {
  it('snakker til deg når det bare er deg', () => {
    const text = describePendingPlayers({ selfPending: true, othersPending: false });
    expect(text).toContain('Profilen din');
    // Ikke tredjeperson om deg selv.
    expect(text).not.toContain('De må');
    expect(text).not.toContain('Noen på spillerlista');
  });

  it('nevner begge når både du og andre mangler', () => {
    const text = describePendingPlayers({ selfPending: true, othersPending: true });
    expect(text).toContain('du');
    expect(text).toContain('andre');
  });

  it('beholder den gamle setningen når det bare er andre', () => {
    expect(describePendingPlayers({ selfPending: false, othersPending: true })).toBe(
      describeCreateGameFailure('pending_players'),
    );
  });

  it('gir tre ulike setninger — ingen av tilfellene lyder likt', () => {
    const texts = [
      describePendingPlayers({ selfPending: true, othersPending: false }),
      describePendingPlayers({ selfPending: true, othersPending: true }),
      describePendingPlayers({ selfPending: false, othersPending: true }),
    ];
    expect(new Set(texts).size).toBe(3);
  });
});
