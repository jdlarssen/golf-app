// native/app/src/lib/wizardPayload.test.ts
// Kontrakt-porten mellom appens veiviser og webbens payload-bygger.
//
// Hele N6a hviler på at appen IKKE bygger sin egen `mode_config`. Byggeren er
// delt kode; det eneste appen eier er feltnavnene den fyller inn. Denne fila
// kjører derfor shim + delt bygger for hver av modiene appen lager og krever
// webbens payload-fasong tilbake — med riktig `kind`, riktig lagfordeling og
// `errorCode` udefinert.
//
// Blir én av dem rød, er det ikke testen som er feil: da har et feltnavn eller
// en regel driftet, og et spill opprettet i appen ville fått en annen rad enn
// det samme spillet opprettet på nettsiden.
import { buildGameInsertPayload, parsePrizesFromFormData } from '../../../../lib/games/gamePayload';
import { parseSideTournamentFromFormData } from '../../../../lib/games/sideTournamentPayload';
import {
  emptyPrizeDraft,
  prizeFieldName,
  type PrizeDraft,
  type PrizeSlotKey,
} from '../../../../lib/games/prizes';
import { isMatchplayFamily } from '../../../../lib/scoring/modes/types';
import { APP_SUPPORTED_MODES, type AppGameMode } from './appFormats';
import {
  buildDraftPayload,
  draftNeedsTeamAssignment,
  draftToFormData,
  isParStableford,
  resolveRegistration,
  rosterForRegistration,
  teeOffInstant,
  type DraftPlayer,
  type GameDraft,
} from './wizardPayload';
import { WizardFormData, asSharedFormData } from './wizardFormData';

const COURSE = 'course-1';
const TEE = 'tee-1';

function solo(...ids: string[]): DraftPlayer[] {
  return ids.map((userId) => ({ userId, teeGender: 'M', teamNumber: null }));
}

function teamed(...pairs: [string, number][]): DraftPlayer[] {
  return pairs.map(([userId, teamNumber]) => ({
    userId,
    teeGender: 'M',
    teamNumber,
  }));
}

function draft(over: Partial<GameDraft> & { gameMode: AppGameMode }): GameDraft {
  return {
    name: 'Torsdagsrunden',
    courseId: COURSE,
    teeBoxId: TEE,
    teeOffAt: '2026-09-01T07:00:00.000Z',
    players: solo('a'),
    ...over,
  };
}

