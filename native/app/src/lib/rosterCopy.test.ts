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
import { WEB_LINK_TEXT } from './webLink';
import {
  describeInviteFailure,
  describeInviteSuccess,
  describeRosterFailure,
  describeSelfWithdrawFailure,
  describeStartRefusal,
  INVITE_BY_EMAIL,
  REOPEN_SCORECARD,
  reopenConfirmBody,
  reopenHint,
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
  // #2215: legg til og gjenåpning går via ruter — egen særtest under.
  'no-web-base-url': null,
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
  // #2290: webbens `flight_bound_to_team` er skrevet til spilleren selv
  // («Laget ditt …»); her er det arrangøren som leser.
  'flight-bound-to-team': null,
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
  // #2215: kodene fra selve rute-kallet. Setningene finnes fra før — egen
  // særtest under.
  'no-web-base-url': null,
  unauthorized: null,
  forbidden: null,
  network: null,
  start_failed: null,
  not_found: 'not_found',
  not_scheduled: 'not_scheduled',
  tee_missing: 'tee_missing',
  tee_missing_rating: 'tee_missing_rating',
  no_players: 'no_players',
  // #2207: a fixed sentence without a list — its own test below.
  pending_players: null,
  incomplete_sides: 'incomplete_sides',
  decided_by_withdrawal: 'decided_by_withdrawal',
  // #2214: a match in a finished cup never starts.
  cup_finished: 'cup_finished',
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
  withdrawn_by_other: true,
  captain_has_team: true,
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

  it('sier bygg-mangelen med lenke-knappenes setning (#2215)', () => {
    expect(describeRosterFailure('no-web-base-url')).toBe(WEB_LINK_TEXT.missingBaseUrl);
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

  // #2207: ingen navneliste, for 409-svaret bærer ingen. #2441: publiseringen
  // har ingen profilsperre lenger, så setningen er appens egen og handler bare
  // om starten.
  it('navngir ingen i pending-setningen, og snakker bare om starten (#2207, #2441)', () => {
    const text = describeStartRefusal({ ok: false, reason: 'pending_players' });
    expect(isFinishedSentence(text)).toBe(true);
    expect(text).not.toContain('{');
    expect(text).not.toContain('@');
    expect(text).not.toContain('publiseres');
    expect(text.endsWith('startes.')).toBe(true);
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

  // #2215: starten går via ruta. Kodene fra kallet får setninger som finnes fra
  // før — ingen ny tekst for en ny transport.
  it.each<[StartRoundFailure, string]>([
    ['no-web-base-url', WEB_LINK_TEXT.missingBaseUrl],
    ['unauthorized', describeSelfWithdrawFailure('unauthorized')],
    ['forbidden', describeRosterFailure('rls-denied')],
    ['network', web.db_game],
    ['start_failed', web.db_game],
  ])('gir «%s» en setning som finnes fra før', (reason, expected) => {
    expect(describeStartRefusal({ ok: false, reason })).toBe(expected);
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

describe('REOPEN_SCORECARD', () => {
  // #2220: gjenåpningen bruker webbens ord på knappen, i bekreftelsen og i
  // kvitteringen. Resten er appens egne setninger.
  it('bruker webbens ord for knappen, bekreftelsen og kvitteringen', () => {
    expect(REOPEN_SCORECARD.label).toBe(source.admin.game.buttons.reopenScorecard);
    expect(reopenConfirmBody('Ola')).toBe(
      source.admin.game.buttons.reopenScorecardConfirm.replace('{name}', 'Ola'),
    );
    expect(REOPEN_SCORECARD.done).toBe(
      source.game.players.statusMessages.scorecard_reopened,
    );
  });

  it('har ferdige setninger i appens egne tekster', () => {
    for (const text of [
      REOPEN_SCORECARD.confirmTitle,
      reopenHint(true),
      reopenHint(false),
    ]) {
      expect(isFinishedSentence(text)).toBe(true);
    }
    expect(reopenHint(true)).not.toBe(reopenHint(false));
  });
});
