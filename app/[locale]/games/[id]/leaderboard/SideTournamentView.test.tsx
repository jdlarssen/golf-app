import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import {
  SideTournamentView,
  type SideTournamentTeam,
} from './SideTournamentView';
import type { SideTournamentResult } from '@/lib/scoring/sideTournament';

// Felles props-skall. Tester overstyrer `teams` + `result` for solo vs lag.
function renderView(
  teams: SideTournamentTeam[],
  result: SideTournamentResult,
): HTMLElement {
  const { container } = render(
    <SideTournamentView
      teams={teams}
      result={result}
      ldCount={0}
      ctpCount={0}
      sideWinners={[]}
      coursePars={Array.from({ length: 18 }, () => 4)}
      disabledCategories={[]}
    />,
  );
  return container;
}

// Solo: to «lag» med ett medlem hver. Lag 1 har en snowman på hull 7 (+5).
function soloTeams(): SideTournamentTeam[] {
  return [
    {
      teamId: 1,
      label: 'Jørgen',
      members: [{ userId: 'u1', displayName: 'Jørgen «Jørg»', firstName: 'Jørgen' }],
    },
    {
      teamId: 2,
      label: 'Karl',
      members: [{ userId: 'u2', displayName: 'Karl Jensen', firstName: 'Karl' }],
    },
  ];
}

function soloResult(): SideTournamentResult {
  return {
    teamStandings: [
      {
        teamId: 1,
        totalPoints: -2,
        awards: [{ category: 'snowman', teamId: 1, points: -2, score: 5, holeNumber: 7 }],
      },
      { teamId: 2, totalPoints: 0, awards: [] },
    ],
  };
}

// Ekte lag: to medlemmer hver. Lag 1 har en snowman på hull 7 (+5).
function realTeams(): SideTournamentTeam[] {
  return [
    {
      teamId: 1,
      label: 'Lag 1',
      members: [
        { userId: 'u1', displayName: 'Alice Andersen', firstName: 'Alice' },
        { userId: 'u2', displayName: 'Bjørn Berg', firstName: 'Bjørn' },
      ],
    },
    {
      teamId: 2,
      label: 'Lag 2',
      members: [
        { userId: 'u3', displayName: 'Cecilie Dahl', firstName: 'Cecilie' },
        { userId: 'u4', displayName: 'Doris Eng', firstName: 'Doris' },
      ],
    },
  ];
}

function realResult(): SideTournamentResult {
  return {
    teamStandings: [
      {
        teamId: 1,
        totalPoints: -2,
        awards: [{ category: 'snowman', teamId: 1, points: -2, score: 5, holeNumber: 7 }],
      },
      { teamId: 2, totalPoints: 0, awards: [] },
    ],
  };
}

describe('SideTournamentView — solo (individuelt format)', () => {
  it('viser kallenavn-form én gang og bruker individuell lag-copy', () => {
    const text = renderView(soloTeams(), soloResult()).textContent ?? '';

    // #604: solo-raden viser displayName (kallenavn-form), ikke fornavn-dublett.
    expect(text).toContain('Jørgen «Jørg»');
    // Fornavnet skal kun stå én gang (inne i displayName) — ingen egen undertittel.
    expect((text.match(/Jørgen/g) ?? []).length).toBe(1);

    // #603 snowman: individuell form uten «hele laget».
    expect(text).toContain('Snowman (+5 på hull 7)');
    expect(text).not.toContain('hele laget +5');

    // #603 panel: rene lag-rader skjult, snowman-regel i solo-variant.
    expect(text).toContain('Slik gis poengene');
    expect(text).not.toContain('Alle birdied (lag-bonus)');
    expect(text).toContain('din brutto ≥ par+5');
  });
});

describe('SideTournamentView — ekte lag', () => {
  it('beholder lag-label, member-liste, «hele laget»-snowman og lag-rader', () => {
    const text = renderView(realTeams(), realResult()).textContent ?? '';

    // Lag-label + member-liste (begge fornavn) vises som før.
    expect(text).toContain('Lag 1');
    expect(text).toContain('Alice · Bjørn');

    // Snowman beholder lag-formuleringen.
    expect(text).toContain('Snowman (hele laget +5 på hull 7)');

    // Regel-panelet viser fortsatt de rene lag-radene.
    expect(text).toContain('Alle birdied (lag-bonus)');
  });
});