/** Modiene appen lager, med en roster som faktisk er publiserbar for hver. */
const CASES: {
  mode: AppGameMode;
  draft: GameDraft;
  modeConfig: Record<string, unknown>;
  players: { user_id: string; team_number: number | null; flight_number: number | null }[];
}[] = [
  {
    mode: 'stableford',
    draft: draft({ gameMode: 'stableford', players: solo('a', 'b', 'c') }),
    modeConfig: { kind: 'stableford', team_size: 1, points_table: 'standard' },
    players: [
      { user_id: 'a', team_number: null, flight_number: null },
      { user_id: 'b', team_number: null, flight_number: null },
      { user_id: 'c', team_number: null, flight_number: null },
    ],
  },
  {
    mode: 'modified_stableford',
    draft: draft({ gameMode: 'modified_stableford', players: solo('a', 'b') }),
    modeConfig: {
      kind: 'modified_stableford',
      team_size: 1,
      points_table: 'modified',
    },
    players: [
      { user_id: 'a', team_number: null, flight_number: null },
      { user_id: 'b', team_number: null, flight_number: null },
    ],
  },
  {
    mode: 'singles_matchplay',
    draft: draft({
      gameMode: 'singles_matchplay',
      players: teamed(['a', 1], ['b', 2]),
    }),
    modeConfig: { kind: 'singles_matchplay', team_size: 1, teams_count: 2 },
    players: [
      { user_id: 'a', team_number: 1, flight_number: 1 },
      { user_id: 'b', team_number: 2, flight_number: 2 },
    ],
  },
  {
    mode: 'best_ball',
    draft: draft({
      gameMode: 'best_ball',
      players: teamed(['a', 1], ['b', 2], ['c', 1], ['d', 2]),
    }),
    modeConfig: { kind: 'best_ball', team_size: 2, teams_count: 2 },
    // Sortert på lag, og flight fra webbens default (lag 1+2 → flight 1).
    players: [
      { user_id: 'a', team_number: 1, flight_number: 1 },
      { user_id: 'c', team_number: 1, flight_number: 1 },
      { user_id: 'b', team_number: 2, flight_number: 1 },
      { user_id: 'd', team_number: 2, flight_number: 1 },
    ],
  },
  {
    mode: 'greensome_matchplay',
    draft: draft({
      gameMode: 'greensome_matchplay',
      players: teamed(['a', 1], ['b', 1], ['c', 2], ['d', 2]),
    }),
    modeConfig: {
      kind: 'greensome_matchplay',
      team_size: 2,
      teams_count: 2,
      allowance_pct: 100,
    },
    players: [
      { user_id: 'a', team_number: 1, flight_number: 1 },
      { user_id: 'b', team_number: 1, flight_number: 1 },
      { user_id: 'c', team_number: 2, flight_number: 2 },
      { user_id: 'd', team_number: 2, flight_number: 2 },
    ],
  },
  {
    mode: 'wolf',
    // #969: ingen lag ved publisering — slottene trekkes ved start.
    draft: draft({ gameMode: 'wolf', players: solo('a', 'b', 'c', 'd') }),
    modeConfig: {
      kind: 'wolf',
      team_size: 1,
      teams_count: 4,
      wolf_scoring: 'net',
    },
    players: [
      { user_id: 'a', team_number: null, flight_number: null },
      { user_id: 'b', team_number: null, flight_number: null },
      { user_id: 'c', team_number: null, flight_number: null },
      { user_id: 'd', team_number: null, flight_number: null },
    ],
  },
  {
    mode: 'bingo_bango_bongo',
    draft: draft({
      gameMode: 'bingo_bango_bongo',
      players: solo('a', 'b', 'c'),
    }),
    modeConfig: { kind: 'bingo_bango_bongo', team_size: 1 },
    players: [
      { user_id: 'a', team_number: null, flight_number: null },
      { user_id: 'b', team_number: null, flight_number: null },
      { user_id: 'c', team_number: null, flight_number: null },
    ],
  },
  {
    mode: 'skins',
    draft: draft({ gameMode: 'skins', players: solo('a', 'b', 'c') }),
    modeConfig: { kind: 'skins', team_size: 1, skins_scoring: 'net' },
    players: [
      { user_id: 'a', team_number: null, flight_number: null },
      { user_id: 'b', team_number: null, flight_number: null },
      { user_id: 'c', team_number: null, flight_number: null },
    ],
  },
  // #2755: Nassau, netto som standard og brutto når arrangøren velger det.
  {
    mode: 'nassau',
    draft: draft({ gameMode: 'nassau', players: solo('a', 'b', 'c', 'd') }),
    modeConfig: { kind: 'nassau', team_size: 1, nassau_scoring: 'net' },
    players: [
      { user_id: 'a', team_number: null, flight_number: null },
      { user_id: 'b', team_number: null, flight_number: null },
      { user_id: 'c', team_number: null, flight_number: null },
      { user_id: 'd', team_number: null, flight_number: null },
    ],
  },
  {
    mode: 'nassau',
    draft: draft({
      gameMode: 'nassau',
      players: solo('a', 'b', 'c', 'd'),
      setup: { nassauScoring: 'gross' },
    }),
    modeConfig: { kind: 'nassau', team_size: 1, nassau_scoring: 'gross' },
    players: [
      { user_id: 'a', team_number: null, flight_number: null },
      { user_id: 'b', team_number: null, flight_number: null },
      { user_id: 'c', team_number: null, flight_number: null },
      { user_id: 'd', team_number: null, flight_number: null },
    ],
  },
  // #2753 D3: samme mode_config som nettets egne tester (`strokeplayFd` og
  // `patsomeFd` i lib/games/gamePayload.test.ts).
  {
    mode: 'solo_strokeplay',
    draft: draft({ gameMode: 'solo_strokeplay', players: solo('a', 'b') }),
    modeConfig: { kind: 'solo_strokeplay', team_size: 1 },
    players: [
      { user_id: 'a', team_number: null, flight_number: null },
      { user_id: 'b', team_number: null, flight_number: null },
    ],
  },
  {
    mode: 'patsome',
    draft: draft({
      gameMode: 'patsome',
      players: teamed(['a', 1], ['b', 1], ['c', 2], ['d', 2]),
    }),
    modeConfig: { kind: 'patsome', team_size: 2, teams_count: 2, patsome_scoring: 'net' },
    // flight = lag (DB-sjekken game_players_team_flight_consistency).
    players: [
      { user_id: 'a', team_number: 1, flight_number: 1 },
      { user_id: 'b', team_number: 1, flight_number: 1 },
      { user_id: 'c', team_number: 2, flight_number: 2 },
      { user_id: 'd', team_number: 2, flight_number: 2 },
    ],
  },
  // #2753 D3b: med nettets standarder, samme mode_config som nettets
  // `texasFd`/`ambroseFd`/`floridaFd`/`shambleFd` gir for samme valg.
  {
    mode: 'texas_scramble',
    draft: draft({
      gameMode: 'texas_scramble',
      players: teamed(['a', 1], ['b', 1], ['c', 2], ['d', 2]),
      setup: { teamSize: 2 },
    }),
    modeConfig: { kind: 'texas_scramble', team_size: 2, teams_count: 2, team_handicap_pct: 25 },
    players: [
      { user_id: 'a', team_number: 1, flight_number: 1 },
      { user_id: 'b', team_number: 1, flight_number: 1 },
      { user_id: 'c', team_number: 2, flight_number: 2 },
      { user_id: 'd', team_number: 2, flight_number: 2 },
    ],
  },
  {
    mode: 'ambrose',
    draft: draft({
      gameMode: 'ambrose',
      players: teamed(['a', 1], ['b', 1], ['c', 2], ['d', 2]),
      setup: { teamSize: 2 },
    }),
    modeConfig: { kind: 'ambrose', team_size: 2, teams_count: 2, team_handicap_pct: 25 },
    players: [
      { user_id: 'a', team_number: 1, flight_number: 1 },
      { user_id: 'b', team_number: 1, flight_number: 1 },
      { user_id: 'c', team_number: 2, flight_number: 2 },
      { user_id: 'd', team_number: 2, flight_number: 2 },
    ],
  },
  {
    mode: 'florida_scramble',
    // Standarden: tremannslag og 15 % av summen.
    draft: draft({
      gameMode: 'florida_scramble',
      players: teamed(['a', 1], ['b', 1], ['c', 1], ['d', 2], ['e', 2], ['f', 2]),
    }),
    modeConfig: { kind: 'florida_scramble', team_size: 3, teams_count: 2, team_handicap_pct: 15 },
    players: [
      { user_id: 'a', team_number: 1, flight_number: 1 },
      { user_id: 'b', team_number: 1, flight_number: 1 },
      { user_id: 'c', team_number: 1, flight_number: 1 },
      { user_id: 'd', team_number: 2, flight_number: 2 },
      { user_id: 'e', team_number: 2, flight_number: 2 },
      { user_id: 'f', team_number: 2, flight_number: 2 },
    ],
  },
  {
    mode: 'shamble',
    // Standarden: firemannslag, shamble, to teller, netto.
    draft: draft({
      gameMode: 'shamble',
      players: teamed(['a', 1], ['b', 1], ['c', 1], ['d', 1], ['e', 2], ['f', 2], ['g', 2], ['h', 2]),
    }),
    modeConfig: {
      kind: 'shamble',
      team_size: 4,
      teams_count: 2,
      shamble_variant: 'shamble',
      shamble_count: 2,
      shamble_scoring: 'net',
    },
    players: [
      { user_id: 'a', team_number: 1, flight_number: 1 },
      { user_id: 'b', team_number: 1, flight_number: 1 },
      { user_id: 'c', team_number: 1, flight_number: 1 },
      { user_id: 'd', team_number: 1, flight_number: 1 },
      { user_id: 'e', team_number: 2, flight_number: 2 },
      { user_id: 'f', team_number: 2, flight_number: 2 },
      { user_id: 'g', team_number: 2, flight_number: 2 },
      { user_id: 'h', team_number: 2, flight_number: 2 },
    ],
  },
];

