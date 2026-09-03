// native/app/src/lib/rosterCopy.test.ts
// Native N6b (#1855): copyen arrangøren møter når noe ikke går gjennom.
//
// Testen har to jobber.
//
//  1. **Ingen kode uten setning.** Hver verdi i de to feilunionene skal gi en
//     lesbar norsk linje — ikke `undefined`, ikke en tom streng, ikke en igjen-
//     glemt `{list}`-plassholder. `tsc` sikrer at switch-ene er uttømmende;
//     denne sikrer at det som kommer ut faktisk er tekst.
//  2. **Paritetsport mot webben.** Start-kodene og de fire lag-/flight-kodene
//     er webbens strenger, hentet fra `messages/no.json`. Rettes en av dem på
//     web uten at appen følger etter, blir denne rød — ellers ville arrangøren
//     fått to ulike forklaringer på samme regel, avhengig av flate.
//     `no.json` leses fra node-siden; testen bundles aldri.
import source from '../../../../messages/no.json';
import type { RosterActionFailure } from '../data/rosterActions';
import type { StartRoundFailure, StartRoundRefusal } from '../data/startGame';
import {
  describeRosterFailure,
  describeStartRefusal,
  OWN_ROW_LOCKED_NOTE,
} from './rosterCopy';

const web: Record<string, string> = source.admin.game.errors;

const ROSTER_REASONS: RosterActionFailure[] = [
  'no-session',
  'offline',
  'not-found',
  'roster-locked',
  'roster-full',
  'not-active',
  'no-team-mode',
  'withdrawal-unsupported',
  'bad-team',
  'bad-flight',
  'team-full',
  'flight-full',
  'rls-denied',
  'already-submitted',
  'no-rows',
  'db',
];

const START_REASONS: StartRoundFailure[] = [
  'offline',
  'not_found',
  'not_scheduled',
  'tee_missing',
  'tee_missing_rating',
  'no_players',
  'pending_players',
  'incomplete_sides',
  'decided_by_withdrawal',
  'unassigned_teams',
  'unassigned_flights',
  'rotation_player_count',
  'db_players',
  'db_game',
];

/** Ingen halvferdig interpolering skal nå fram til skjermen. */
function isFinishedSentence(text: string): boolean {
  return text.trim().length > 0 && !/[{}]/.test(text);
}

describe('describeRosterFailure', () => {
  it.each(ROSTER_REASONS)('gir en ferdig setning for «%s»', (reason) => {
    expect(isFinishedSentence(describeRosterFailure(reason))).toBe(true);
  });

  it.each([
    ['bad-team', 'bad_team'],
    ['bad-flight', 'bad_flight'],
    ['team-full', 'team_full'],
    ['flight-full', 'flight_full'],
  ] as [RosterActionFailure, string][])(
    'bruker webbens ordlyd for «%s»',
    (reason, webKey) => {
      expect(describeRosterFailure(reason)).toBe(web[webKey]);
    },
  );

  it('viser serverens egen melding ved en rå DB-feil, og en rolig linje uten', () => {
    expect(describeRosterFailure('db', 'connection reset')).toBe('connection reset');
    expect(describeRosterFailure('db')).toBe('Noe gikk galt mot serveren.');
  });
});

describe('describeStartRefusal', () => {
  it.each(START_REASONS)('gir en ferdig setning for «%s»', (reason) => {
    const refusal: StartRoundRefusal = { ok: false, reason };
    expect(isFinishedSentence(describeStartRefusal(refusal))).toBe(true);
  });

  it.each([
    'not_found',
    'not_scheduled',
    'tee_missing',
    'tee_missing_rating',
    'no_players',
    'incomplete_sides',
    'unassigned_teams',
    'unassigned_flights',
    'db_players',
    'db_game',
  ] as StartRoundFailure[])('bruker webbens ordlyd for «%s»', (reason) => {
    expect(describeStartRefusal({ ok: false, reason })).toBe(web[reason]);
  });

  it('setter navnene inn i pending-setningen der webben setter e-postene', () => {
    expect(
      describeStartRefusal({
        ok: false,
        reason: 'pending_players',
        pendingLabels: ['Kari', 'ola@example.no'],
      }),
    ).toBe(web.pending_players.replace('{list}', ': Kari, ola@example.no'));
  });

  it('lar lista falle bort helt når ingen navn kom med — som webben', () => {
    expect(describeStartRefusal({ ok: false, reason: 'pending_players' })).toBe(
      web.pending_players.replace('{list}', ''),
    );
  });

  it.each([
    ['wolf', 2, 'rotation_player_count_wolf'],
    ['round_robin', 3, 'rotation_player_count_round_robin'],
  ] as ['wolf' | 'round_robin', number, string][])(
    'velger %s-setningen med det faktiske antallet (#969)',
    (rotationMode, count, webKey) => {
      expect(
        describeStartRefusal({
          ok: false,
          reason: 'rotation_player_count',
          rotationMode,
          rotationActiveCount: count,
        }),
      ).toBe(web[webKey].replace('{count}', String(count)));
    },
  );

  it('sier samme nett-linje som roster-skrivingene', () => {
    expect(describeStartRefusal({ ok: false, reason: 'offline' })).toBe(
      describeRosterFailure('offline'),
    );
  });
});

describe('OWN_ROW_LOCKED_NOTE', () => {
  it('sier både hva appen ikke får til og hvor det gjøres (#1868)', () => {
    // Guardrailen er «ærlig feil»: 0147-vakta nekter arrangøren å endre sin
    // egen rad, så knappen finnes ikke — og noten må da peke videre, ellers
    // står arrangøren fast uten å vite hvorfor.
    expect(OWN_ROW_LOCKED_NOTE).toContain('nettsiden');
    expect(isFinishedSentence(OWN_ROW_LOCKED_NOTE)).toBe(true);
  });
});
