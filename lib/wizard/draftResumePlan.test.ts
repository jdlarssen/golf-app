import { describe, it, expect } from 'vitest';
import {
  planDraftResume,
  resumeExpectedPlayerCount,
  type DraftResumeRow,
  type FormatCatalog,
} from './draftResumePlan';
import { fitsPlayerCount } from './fitsPlayerCount';
import type { GameMode } from '@/lib/scoring/modes/types';

// #1385: hvilken flate et lagret utkast gjenopptas i. Ren avledning fra
// `games`-raden + format-katalogen — ingen DB, ingen React.

const CATALOG: FormatCatalog = {
  kompis: [{ slug: 'stableford' }, { slug: 'best_ball' }, { slug: 'wolf' }],
  klubb: [{ slug: 'stableford' }, { slug: 'best_ball' }, { slug: 'texas_scramble' }],
  solo: [{ slug: 'stableford' }, { slug: 'solo_strokeplay' }],
};

function row(overrides: Partial<DraftResumeRow> = {}): DraftResumeRow {
  return {
    game_mode: 'best_ball' as GameMode,
    group_id: null,
    tournament_id: null,
    league_round_id: null,
    ...overrides,
  };
}

describe('planDraftResume — intent-avledning', () => {
  it('uten klubb-scope og med lag-/pott-format: kompis', () => {
    expect(planDraftResume(row(), CATALOG)).toEqual({
      kind: 'wizard',
      intent: 'kompis',
      groupId: undefined,
    });
  });

  it('klubb-scope slår formatets spillestil', () => {
    // Klubb-runden er solo slagspill — men klubb-koblingen er arrangørens
    // eksplisitte valg, så steg 1 skal stå på Klubb.
    expect(
      planDraftResume(
        row({ group_id: 'club-1', game_mode: 'stableford' as GameMode }),
        CATALOG,
      ),
    ).toEqual({ kind: 'wizard', intent: 'klubb', groupId: 'club-1' });
  });

  it('solo slagspill uten klubb: solo', () => {
    expect(
      planDraftResume(row({ game_mode: 'solo_strokeplay' as GameMode }), CATALOG),
    ).toEqual({ kind: 'wizard', intent: 'solo', groupId: undefined });
  });

  it('tom streng som group_id teller ikke som klubb-scope', () => {
    expect(planDraftResume(row({ group_id: '' }), CATALOG)).toEqual({
      kind: 'wizard',
      intent: 'kompis',
      groupId: undefined,
    });
  });

  it('utelatte koblings-felt (smalere select) behandles som ingen kobling', () => {
    expect(planDraftResume({ game_mode: 'best_ball' as GameMode }, CATALOG)).toEqual({
      kind: 'wizard',
      intent: 'kompis',
      groupId: undefined,
    });
  });
});

describe('planDraftResume — katalog-vakt', () => {
  it('beholder avledet intent når formatet finnes der, selv om kompis også har det', () => {
    expect(
      planDraftResume(
        row({ group_id: 'club-1', game_mode: 'texas_scramble' as GameMode }),
        CATALOG,
      ),
    ).toEqual({ kind: 'wizard', intent: 'klubb', groupId: 'club-1' });
  });

  it('faller til kompis når formatet mangler i avledet katalog', () => {
    // Wolf ligger bare i kompis-katalogen; et klubb-scopet wolf-utkast ville
    // ellers møtt et steg 2 uten sitt eget format.
    expect(
      planDraftResume(
        row({ group_id: 'club-1', game_mode: 'wolf' as GameMode }),
        CATALOG,
      ),
    ).toEqual({ kind: 'wizard', intent: 'kompis', groupId: 'club-1' });
  });

  it('faller til GameForm når formatet mangler i begge kataloger', () => {
    expect(
      planDraftResume(row({ game_mode: 'gruesome_matchplay' as GameMode }), CATALOG),
    ).toEqual({ kind: 'form' });
  });

  it('faller til GameForm når katalogen er tom', () => {
    expect(
      planDraftResume(row(), { kompis: [], klubb: [], solo: [] }),
    ).toEqual({ kind: 'form' });
  });
});

describe('planDraftResume — cup og liga ekskluderes', () => {
  it('cup-tilknyttet utkast beholder GameForm', () => {
    expect(planDraftResume(row({ tournament_id: 'cup-1' }), CATALOG)).toEqual({
      kind: 'form',
    });
  });

  it('liga-tilknyttet utkast beholder GameForm', () => {
    expect(planDraftResume(row({ league_round_id: 'round-1' }), CATALOG)).toEqual({
      kind: 'form',
    });
  });

  it('cup-koblingen fail-closer også når klubb-scopet ville gitt en gyldig intent', () => {
    expect(
      planDraftResume(
        row({ tournament_id: 'cup-1', group_id: 'club-1', game_mode: 'stableford' as GameMode }),
        CATALOG,
      ),
    ).toEqual({ kind: 'form' });
  });
});

describe('resumeExpectedPlayerCount — #373-telleren på et gjenopptatt utkast', () => {
  it('bruker rosteret når det passer formatet', () => {
    expect(resumeExpectedPlayerCount('singles_matchplay' as GameMode, 2)).toBe(2);
    expect(resumeExpectedPlayerCount('nines' as GameMode, 3)).toBe(3);
    expect(resumeExpectedPlayerCount('shamble' as GameMode, 6)).toBe(6);
  });

  it('viser alle formater når rosteret ikke passer formatet ennå', () => {
    // Et halvferdig utkast: formatet er valgt, spillerne ikke fylt ut. Uten
    // «Vis alle» ville steg 2 filtrert bort utkastets eget format.
    expect(resumeExpectedPlayerCount('singles_matchplay' as GameMode, 1)).toBeNull();
    expect(resumeExpectedPlayerCount('shamble' as GameMode, 3)).toBeNull();
    expect(resumeExpectedPlayerCount('best_ball' as GameMode, 3)).toBeNull();
  });

  it('viser alle formater når rosteret er tomt', () => {
    expect(resumeExpectedPlayerCount('best_ball' as GameMode, 0)).toBeNull();
  });

  it('gir aldri en verdi som filtrerer bort formatet selv', () => {
    // Regresjonslåsen: uansett format og rosterstørrelse skal seeden enten
    // være «Vis alle» eller et antall formatet faktisk passer.
    const modes = [
      'singles_matchplay',
      'nines',
      'best_ball',
      'shamble',
      'florida_scramble',
      'wolf',
      'stableford',
      'round_robin',
    ] as GameMode[];
    for (const mode of modes) {
      for (let roster = 0; roster <= 8; roster++) {
        const seed = resumeExpectedPlayerCount(mode, roster);
        if (seed !== null) expect(fitsPlayerCount(mode, seed)).toBe(true);
      }
    }
  });
});