describe('scramble-familien og shamble (#2753 D3b)', () => {
  const four = teamed(['a', 1], ['b', 1], ['c', 1], ['d', 1], ['e', 2], ['f', 2], ['g', 2], ['h', 2]);

  it('Texas uten valg starter på nettets standard: firemannslag, 10 % av summen', () => {
    const cfg = buildDraftPayload(draft({ gameMode: 'texas_scramble', players: four })).payload.mode_config;
    expect(cfg).toMatchObject({ team_size: 4, team_handicap_pct: 10 });
  });

  it('Ambrose tremannslag bruker Ambrose-formelen', () => {
    const six = teamed(['a', 1], ['b', 1], ['c', 1], ['d', 2], ['e', 2], ['f', 2]);
    const cfg = buildDraftPayload(draft({ gameMode: 'ambrose', players: six, setup: { teamSize: 3 } })).payload
      .mode_config as { team_handicap_pct: number };
    expect(cfg.team_handicap_pct).toBeCloseTo(100 / 6, 2);
  });

  it('valgt lag-handicap og brutto bæres videre', () => {
    const gross = buildDraftPayload(
      draft({ gameMode: 'texas_scramble', players: four, setup: { teamHandicapSumPct: 0 } }),
    ).payload;
    expect(gross.errorCode).toBeUndefined();
    expect(gross.mode_config).toMatchObject({ team_handicap_pct: 0 });
  });

  it('champagne med tre som teller og brutto', () => {
    const cfg = buildDraftPayload(
      draft({
        gameMode: 'shamble',
        players: four,
        setup: { shambleVariant: 'champagne', shambleCount: 3, shambleScoring: 'gross' },
      }),
    ).payload.mode_config;
    expect(cfg).toMatchObject({ shamble_variant: 'champagne', shamble_count: 3, shamble_scoring: 'gross' });
  });

  it('Florida med par gir nettets unsupported_mode_size_combo', () => {
    const pairs = teamed(['a', 1], ['b', 1], ['c', 2], ['d', 2]);
    const result = buildDraftPayload(draft({ gameMode: 'florida_scramble', players: pairs, setup: { teamSize: 2 } }));
    expect(result.payload.errorCode).toBe('unsupported_mode_size_combo');
  });

  it('ujevne lag gir nettets team_balance', () => {
    const uneven = teamed(['a', 1], ['b', 1], ['c', 1], ['d', 1], ['e', 2], ['f', 2]);
    expect(buildDraftPayload(draft({ gameMode: 'texas_scramble', players: uneven })).payload.errorCode).toBe(
      'team_balance',
    );
  });

  // Som best ball (webbens skjema): en spiller uten lag kommer ikke med, og
  // oppsummeringen sier fra (`draftNeedsTeamAssignment`, `describeMissingTeams`).
  it('en spiller uten lag kommer ikke med, og lag-modusen krever tildeling', () => {
    const missing = [...teamed(['a', 1], ['b', 1], ['c', 2], ['d', 2]), { userId: 'e', teeGender: 'M' as const, teamNumber: null }];
    const input = draft({ gameMode: 'texas_scramble', players: missing, setup: { teamSize: 2 } });
    expect(buildDraftPayload(input).payload.players.map((p) => p.user_id)).not.toContain('e');
    expect(draftNeedsTeamAssignment(input)).toBe(true);
  });

  it('et lag-handicap over hele snittet gir nettets bad_allowance', () => {
    const result = buildDraftPayload(
      draft({ gameMode: 'texas_scramble', players: four, setup: { teamHandicapSumPct: 40 } }),
    );
    expect(result.payload.errorCode).toBe('bad_allowance');
  });
});

