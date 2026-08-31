// native/app/src/lib/wizardPayload.test.ts
// Kontrakt-porten mellom appens veiviser og webbens payload-bygger.
//
// Hele N6a hviler på at appen IKKE bygger sin egen `mode_config`. Byggeren er
// delt kode; det eneste appen eier er feltnavnene den fyller inn. Denne fila
// kjører derfor shim + delt bygger for hver av de åtte modiene og krever
// webbens payload-fasong tilbake — med riktig `kind`, riktig lagfordeling og
// `errorCode` udefinert.
//
// Blir én av dem rød, er det ikke testen som er feil: da har et feltnavn eller
// en regel driftet, og et spill opprettet i appen ville fått en annen rad enn
// det samme spillet opprettet på nettsiden.
import { buildGameInsertPayload } from '../../../../lib/games/gamePayload';
import { APP_SUPPORTED_MODES, type AppGameMode } from './appFormats';
import {
  buildDraftPayload,
  draftToFormData,
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

/** De åtte modiene med en roster som faktisk er publiserbar for hver. */
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
];

describe('payload-paritet for alle åtte modi', () => {
  it('dekker nøyaktig APP_SUPPORTED_MODES', () => {
    expect(CASES.map((c) => c.mode).sort()).toEqual([...APP_SUPPORTED_MODES].sort());
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
  // kun `get()`. Kalles den med en shim som IKKE har de andre metodene, og den
  // likevel gir samme payload, er antakelsen bevist og ikke bare påstått.
  it('gir samme payload som et rått get()-only-objekt', () => {
    const input = draft({ gameMode: 'stableford', players: solo('a', 'b') });
    const fields = draftToFormData(input).toObject();
    const getOnly = {
      get: (name: string): string | null => fields[name] ?? null,
    } as unknown as FormData;

    expect(buildGameInsertPayload(getOnly, 'publish')).toEqual(
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

describe('teeOffInstant', () => {
  // Regresjonsvakt for tee-off-en som ble lagret en time feil (simulator
  // 2026-08-31). Poenget er at pickerens oeyeblikk gaar RETT gjennom: ingen
  // veggklokke-streng, ingen Intl-avhengig sommertid-gjetting. Datoene under er
  // valgt paa hver sin side av sommertid-skiftet, saa en gjeninnfoert
  // Oslo-konvertering ville brutt minst en av dem uansett hvilken vei den bommet.
  it.each([
    ['sommertid', new Date(2026, 7, 31, 23, 0)],
    ['vintertid', new Date(2026, 11, 24, 14, 30)],
  ])('gir pickerens eget oeyeblikk (%s)', (_name, picked: Date) => {
    expect(teeOffInstant(picked)).toBe(picked.toISOString());
    // Og veien tilbake gir nøyaktig klokkeslettet arrangøren valgte.
    expect(new Date(teeOffInstant(picked)).getHours()).toBe(picked.getHours());
  });
});
