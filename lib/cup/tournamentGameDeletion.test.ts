import { describe, it, expect } from 'vitest';
import {
  selectNeverPlayedHostGameIds,
  type CupHostGameForDeletion,
} from './tournamentGameDeletion';

// Type A per docs/test-discipline.md — ren utvalgs-logikk (#1441 finding A).
describe('selectNeverPlayedHostGameIds', () => {
  it('returnerer tomt array for en tom liste', () => {
    expect(selectNeverPlayedHostGameIds([])).toEqual([]);
  });

  it.each([
    // [status, hasScores, forventet slettet]
    ['draft', false, true],
    ['draft', true, true], // draft har aldri scores i praksis; testen dekker likevel begge
    ['scheduled', false, true],
    ['scheduled', true, true],
    ['active', false, true], // startet, men ingen slag tastet
    ['active', true, false], // reell spilling — beholdes
    ['finished', false, false], // avsluttet uten scores — beholdes uansett (bevisst, se docstring)
    ['finished', true, false],
  ] as const)(
    'status=%s hasScores=%s → slettet=%s',
    (status, hasScores, expectedDeleted) => {
      const hosts: CupHostGameForDeletion[] = [{ id: 'g1', status, hasScores }];
      const result = selectNeverPlayedHostGameIds(hosts);
      expect(result).toEqual(expectedDeleted ? ['g1'] : []);
    },
  );

  it('plukker ut riktig delmengde fra en blandet batch, i original rekkefølge', () => {
    const hosts: CupHostGameForDeletion[] = [
      { id: 'draft-1', status: 'draft', hasScores: false },
      { id: 'active-played', status: 'active', hasScores: true },
      { id: 'scheduled-1', status: 'scheduled', hasScores: false },
      { id: 'active-empty', status: 'active', hasScores: false },
      { id: 'finished-1', status: 'finished', hasScores: true },
    ];
    expect(selectNeverPlayedHostGameIds(hosts)).toEqual([
      'draft-1',
      'scheduled-1',
      'active-empty',
    ]);
  });

  it('dupliserte id-er i input speiles i output (kallers ansvar å ikke sende duplikater)', () => {
    const hosts: CupHostGameForDeletion[] = [
      { id: 'dup', status: 'draft', hasScores: false },
      { id: 'dup', status: 'draft', hasScores: false },
    ];
    expect(selectNeverPlayedHostGameIds(hosts)).toEqual(['dup', 'dup']);
  });
});