describe('de nye formatene i D3 (#2753)', () => {
  it('Patsome med brutto bærer valget videre', () => {
    const input = draft({
      gameMode: 'patsome',
      players: teamed(['a', 1], ['b', 1], ['c', 2], ['d', 2]),
      setup: { patsomeScoring: 'gross' },
    });
    expect(buildDraftPayload(input).payload.mode_config).toMatchObject({ patsome_scoring: 'gross' });
  });

  it('Patsome med et lag på tre gir nettets team_balance', () => {
    const input = draft({
      gameMode: 'patsome',
      players: teamed(['a', 1], ['b', 1], ['c', 1], ['d', 2]),
    });
    expect(buildDraftPayload(input).payload.errorCode).toBe('team_balance');
  });

  it('Patsome med tre spillere gir nettets min_players_for_mode', () => {
    const input = draft({ gameMode: 'patsome', players: teamed(['a', 1], ['b', 1], ['c', 2]) });
    expect(buildDraftPayload(input).payload.errorCode).toBe('min_players_for_mode');
  });

  // #2755: spillergrensene er nettets (`START_COUNT_RANGES.nassau`, 2–16).
  it('Nassau med én spiller gir nettets min_players_for_mode', () => {
    expect(
      buildDraftPayload(draft({ gameMode: 'nassau', players: solo('a') })).payload.errorCode,
    ).toBe('min_players_for_mode');
  });

  it('Nassau med 17 spillere gir nettets too_many_players_for_mode', () => {
    const ids = Array.from({ length: 17 }, (_, i) => `p${i}`);
    expect(
      buildDraftPayload(draft({ gameMode: 'nassau', players: solo(...ids) })).payload.errorCode,
    ).toBe('too_many_players_for_mode');
  });

  it('Nassau med 2 og 16 spillere publiserer uten feilkode', () => {
    const ids = Array.from({ length: 16 }, (_, i) => `p${i}`);
    expect(buildDraftPayload(draft({ gameMode: 'nassau', players: solo('a', 'b') })).payload.errorCode).toBeUndefined();
    expect(buildDraftPayload(draft({ gameMode: 'nassau', players: solo(...ids) })).payload.errorCode).toBeUndefined();
  });

  it('slagspill uten spillere gir nettets min_players_for_mode', () => {
    expect(buildDraftPayload(draft({ gameMode: 'solo_strokeplay', players: [] })).payload.errorCode).toBe(
      'min_players_for_mode',
    );
  });

  it('slagspill med brutto lagrer andelen 0, som på nettet', () => {
    const input = draft({ gameMode: 'solo_strokeplay', players: solo('a'), hcpAllowancePct: 0 });
    expect(buildDraftPayload(input).payload.hcp_allowance_pct).toBe(0);
  });
});

describe('payload-paritet for alle modiene appen lager', () => {
  it('dekker nøyaktig APP_SUPPORTED_MODES', () => {
    expect([...new Set(CASES.map((c) => c.mode))].sort()).toEqual([...APP_SUPPORTED_MODES].sort());
  });

  it.each(CASES)('$mode publiserer uten feilkode', ({ draft: input }) => {
    expect(buildDraftPayload(input).payload.errorCode).toBeUndefined();
  });

  it.each(CASES)('$mode gir riktig mode_config', ({ draft: input, modeConfig }) => {
    expect(buildDraftPayload(input).payload.mode_config).toEqual(modeConfig);
  });

  it.each(CASES)('$mode gir riktige spiller-rader', ({ draft: input, players }) => {
    expect(buildDraftPayload(input).payload.players).toEqual(players);
  });

  it.each(CASES)('$mode gir webbens base-felter', ({ draft: input, mode }) => {
    const { payload } = buildDraftPayload(input);
    expect(payload).toMatchObject({
      name: 'Torsdagsrunden',
      course_id: COURSE,
      tee_box_id: TEE,
      game_mode: mode,
      hcp_allowance_pct: 100,
      require_peer_approval: false,
      score_visibility: 'live',
      // Utenfor v1 — skal falle til webbens defaults, ikke til noe appen fant på.
      entry_fee_kr: 0,
      payment_link: null,
      registration_mode: 'invite_only',
      registration_type: 'solo',
      let_friends_skip_gate: false,
    });
  });
});

describe('shimmen mater den delte byggeren', () => {
  // Den ene antakelsen castet i `asSharedFormData` hviler på: byggeren leser
  // kun `get()` og `getAll()` (#2210 la til `getAll('unassigned_player_id')`).
  // Kalles den med en shim som IKKE har de andre metodene, og den likevel gir
  // samme payload, er antakelsen bevist og ikke bare påstått.
  it('gir samme payload som et rått get()/getAll()-objekt', () => {
    const input = draft({ gameMode: 'stableford', players: solo('a', 'b') });
    const fields = draftToFormData(input).toObject();
    const readOnly = {
      get: (name: string): string | null => fields[name] ?? null,
      getAll: (name: string): string[] =>
        name in fields ? [fields[name]!] : [],
    } as unknown as FormData;

    expect(buildGameInsertPayload(readOnly, 'publish')).toEqual(
      buildDraftPayload(input).payload,
    );
  });

  it('lagrer verdier som strenger, og null sletter feltet', () => {
    const form = new WizardFormData();
    form.set('side_ld_count', 2).set('side_tournament_enabled', true);
    expect(form.get('side_ld_count')).toBe('2');
    expect(form.get('side_tournament_enabled')).toBe('true');

    form.set('side_ld_count', null);
    expect(form.get('side_ld_count')).toBeNull();
    expect(form.has('side_ld_count')).toBe(false);
    expect(form.getAll('side_tournament_enabled')).toEqual(['true']);
  });
});

