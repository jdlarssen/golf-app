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
import {
  describeCreateGameFailure,
  describePendingOthers,
  PENDING_SELF_NOTE,
} from './createGameCopy';

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
  tee_missing_rating: 'ingen opprett-kode sender den; start-avslaget med samme navn speiles i rosterCopy',
  db_users: 'ingen kode på web sender den i dag',
  db_tee: 'ingen kode på web sender den i dag',
  not_editable: 'redigerings-flyten på web; appen oppretter bare',
  cup_roster_locked: 'cup-låsen i redigerings-flyten på web (#2210); appen oppretter bare',
  unexpected: 'webbens fallback med rå kode for ukjente koder; appen har en setning per kode',
};

describe('paritet med wizard.errors i messages/no.json', () => {
  it.each(MIRRORED)('%s er identisk med kilden («%s»)', (code, webKey) => {
    expect(describeCreateGameFailure(code)).toBe(wizardErrors[webKey]);
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

// #2441 (eierens valg B): en uferdig profil stopper ikke publiseringen, bare
// starten. Siste steg sier det som merknader. Tekstene er app-egne: webbens
// `wizard.ready.checklist.pendingProfiles` er et tillegg til spillerraden, ikke
// en merknad, og sier ikke at runden venter.
describe('merknadene om uferdige profiler (#2441)', () => {
  const notes = [PENDING_SELF_NOTE, describePendingOthers(1), describePendingOthers(3)];

  it('snakker til deg om din egen profil', () => {
    expect(PENDING_SELF_NOTE).toContain('Profilen din');
    expect(PENDING_SELF_NOTE).toContain('navn eller handicap');
  });

  it('teller de andre i entall og flertall', () => {
    expect(describePendingOthers(1)).toMatch(/^1 spiller har /);
    expect(describePendingOthers(3)).toMatch(/^3 spillere har /);
  });

  it('sier at runden ikke starter, og ingenting om publisering', () => {
    for (const note of notes) {
      expect(note).toMatch(/runden/i);
      expect(note).not.toMatch(/publiser/i);
      expect(note).not.toContain('—');
    }
  });

  it('er merknader, ikke feilmeldinger', () => {
    const failures = new Set(ALL.map(describeCreateGameFailure));
    for (const note of notes) expect(failures.has(note)).toBe(false);
  });

  it('er ikke webbens sjekkliste-tillegg', () => {
    const checklist = (source.wizard.ready.checklist as Record<string, string>)
      .pendingProfiles;
    expect(notes).not.toContain(checklist);
  });
});
