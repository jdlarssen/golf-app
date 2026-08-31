// native/app/src/lib/createGameCopy.test.ts
// Paritets-porten mellom appens opprett-feilmeldinger og webbens
// `messages/no.json` → `wizard.errors.*`.
//
// Samme grep som `sideTournamentCopy.test.ts`: kilden leses fra node-siden
// (testen bundles aldri) og likheten kreves tegn for tegn. Rettes en melding på
// web uten at appen følger etter, blir CI rød i stedet for at to flater sier
// hver sin ting om samme feil.
//
// De fem app-egne strengene står i `UNMIRRORED_WIZARD_ERROR_KEYS`, og testen
// krever at de faktisk AVVIKER — ellers ville lista sluttet å bety noe.
import source from '../../../../messages/no.json';
import type { CreateGameFailure } from '../data/createGame';
import {
  UNMIRRORED_WIZARD_ERROR_KEYS,
  describeCreateGameFailure,
} from './createGameCopy';

const wizardErrors = source.wizard.errors as Record<string, string>;

/** Kodene appen speiler ordrett fra webben. */
const MIRRORED: CreateGameFailure[] = [
  'name_required',
  'course_required',
  'tee_required',
  'bad_allowance',
  'duplicate_player',
  'mode_required',
  'unsupported_mode_size_combo',
  'mode_locked_after_publish',
  'invalid_game_mode',
  'bad_registration_mode',
  'bad_registration_type',
  'team_registration_unsupported_mode',
  'tee_off_required',
  'tee_off_in_past',
  'bad_side_ld_count',
  'bad_side_ctp_count',
  'db_roster',
  'db_game',
  'db_players',
];

/** Kodene appen skriver selv fordi webben ikke har dem. */
const APP_ONLY: CreateGameFailure[] = [
  'not_authenticated',
  'unsupported_mode',
  'db_format',
  'rls_denied',
  'no_rows',
  'orphan_game',
];

describe('paritet med wizard.errors i messages/no.json', () => {
  it.each(MIRRORED)('%s er identisk med kilden', (code) => {
    expect(describeCreateGameFailure(code)).toBe(wizardErrors[code]);
  });

  // Webben interpolerer en e-postliste i `pending_players`; appen bruker den
  // generiske varianten fordi arrangøren ikke nødvendigvis er admin og
  // medspilleres adresser ikke skal lekke (#435).
  it('pending_players bruker den generiske varianten', () => {
    expect(describeCreateGameFailure('pending_players')).toBe(
      wizardErrors.pending_players_generic,
    );
  });

  // Vaktposten: står en kode her, MÅ appens tekst faktisk skille seg fra
  // webbens. Ellers er lista bare en påstand.
  it.each(UNMIRRORED_WIZARD_ERROR_KEYS)('%s avviker bevisst fra webben', (code) => {
    expect(wizardErrors[code]).toBeDefined();
    expect(describeCreateGameFailure(code)).not.toBe(wizardErrors[code]);
  });
});

describe('describeCreateGameFailure', () => {
  const ALL: CreateGameFailure[] = [
    ...MIRRORED,
    ...APP_ONLY,
    ...UNMIRRORED_WIZARD_ERROR_KEYS,
    'pending_players',
  ];

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