describe('feltnavn webben er fasit for', () => {
  it('bruker checkbox-semantikk («on») for makker-godkjenning', () => {
    const off = draftToFormData(draft({ gameMode: 'stableford' }));
    expect(off.get('require_peer_approval')).toBeNull();

    const on = draftToFormData(
      draft({ gameMode: 'stableford', requirePeerApproval: true }),
    );
    expect(on.get('require_peer_approval')).toBe('on');
    expect(
      buildGameInsertPayload(asSharedFormData(on), 'publish').require_peer_approval,
    ).toBe(true);
  });

  it('nøkler tee-kjønn på bruker-id og spiller-slots på indeks', () => {
    const form = draftToFormData(
      draft({
        gameMode: 'singles_matchplay',
        players: [
          { userId: 'u-1', teeGender: 'D', teamNumber: 1 },
          { userId: 'u-2', teeGender: 'J', teamNumber: 2 },
        ],
      }),
    );
    expect(form.get('player_0_id')).toBe('u-1');
    expect(form.get('player_1_id')).toBe('u-2');
    expect(form.get('player_u-1_gender')).toBe('D');
    expect(form.get('player_u-2_gender')).toBe('J');
  });

  it('slår sideturneringens tellere av når bryteren står av', () => {
    const form = draftToFormData(
      draft({
        gameMode: 'stableford',
        sideTournamentEnabled: false,
        sideLdCount: 2,
        sideCtpCount: 1,
      }),
    );
    expect(form.get('side_tournament_enabled')).toBe('false');
    expect(form.get('side_ld_count')).toBe('0');
    expect(form.get('side_ctp_count')).toBe('0');
  });

  it('bærer LD-/CTP-tellerne når bryteren står på', () => {
    const form = draftToFormData(
      draft({
        gameMode: 'stableford',
        sideTournamentEnabled: true,
        sideLdCount: 1,
        sideCtpCount: 2,
      }),
    );
    expect(form.get('side_tournament_enabled')).toBe('true');
    expect(form.get('side_ld_count')).toBe('1');
    expect(form.get('side_ctp_count')).toBe('2');
  });
});

