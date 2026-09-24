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
//     `no.json` leses fra node-siden; testen bundles aldri. Kartene for lag-
//     og start-kodene bærer webbens nøkkel per kode (#1904), og paritets-
//     radene utledes derfra: en ny kode må få en nøkkel, `'interpolated'`
//     eller `null` før `tsc` slipper den gjennom.
import source from '../../../../messages/no.json';
import type { RosterActionFailure } from '../data/rosterActions';
import type { StartCountMode } from '../../../../lib/games/startPlayerCount';
import type { StartRoundFailure, StartRoundRefusal } from '../data/startGame';
import type { SelfWithdrawFailure } from '../data/withdrawSelf';
import type { InviteFailure } from '../data/inviteToGame';
import { isFinishedSentence } from '../test/copy';
import {
  describeInviteFailure,
  describeInviteSuccess,
  describeRosterFailure,
  describeSelfWithdrawFailure,
  describeStartRefusal,
  INVITE_BY_EMAIL,
  START_ROUND_CONFIRM,
  WITHDRAW_SELF,
} from './rosterCopy';

const web: Record<string, string> = source.admin.game.errors;

type WebKey = keyof typeof source.admin.game.errors;

/** Web-teksten har en plassholder; koden har egne særtester under. */
type Interpolated = 'interpolated';

/** Radene i et kode→nøkkel-kart der appen viser webbens streng ordrett. */
function mirroredRows<Code extends string>(
  map: Record<Code, WebKey | Interpolated | null>,
): [Code, WebKey][] {
  return (Object.entries(map) as [Code, WebKey | Interpolated | null][]).filter(
    (entry): entry is [Code, WebKey] => entry[1] !== null && entry[1] !== 'interpolated',
  );
}

// Kartet, ikke lista, er porten: en ny kode i unionen uten rad her gir rød `tsc`.
// Verdien er webbens nøkkel i `admin.game.errors`, eller `null` der appen
// skriver selv.
const ROSTER_REASON_MAP = {
  'no-session': null,
  offline: null,
  'not-found': null,
  'roster-locked': null,
  // Webbens ordlyd bor i `game.players.errorMessages`, ikke i
  // `admin.game.errors` — egen særtest under (#1937).
  'cup-roster-locked': null,
  'roster-full': null,
  'not-active': null,
  'no-team-mode': null,
  'withdrawal-unsupported': null,
  'bad-team': 'bad_team',
  'bad-flight': 'bad_flight',
  'team-full': 'team_full',
  'flight-full': 'flight_full',
  'rls-denied': null,
  'already-submitted': null,
  'no-rows': null,
  db: null,
} as const satisfies Record<RosterActionFailure, WebKey | null>;

const ROSTER_REASONS = Object.keys(ROSTER_REASON_MAP) as readonly RosterActionFailure[];

// Kartet, ikke lista, er porten: koden arves fra webbens startScheduledGameCore,
// så en ny avslags-kode kan legges til uten at noen er i nærheten av app-koden.
// Verdien er webbens nøkkel, `'interpolated'` der web-teksten har en
// plassholder, eller `null` der webben ikke har koden.
const START_REASON_MAP = {
  offline: null,
  not_found: 'not_found',
  not_scheduled: 'not_scheduled',
  tee_missing: 'tee_missing',
  tee_missing_rating: 'tee_missing_rating',
  no_players: 'no_players',
  pending_players: 'interpolated',
  incomplete_sides: 'incomplete_sides',
  decided_by_withdrawal: 'decided_by_withdrawal',
  unassigned_teams: 'unassigned_teams',
  unassigned_flights: 'unassigned_flights',
  rotation_player_count: 'interpolated',
  db_players: 'db_players',
  db_game: 'db_game',
} as const satisfies Record<StartRoundFailure, WebKey | Interpolated | null>;

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

// Kartet, ikke lista, er porten: en ny wire-kode uten rad her gir rød `tsc`.
const INVITE_REASON_MAP = {
  offline: true,
  'no-web-base-url': true,
  unauthorized: true,
  network: true,
  forbidden: true,
  not_found: true,
  invalid_email: true,
  disposable_email: true,
  game_locked: true,
  game_full: true,
  invite_not_allowed: true,
  rate_limited: true,
  invite_failed: true,
} as const satisfies Record<InviteFailure, true>;

const INVITE_REASONS = Object.keys(INVITE_REASON_MAP) as readonly InviteFailure[];

describe('describeRosterFailure', () => {
  it.each(ROSTER_REASONS)('gir en ferdig setning for «%s»', (reason) => {
    expect(isFinishedSentence(describeRosterFailure(reason))).toBe(true);
  });

  it.each(mirroredRows(ROSTER_REASON_MAP))(
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

  it.each(mirroredRows(START_REASON_MAP))('bruker webbens ordlyd for «%s»', (reason, webKey) => {
    expect(describeStartRefusal({ ok: false, reason })).toBe(web[webKey]);
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

describe('invitasjons-copyen (#1919)', () => {
  it.each(INVITE_REASONS)('gir en ferdig setning for «%s»', (reason) => {
    expect(isFinishedSentence(describeInviteFailure(reason))).toBe(true);
  });

  it('sier samme nett-linje som roster-skrivingene', () => {
    expect(describeInviteFailure('offline')).toBe(describeRosterFailure('offline'));
  });

  it('skiller de to suksessene fra hverandre', () => {
    // En registrert spiller står i runden med en gang; en ukjent adresse har
    // fått en mail hen må svare på. Samme setning for begge ville fått
    // arrangøren til å vente på et svar som aldri kommer.
    const added = describeInviteSuccess('added', 'ny@example.com');
    const sent = describeInviteSuccess('sent', 'ny@example.com');
    expect(added).not.toBe(sent);
    expect(added).toContain('ny@example.com');
    expect(sent).toContain('ny@example.com');
    expect(isFinishedSentence(added)).toBe(true);
    expect(isFinishedSentence(sent)).toBe(true);
  });

  it('peker nedover i kortet, ikke ut på nettsiden', () => {
    // Fram til #1919 sto det «Nye folk inviterer du fra nettsiden» der feltet
    // nå står. En henvisning videre ville beskrevet en app som ikke finnes.
    expect(INVITE_BY_EMAIL.emptyList).not.toContain('nettsiden');
    for (const value of Object.values(INVITE_BY_EMAIL)) {
      expect(isFinishedSentence(value)).toBe(true);
    }
  });
});

describe('START_ROUND_CONFIRM', () => {
  // #1980: bekreftelsen før «Start runden nå» er webbens ord for ord.
  it('spør med webbens startRoundConfirm', () => {
    expect(START_ROUND_CONFIRM.message).toBe(source.admin.game.buttons.startRoundConfirm);
  });
});
