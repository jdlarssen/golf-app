import { describe, it, expect } from 'vitest';
import {
  parseCupDraftForm,
  type CupDraftFormError,
  type CupDraftFormInput,
} from './parseCupDraftForm';

// Type-A unit-test for cup-formens feltvalidering (#1778 — trukket ut av
// `createTournamentDraft`). Låser tre ting refactoren ikke fikk lov å endre:
// de elleve feilkodene, REKKEFØLGEN de vinner i (skjemaet viser én om gangen),
// og at tomme vektfelt kommer ut som `undefined` slik at inserten utelater
// kolonnen og DB-defaulten gjelder.

/** Gyldig frittstående cup-form; per-case overrides ødelegger ett felt. */
function input(overrides: Partial<CupDraftFormInput> = {}): CupDraftFormInput {
  return {
    name: 'Ryder Cup',
    team1: 'Europa',
    team2: 'USA',
    fourballAllowanceRaw: '',
    foursomesAllowanceRaw: '',
    greensomeAllowanceRaw: '',
    chapmanAllowanceRaw: '',
    gruesomeAllowanceRaw: '',
    winPointsRaw: '',
    tiePointsRaw: '',
    ...overrides,
  };
}

describe('parseCupDraftForm — happy path', () => {
  it('tom form (dagens ordinære cup): WHS-defaults per format, vektfelt undefined', () => {
    const result = parseCupDraftForm(input());
    expect(result).toEqual({
      ok: true,
      values: {
        name: 'Ryder Cup',
        team1: 'Europa',
        team2: 'USA',
        // Hvert felt skal få SIN egen default — en ombytting her ville gitt
        // feil slag i en hel cup uten at noe feilet.
        fourballAllowance: 85,
        foursomesAllowance: 50,
        greensomeAllowance: 100,
        chapmanAllowance: 100,
        gruesomeAllowance: 50,
        // Utelates fra inserten → DB-default 1/0,5 (migrasjon 0153).
        winPoints: undefined,
        tiePoints: undefined,
      },
    });
    // Eksplisitt: `toEqual` ser gjennom fingrene med undefined-felt, og her er
    // nettopp `undefined` (ikke 0, ikke null) det som får kalleren til å
    // utelate kolonnen.
    if (!result.ok) throw new Error('forventet ok');
    expect(result.values.winPoints).toBeUndefined();
    expect(result.values.tiePoints).toBeUndefined();
  });

  it('utfylte felt (splittet cup-dag): verdiene slippes gjennom, navn trimmes', () => {
    const result = parseCupDraftForm(
      input({
        name: '  Klubbmesterskapet  ',
        team1: ' Nord ',
        team2: ' Sør ',
        fourballAllowanceRaw: '90',
        foursomesAllowanceRaw: '60',
        greensomeAllowanceRaw: '0',
        chapmanAllowanceRaw: '100',
        gruesomeAllowanceRaw: '45',
        winPointsRaw: '5',
        tiePointsRaw: '2',
      }),
    );
    expect(result).toEqual({
      ok: true,
      values: {
        name: 'Klubbmesterskapet',
        team1: 'Nord',
        team2: 'Sør',
        fourballAllowance: 90,
        foursomesAllowance: 60,
        greensomeAllowance: 0,
        chapmanAllowance: 100,
        gruesomeAllowance: 45,
        winPoints: 5,
        tiePoints: 2,
      },
    });
  });

  it('tie_points 0 er lovlig (en delt match kan gi null poeng) og bevares som 0, ikke undefined', () => {
    const result = parseCupDraftForm(input({ winPointsRaw: '3', tiePointsRaw: '0' }));
    expect(result.ok && result.values.tiePoints).toBe(0);
  });
});

describe('parseCupDraftForm — alle elleve feilkodene', () => {
  it.each<[CupDraftFormError, Partial<CupDraftFormInput>]>([
    ['cup_name', { name: '   ' }],
    ['cup_name', { name: 'x'.repeat(81) }],
    ['cup_team_1', { team1: '' }],
    ['cup_team_1', { team1: 'x'.repeat(41) }],
    ['cup_team_2', { team2: '' }],
    ['cup_team_dup', { team1: 'Lag', team2: 'Lag' }],
    // Case-insensitiv: «Lag» og «lag» er samme navn på et leaderboard.
    ['cup_team_dup', { team1: 'Lag', team2: 'lag' }],
    ['cup_allowance', { fourballAllowanceRaw: '101' }],
    ['cup_foursomes_allowance', { foursomesAllowanceRaw: 'femti' }],
    ['cup_greensome_allowance', { greensomeAllowanceRaw: '-1' }],
    ['cup_chapman_allowance', { chapmanAllowanceRaw: '50.5' }],
    ['cup_gruesome_allowance', { gruesomeAllowanceRaw: '200' }],
    ['cup_win_points', { winPointsRaw: '0' }],
    ['cup_tie_points', { tiePointsRaw: '-1' }],
  ])('%s', (error, overrides) => {
    expect(parseCupDraftForm(input(overrides))).toEqual({ ok: false, error });
  });
});

// `CupSetup` viser ÉN feilmelding om gangen, så når flere felt er ugyldige er
// det den FØRSTE koden arrangøren ser. Rekkefølgen er dermed observerbar
// oppførsel, ikke en implementasjonsdetalj.
describe('parseCupDraftForm — første feil vinner', () => {
  it.each<[CupDraftFormError, Partial<CupDraftFormInput>]>([
    [
      'cup_name',
      { name: '', team1: '', fourballAllowanceRaw: 'x', winPointsRaw: '0' },
    ],
    ['cup_team_1', { team1: '', team2: '', gruesomeAllowanceRaw: 'x' }],
    ['cup_team_2', { team2: '', tiePointsRaw: '-1' }],
    ['cup_team_dup', { team1: 'Lag', team2: 'LAG', chapmanAllowanceRaw: '999' }],
    ['cup_allowance', { fourballAllowanceRaw: 'x', gruesomeAllowanceRaw: 'x' }],
    [
      'cup_foursomes_allowance',
      { foursomesAllowanceRaw: 'x', chapmanAllowanceRaw: 'x', winPointsRaw: '0' },
    ],
    ['cup_win_points', { winPointsRaw: '0', tiePointsRaw: '-1' }],
  ])('→ %s', (error, overrides) => {
    expect(parseCupDraftForm(input(overrides))).toEqual({ ok: false, error });
  });
});
