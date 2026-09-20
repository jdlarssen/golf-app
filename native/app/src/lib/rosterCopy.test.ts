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
import type { StartCountMode } from '../../../../lib/games/startPlayerCount';
import type { StartRoundFailure, StartRoundRefusal } from '../data/startGame';
import type { SelfWithdrawFailure } from '../data/withdrawSelf';
import {
  describeRosterFailure,
  describeSelfWithdrawFailure,
  describeStartRefusal,
  WITHDRAW_SELF,
} from './rosterCopy';

const web: Record<string, string> = source.admin.game.errors;

// Kartet, ikke lista, er porten: en ny kode i unionen uten rad her gir rød `tsc`.
const ROSTER_REASON_MAP = {
  'no-session': true,
  offline: true,
  'not-found': true,
  'roster-locked': true,
  'cup-roster-locked': true,
  'roster-full': true,
  'not-active': true,
  'no-team-mode': true,
  'withdrawal-unsupported': true,
  'bad-team': true,
  'bad-flight': true,
  'team-full': true,
  'flight-full': true,
  'rls-denied': true,
  'already-submitted': true,
  'no-rows': true,
  db: true,
} as const satisfies Record<RosterActionFailure, true>;

const ROSTER_REASONS = Object.keys(ROSTER_REASON_MAP) as readonly RosterActionFailure[];

// Kartet, ikke lista, er porten: koden arves fra webbens startScheduledGameCore,
// så en ny avslags-kode kan legges til uten at noen er i nærheten av app-koden.
const START_REASON_MAP = {
  offline: true,
  not_found: true,
  not_scheduled: true,
  tee_missing: true,
  tee_missing_rating: true,
  no_players: true,
  pending_players: true,
  incomplete_sides: true,
  decided_by_withdrawal: true,
  unassigned_teams: true,
  unassigned_flights: true,
  rotation_player_count: true,
  db_players: true,
  db_game: true,
} as const satisfies Record<StartRoundFailure, true>;

const START_REASONS = Object.keys(START_REASON_MAP) as readonly StartRoundFailure[];

// Kartet, ikke lista, er porten: fire av kodene kommer fra `webApi.ts` og fem
// fra ruta, så en ny kode kan legges til uten at noen er i nærheten av copyen.
const SELF_WITHDRAW_REASON_MAP = {
  offline: true,
  'no-web-base-url': true,
  unauthorized: true,
  network: true,
  not_registered: true,
  not_found: true,
  game_locked: true,
  withdraw_failed: true,
} as const satisfies Record<SelfWithdrawFailure, true>;

const SELF_WITHDRAW_REASONS = Object.keys(
  SELF_WITHDRAW_REASON_MAP,
) as readonly SelfWithdrawFailure[];

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

  it('bruker webbens ordlyd for «cup-roster-locked» (#1937)', () => {
    expect(describeRosterFailure('cup-roster-locked')).toBe(
      source.game.players.errorMessages.cup_roster_locked,
    );
  });

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
    'decided_by_withdrawal',
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
    ['acey_deucey', 3, 'rotation_player_count_acey_deucey'],
    ['nines', 2, 'rotation_player_count_nines'],
    ['nassau', 1, 'rotation_player_count_nassau'],
    ['skins', 1, 'rotation_player_count_skins'],
    ['bingo_bango_bongo', 1, 'rotation_player_count_bingo_bango_bongo'],
  ] as [StartCountMode, number, string][])(
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

describe('describeSelfWithdrawFailure', () => {
  it.each(SELF_WITHDRAW_REASONS)('gir en ferdig setning for «%s»', (reason) => {
    expect(isFinishedSentence(describeSelfWithdrawFailure(reason))).toBe(true);
  });

  it.each(SELF_WITHDRAW_REASONS)(
    'gir en ferdig setning for «%s» også når det var angre som feilet',
    (reason) => {
      expect(isFinishedSentence(describeSelfWithdrawFailure(reason, 'undo'))).toBe(
        true,
      );
    },
  );

  it('snakker om frafallet når du trakk deg, og om angringen når du angret', () => {
    // «Fikk ikke trukket deg» etter et trykk på «Angre trekk» forteller
    // spilleren det motsatte av det som skjedde. Retningen er derfor et
    // argument, ikke to switcher som kan drive fra hverandre.
    expect(describeSelfWithdrawFailure('withdraw_failed')).toContain('trukket');
    expect(describeSelfWithdrawFailure('withdraw_failed', 'undo')).toContain(
      'angret',
    );
    expect(describeSelfWithdrawFailure('not_registered')).not.toBe(
      describeSelfWithdrawFailure('not_registered', 'undo'),
    );
  });

  it('sier samme nett-linje som roster-skrivingene', () => {
    expect(describeSelfWithdrawFailure('offline')).toBe(
      describeRosterFailure('offline'),
    );
  });
});

describe('WITHDRAW_SELF', () => {
  it('har ferdige setninger overalt (#1917)', () => {
    for (const [key, value] of Object.entries(WITHDRAW_SELF)) {
      expect([key, isFinishedSentence(value)]).toEqual([key, true]);
    }
  });

  it('nevner ikke nettsiden — handlingen bor i appen nå', () => {
    // Fram til #1917 sto det en note her: «Du kan ikke trekke deg selv herfra.
    // Det ordner du på nettsiden.» Nå finnes handlingen, og en henvisning
    // videre ville beskrevet en app som ikke finnes lenger.
    for (const value of Object.values(WITHDRAW_SELF)) {
      expect(value).not.toContain('nettsiden');
    }
  });

  it('sier at slagene blir liggende — trukket er ute av rangeringen, ikke slettet', () => {
    // Samme todeling som avslutt-skjermens `withdrawHint`. Uten den siste
    // setningen leses bekreftelsen som «slagene mine forsvinner».
    expect(WITHDRAW_SELF.confirmBody).toContain('teller ikke med');
    expect(WITHDRAW_SELF.confirmBody).toContain('blir liggende');
    expect(WITHDRAW_SELF.undoBody).toContain('teller med');
  });
});