describe('lag-tildeling', () => {
  // Web-paritet: `orderedPayload` dropper spillere uten lag i en lag-modus.
  // Å sende dem med tom lag-verdi ville gitt `bad_team` for HELE spillet.
  it('dropper en spiller uten lag i en lag-modus i stedet for å feile', () => {
    const { payload } = buildDraftPayload(
      draft({
        gameMode: 'best_ball',
        players: [
          ...teamed(['a', 1], ['b', 1], ['c', 2], ['d', 2]),
          { userId: 'e', teeGender: 'M', teamNumber: null },
        ],
      }),
    );
    expect(payload.errorCode).toBeUndefined();
    expect(payload.players.map((p) => p.user_id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('beholder alle spillere i wolf, uten lagnummer', () => {
    const { payload } = buildDraftPayload(
      draft({
        gameMode: 'wolf',
        players: teamed(['a', 1], ['b', 2], ['c', 1]),
      }),
    );
    expect(payload.players).toEqual([
      { user_id: 'a', team_number: null, flight_number: null },
      { user_id: 'b', team_number: null, flight_number: null },
      { user_id: 'c', team_number: null, flight_number: null },
    ]);
  });
});

describe('oppsett-feltene', () => {
  it('par-stableford får lag og flight', () => {
    const { payload } = buildDraftPayload(
      draft({
        gameMode: 'stableford',
        players: teamed(['a', 1], ['b', 1], ['c', 2], ['d', 2]),
        setup: { stablefordTeamSize: 2 },
      }),
    );
    expect(payload.mode_config).toEqual({
      kind: 'stableford',
      team_size: 2,
      points_table: 'standard',
    });
    expect(payload.players).toEqual([
      { user_id: 'a', team_number: 1, flight_number: 1 },
      { user_id: 'b', team_number: 1, flight_number: 1 },
      { user_id: 'c', team_number: 2, flight_number: 2 },
      { user_id: 'd', team_number: 2, flight_number: 2 },
    ]);
  });

  it('brutto-toggle og kroner per enhet når de er satt', () => {
    const { payload } = buildDraftPayload(
      draft({
        gameMode: 'skins',
        players: solo('a', 'b'),
        setup: { skinsScoring: 'gross', krPerUnit: 50 },
      }),
    );
    expect(payload.mode_config).toEqual({
      kind: 'skins',
      team_size: 1,
      skins_scoring: 'gross',
      kr_per_unit: 50,
    });
  });

  it('greensome-andelen kan settes ned fra 100', () => {
    const { payload } = buildDraftPayload(
      draft({
        gameMode: 'greensome_matchplay',
        players: teamed(['a', 1], ['b', 1], ['c', 2], ['d', 2]),
        setup: { greensomeAllowancePct: 90 },
      }),
    );
    expect(payload.mode_config).toMatchObject({ allowance_pct: 90 });
  });
});

describe('teeOffInstant — regresjonsvakt for tee-off-en som ble lagret en time feil', () => {
  // Feilen (simulator 2026-08-31): pickerens Date gikk om en veggklokke-streng
  // og inn i webbens `parseOsloDateTimeLocal`, som avgjoer sommer-/vintertid ved
  // aa STRENG-SAMMENLIGNE Intl-utdata mot 'GMT+2'. Under Hermes slaar ikke den
  // sammenligningen til, saa en august-dato fikk vintertidens +01:00.
  //
  // ⚠️ Den FOERSTE utgaven av denne vakten var verdiloes: den asserterte
  // `teeOffInstant(d) === d.toISOString()`, som er en identitet, og paa en norsk
  // maskin er lokaltid == Oslo-veggklokke, saa selv en gjeninnfoert
  // Oslo-konvertering ga samme svar. Evaluatoren gjeninnfoerte feilen og alle
  // 499 testene forble groenne. Vakten maatte derfor gjoeres om helt:
  //   1. `jest.config.js` pinner TZ=UTC, saa lokaltid og Oslo IKKE er samme tall.
  //   2. Vi gaar gjennom den EKTE payload-veien, ikke bare helperen.
  //   3. En strukturell sjekk forbyr importen uansett tidssone.
  it('pinner TZ=UTC, ellers kan ikke vakten under skille de to', () => {
    // Uten dette er resten av denne describe-blokka teater.
    expect(new Date(2026, 7, 31, 23, 0).toISOString()).toBe('2026-08-31T23:00:00.000Z');
  });

  it.each([
    ['sommertid (CEST — feilen bommet her)', new Date(2026, 7, 31, 23, 0)],
    ['vintertid (CET)', new Date(2026, 11, 24, 14, 30)],
  ])('skriver pickerens eget oeyeblikk til scheduled_tee_off_at (%s)', (_n, picked: Date) => {
    const form = draftToFormData(draft({ gameMode: 'stableford', teeOffAt: teeOffInstant(picked) }));
    // Verdien som faktisk naar `games.scheduled_tee_off_at`. En gjeninnfoert
    // Oslo-konvertering forskyver denne med en eller to timer under TZ=UTC.
    expect(form.get('scheduled_tee_off_at')).toBe(picked.toISOString());
  });

  it('verken payload-laget eller datalaget IMPORTERER webbens Oslo-parser', () => {
    // Strukturell og tidssone-uavhengig: selve importen ER feilen. Holder selv
    // om noen skulle fjerne TZ-pinningen over.
    //
    // Vi matcher import-setningen, ikke navnet: begge filene OMTALER helperen i
    // kommentarer nettopp for aa forklare hvorfor den ikke skal brukes, og en
    // naiv `toContain` ville gjort de forklaringene ulovlige.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    for (const rel of ['./wizardPayload.ts', '../data/createGame.ts']) {
      const src = fs.readFileSync(require.resolve(rel), 'utf8');
      const importsIt = /import\s*(type\s*)?\{[^}]*\bparseOsloDateTimeLocal\b[^}]*\}/s.test(src);
      expect({ file: rel, importsOsloParser: importsIt }).toEqual({
        file: rel,
        importsOsloParser: false,
      });
    }
  });
});

describe('lekkasje av stablefordTeamSize paa tvers av format-bytte', () => {
  // Evaluator-funn i #1854. Veiviseren lar arrangoeren gaa tilbake til steg 1 og
  // bytte format etter aa ha vaert innom oppsettet. `stablefordTeamSize: 2`
  // («Par») ble haengende ved, og siden regelen den gang bare spurte
  // «er team_size 2?» — uten aa spoerre HVILKET format — trodde wolf, skins og
  // BBB at de var lag-modi. `orderedSlots` DROPPER spillere uten lagtildeling i
  // en lag-modus, saa payloaden ble TOM: publisering doede med
  // «Formatet trenger flere spillere» mens tre spillere sto valgt. Feltet har
  // ingen UI utenfor stableford-familien, saa arrangoeren kunne ikke angre.
  const LEAKED = { stablefordTeamSize: 2 } as const;

  it.each(['wolf', 'skins', 'bingo_bango_bongo', 'singles_matchplay', 'best_ball'] as const)(
    'isParStableford er false for %s selv med team_size 2',
    (mode) => {
      expect(isParStableford(mode, LEAKED)).toBe(false);
    },
  );

  it.each(['stableford', 'modified_stableford'] as const)(
    'isParStableford er true for %s med team_size 2',
    (mode) => {
      expect(isParStableford(mode, LEAKED)).toBe(true);
    },
  );

  it.each(['wolf', 'skins', 'bingo_bango_bongo'] as const)(
    '%s krever ikke lagtildeling selv med lekket team_size',
    (mode) => {
      expect(
        draftNeedsTeamAssignment(draft({ gameMode: mode, setup: LEAKED })),
      ).toBe(false);
    },
  );

  it('wolf beholder ALLE spillerne selv med lekket team_size', () => {
    // Kjernen i feilen: dette var 0 spillere foer fiksen.
    const payload = buildDraftPayload(
      draft({ gameMode: 'wolf', players: solo('a', 'b', 'c'), setup: LEAKED }),
    ).payload;
    expect(payload.errorCode).toBeUndefined();
    expect(payload.players).toHaveLength(3);
    expect(payload.players.every((p) => p.team_number === null)).toBe(true);
  });
});

describe('best ball-flight for lag 3 og 4', () => {
  // Webbens default (`useGameFormState.ts`): lag 1-2 spiller i flight 1, lag 3-4
  // i flight 2. Staging-runden brukte bare to lag, saa den oevre halvdelen av
  // regelen var uproevd — evaluator-funn i #1854.
  it('legger lag 3 og 4 i flight 2', () => {
    const payload = buildDraftPayload(
      draft({
        gameMode: 'best_ball',
        players: [
          { userId: 'a', teeGender: 'M', teamNumber: 1 },
          { userId: 'b', teeGender: 'M', teamNumber: 1 },
          { userId: 'c', teeGender: 'M', teamNumber: 2 },
          { userId: 'd', teeGender: 'M', teamNumber: 2 },
          { userId: 'e', teeGender: 'M', teamNumber: 3 },
          { userId: 'f', teeGender: 'M', teamNumber: 3 },
          { userId: 'g', teeGender: 'M', teamNumber: 4 },
          { userId: 'h', teeGender: 'M', teamNumber: 4 },
        ],
      }),
    ).payload;
    expect(payload.errorCode).toBeUndefined();
    expect(
      payload.players.map((p) => [p.team_number, p.flight_number]),
    ).toEqual([[1, 1], [1, 1], [2, 1], [2, 1], [3, 2], [3, 2], [4, 2], [4, 2]]);
  });
});

// #2148: best ball tar opptil 20 par, og standard-flighten er to par per flight,
// samme regel som nettsiden (`defaultFlightForTeam`).
describe('best ball med flere enn fire par (#2148)', () => {
  it('12 spillere i seks par gir flight 1, 1, 2, 2, 3, 3 per par, og alle 12 er med', () => {
    const pairs: [string, number][] = Array.from({ length: 12 }, (_, i) => [
      `p${i}`,
      Math.floor(i / 2) + 1,
    ]);
    const { payload } = buildDraftPayload(draft({ gameMode: 'best_ball', players: teamed(...pairs) }));
    expect(payload.errorCode).toBeUndefined();
    expect(payload.players).toHaveLength(12);
    expect(payload.players.map((p) => [p.team_number, p.flight_number])).toEqual([
      [1, 1], [1, 1], [2, 1], [2, 1], [3, 2], [3, 2],
      [4, 2], [4, 2], [5, 3], [5, 3], [6, 3], [6, 3],
    ]);
  });

  it('40 spillere i 20 par bygges uten feil, med flight 10 på par 20', () => {
    const pairs: [string, number][] = Array.from({ length: 40 }, (_, i) => [
      `p${i}`,
      Math.floor(i / 2) + 1,
    ]);
    const { payload } = buildDraftPayload(draft({ gameMode: 'best_ball', players: teamed(...pairs) }));
    expect(payload.errorCode).toBeUndefined();
    expect(payload.players).toHaveLength(40);
    expect(payload.players.at(-1)).toMatchObject({ team_number: 20, flight_number: 10 });
  });
});

// #2749 PR B: kontingent, betalingslenke og premiebord fra appens veiviser, gjennom
// de samme delte parserne som `data/createGame.ts` kaller.
describe('kontingent og premiebord', () => {
  const prizes = (filled: Partial<Record<PrizeSlotKey, [string, string?]>>): PrizeDraft => {
    const out = emptyPrizeDraft();
    for (const [key, [description, sponsor]] of Object.entries(filled) as [PrizeSlotKey, [string, string?]][]) {
      out[key] = { description, sponsor: sponsor ?? '', sponsorLogoPath: '' };
    }
    return out;
  };

  /** Det `createGame.ts` gjør: den delte byggeren og premie-parseren med spillets form. */
  function saved(d: GameDraft) {
    const { form, payload } = buildDraftPayload(d);
    const side = parseSideTournamentFromFormData(asSharedFormData(form));
    if (!side.ok) throw new Error(side.errorCode);
    return {
      payload,
      prizes: parsePrizesFromFormData(asSharedFormData(form), {
        hasPodium: !isMatchplayFamily(payload.game_mode),
        ldCount: side.payload.ldCount,
        ctpCount: side.payload.ctpCount,
      }),
    };
  }

  it('250 kr, lenke og to premier gir de samme kolonnene som nettet', () => {
    const { payload, prizes: rows } = saved(
      draft({
        gameMode: 'stableford',
        entryFeeKr: 250,
        paymentLink: ' https://vipps.no/betal ',
        prizes: prizes({ placement_1: ['Middag for to', 'Byneset Sport'], placement_2: ['Tolv baller'] }),
      }),
    );
    expect(payload.errorCode).toBeUndefined();
    expect(payload.entry_fee_kr).toBe(250);
    expect(payload.payment_link).toBe('https://vipps.no/betal');
    expect(rows).toEqual([
      { category: 'placement', position: 1, description: 'Middag for to', sponsor: 'Byneset Sport', sponsorLogoPath: null },
      { category: 'placement', position: 2, description: 'Tolv baller', sponsor: null, sponsorLogoPath: null },
    ]);
  });

  it('kontingent 0 lagrer ingen lenke', () => {
    const { payload } = saved(draft({ gameMode: 'stableford', entryFeeKr: 0, paymentLink: '12345' }));
    expect(payload.entry_fee_kr).toBe(0);
    expect(payload.payment_link).toBeNull();
  });

  it('uten feltene er alt som før: 0 kr, ingen lenke, tomt premiebord', () => {
    const { payload, prizes: rows } = saved(draft({ gameMode: 'stableford' }));
    expect(payload.entry_fee_kr).toBe(0);
    expect(payload.payment_link).toBeNull();
    expect(rows).toEqual([]);
  });

  it('matchplay dropper pallplassene', () => {
    const { prizes: rows } = saved(
      draft({
        gameMode: 'singles_matchplay',
        players: teamed(['a', 1], ['b', 2]),
        sideTournamentEnabled: true,
        sideLdCount: 1,
        prizes: prizes({ placement_1: ['Gavekort'], ld_1: ['Ny hanske'] }),
      }),
    );
    expect(rows.map((p) => `${p.category}:${p.position}`)).toEqual(['longest_drive:1']);
  });

  it('LD over antallet hull, og LD uten sideturnering, dropper', () => {
    const filled = prizes({ ld_1: ['Ny hanske', 'Kafé Fjorden'], ld_2: ['Baller'] });
    const one = saved(draft({ gameMode: 'stableford', sideTournamentEnabled: true, sideLdCount: 1, prizes: filled }));
    expect(one.prizes).toEqual([
      { category: 'longest_drive', position: 1, description: 'Ny hanske', sponsor: 'Kafé Fjorden', sponsorLogoPath: null },
    ]);
    const off = saved(draft({ gameMode: 'stableford', sideTournamentEnabled: false, sideLdCount: 2, prizes: filled }));
    expect(off.prizes).toEqual([]);
  });

  it('logo-feltet er alltid tomt fra appen', () => {
    const form = draftToFormData(
      draft({ gameMode: 'stableford', prizes: { ...prizes({ placement_1: ['Gavekort'] }), placement_1: { description: 'Gavekort', sponsor: '', sponsorLogoPath: 'u/x.webp' } } }),
    );
    expect(form.get(prizeFieldName('placement_1', 'logo'))).toBe('');
  });
});

describe('påmeldingen (#2840 del 4)', () => {
  it('sender valgt påmelding og type, som nettets veiviser', () => {
    const input = draft({
      gameMode: 'texas_scramble',
      players: [],
      registrationMode: 'open',
      registrationType: 'team',
    });
    const form = draftToFormData(input);
    expect(form.get('registration_mode')).toBe('open');
    expect(form.get('registration_type')).toBe('team');
    const { payload } = buildDraftPayload(input);
    expect(payload.errorCode).toBeUndefined();
    expect(payload).toMatchObject({ registration_mode: 'open', registration_type: 'team', players: [] });
  });

  it('den delte byggeren godtar en kompisrunde med påmelding og uten spillere', () => {
    for (const registrationMode of ['open', 'manual_approval'] as const) {
      const { payload } = buildDraftPayload(
        draft({ gameMode: 'stableford', players: [], registrationMode }),
      );
      expect(payload.errorCode).toBeUndefined();
      expect(payload.players).toEqual([]);
    }
  });

  it('uten påmelding stopper en tom liste fortsatt publiseringen', () => {
    const { payload } = buildDraftPayload(draft({ gameMode: 'stableford', players: [] }));
    expect(payload.errorCode).toBeDefined();
  });

  it.each(['stableford', 'wolf', 'singles_matchplay'] as const)(
    'et format uten lag (%s) sender alltid solo',
    (gameMode) => {
      const input = draft({ gameMode, players: [], registrationMode: 'open', registrationType: 'team' });
      expect(draftToFormData(input).get('registration_type')).toBe('solo');
      expect(buildDraftPayload(input).payload).toMatchObject({ registration_type: 'solo' });
      expect(buildDraftPayload(input).payload.errorCode).toBeUndefined();
    },
  );

  it('en klubbturnering sender fortsatt invite_only og solo', () => {
    const input = draft({
      gameMode: 'texas_scramble',
      players: [],
      groupId: 'club-a',
      registrationMode: 'open',
      registrationType: 'team',
      letFriendsSkipGate: true,
    });
    const form = draftToFormData(input);
    expect(form.get('registration_mode')).toBe('invite_only');
    expect(form.get('registration_type')).toBe('solo');
    expect(form.get('let_friends_skip_gate')).toBe('');
  });

  it('«Slipp venner direkte inn» gjelder bare med godkjenning', () => {
    const on = buildDraftPayload(
      draft({ gameMode: 'stableford', players: [], registrationMode: 'manual_approval', letFriendsSkipGate: true }),
    );
    expect(on.form.get('let_friends_skip_gate')).toBe('1');
    expect(on.payload.let_friends_skip_gate).toBe(true);

    const open = buildDraftPayload(
      draft({ gameMode: 'stableford', players: [], registrationMode: 'open', letFriendsSkipGate: true }),
    );
    expect(open.form.get('let_friends_skip_gate')).toBe('');
    expect(open.payload.let_friends_skip_gate).toBe(false);
  });

  it('resolveRegistration: Lag står bare for formater med lag', () => {
    expect(resolveRegistration({ clubScoped: false, gameMode: 'best_ball', mode: 'open', type: 'team' })).toEqual({
      mode: 'open',
      type: 'team',
      letFriendsSkipGate: false,
    });
    expect(resolveRegistration({ clubScoped: false, gameMode: 'stableford', mode: 'open', type: 'team' }).type).toBe(
      'solo',
    );
    expect(resolveRegistration({ clubScoped: false, gameMode: null })).toEqual({
      mode: 'invite_only',
      type: 'solo',
      letFriendsSkipGate: false,
    });
  });

  it('rosterForRegistration: med lagpåmelding via lenken står ingen på lista fra start', () => {
    const players = solo('me', 'a');
    expect(rosterForRegistration(players, { mode: 'open', type: 'team' })).toEqual([]);
    expect(rosterForRegistration(players, { mode: 'manual_approval', type: 'team' })).toEqual([]);
    expect(rosterForRegistration(players, { mode: 'invite_only', type: 'team' })).toEqual(players);
    expect(rosterForRegistration(players, { mode: 'open', type: 'solo' })).toEqual(players);
  });
});
