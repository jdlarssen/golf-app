import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import {
  SideTournamentView,
  type SideTournamentTeam,
} from './SideTournamentView';
import type {
  SideCategoryAward,
  SideTournamentResult,
} from '@/lib/scoring/sideTournament';

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

// ─── Characterization: full ordered award sequence (issue #812) ──────────────
//
// Locks the EXACT rendered award rows — group order, within-group sort order,
// category labels, points, AND the tieSuffix-vs-winnerName branching — across
// every dual-variant pair plus the bespoke blocks that interleave them. The
// refactor in #812 replaces only the contiguous simple dual-variant runs with a
// config loop; this snapshot must stay byte-identical through that change. The
// emission order is irregular (e.g. King par-4 sits AFTER «Flest eagles+», NOT
// grouped with par-3/par-5), so a tidy reorder would silently change the
// rendered award order on real finished-game leaderboards. If this snapshot
// moves, behaviour moved — investigate, do NOT update it blind.

/** One team carrying every category that flows through TeamAwards, so the
 * render exercises all 11 simple dual-variant pairs + the interleaved bespoke
 * blocks in one pass. Two members so the «_team» variants are not solo-gated. */
function characterizationTeams(): SideTournamentTeam[] {
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

function characterizationResult(): SideTournamentResult {
  // Every award attributed to team 1 (user u1 for individual variants).
  const a = (
    category: SideCategoryAward['category'],
    extra: Partial<SideCategoryAward> = {},
  ): SideCategoryAward => ({ category, teamId: 1, points: 0, ...extra });

  return {
    teamStandings: [
      {
        teamId: 1,
        totalPoints: 99,
        awards: [
          // Hovedkonkurranser (bespoke, tieSuffix)
          a('best_netto_18'),
          a('best_netto_front9'),
          a('best_netto_back9'),
          // Skill — 11-pair run #1..#7 (simple dual variants)
          a('best_brutto_18_team'),
          a('best_brutto_18_individual', { winnerUserId: 'u1' }),
          a('king_par3_team'),
          a('king_par3_individual', { winnerUserId: 'u1' }),
          a('king_par5_team'),
          a('king_par5_individual', { winnerUserId: 'u1' }),
          a('most_eagles_team'),
          a('most_eagles_individual', { winnerUserId: 'u1' }),
          a('king_par4_team'),
          a('king_par4_individual', { winnerUserId: 'u1' }),
          a('most_albatrosses_team'),
          a('most_albatrosses_individual', { winnerUserId: 'u1' }),
          a('most_hole_in_ones_team'),
          a('most_hole_in_ones_individual', { winnerUserId: 'u1' }),
          // Skill — bespoke single-variant blocks interleaved after the run
          a('clean_front_9', { winnerUserId: 'u1' }),
          a('clean_back_9', { winnerUserId: 'u1' }),
          a('no_double_plus_round', { winnerUserId: 'u1' }),
          a('longest_bogey_free_streak', {
            winnerUserId: 'u1',
            streakLength: 5,
            streakStartHole: 3,
            streakEndHole: 7,
          }),
          // Moderate — 11-pair run #8..#11 (simple dual variants)
          a('best_brutto_f9_team'),
          a('best_brutto_f9_individual', { winnerUserId: 'u1' }),
          a('best_brutto_b9_team'),
          a('best_brutto_b9_individual', { winnerUserId: 'u1' }),
          a('most_birdies_team'),
          a('most_birdies_individual', { winnerUserId: 'u1' }),
          a('most_pars_team'),
          a('most_pars_individual', { winnerUserId: 'u1' }),
          // Moderate — bespoke blocks
          a('lowest_single_hole_brutto', { winnerUserId: 'u1', score: 2, holeNumber: 14 }),
          a('hardest_hole_winner', { winnerUserId: 'u1', score: 4, holeNumber: 9 }),
          a('comeback_kid', { winnerUserId: 'u1', delta: -4 }),
          a('all_par_groups_birdie', { winnerUserId: 'u1' }),
          a('even_par_round', { winnerUserId: 'u1' }),
          a('back_to_back_birdies', {
            winnerUserId: 'u1',
            points: 2,
            streakStartHole: 4,
            streakEndHole: 5,
          }),
          // Penalty (bespoke)
          a('snowman', { points: -2, score: 5, holeNumber: 7 }),
          a('worst_single_hole_brutto', { winnerUserId: 'u1', score: 9, holeNumber: 11 }),
          a('most_double_bogeys_individual', { winnerUserId: 'u1' }),
        ],
      },
      { teamId: 2, totalPoints: 0, awards: [] },
    ],
  };
}

/** Award rows live in `<ul class="font-serif"> <li>` inside each team's expand;
 * the rules panel uses `font-sans`, so this selector isolates the real awards.
 * Returns each award row's normalized text in document (= rendered) order. */
function awardRowTexts(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('ul.font-serif > li')).map((li) =>
    (li.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );
}

describe('SideTournamentView — full ordered award sequence (characterization #812)', () => {
  it('renders every award row in the exact group + within-group order', () => {
    const container = renderView(
      characterizationTeams(),
      characterizationResult(),
    );

    expect(awardRowTexts(container)).toMatchInlineSnapshot(`
      [
        "Best netto 18 hull: 10p",
        "Best netto back 9: 5p",
        "Best netto front 9: 5p",
        "Best brutto totalt 18 (lag): 4p",
        "Rein back-9 (Alice): 4p",
        "Rein front-9 (Alice): 4p",
        "Konge på par-3 (lag): 4p",
        "Konge på par-4 (lag): 4p",
        "Konge på par-5 (lag): 4p",
        "Lengste bogey-fri (Alice, 5 hull hull 3–7): 4p",
        "Flest albatrosser (lag): 4p",
        "Flest eagles+ (lag): 4p",
        "Flest hole-in-one (lag): 4p",
        "Ren runde — ingen double (Alice): 4p",
        "Best brutto totalt 18 (Alice): 2p",
        "Konge på par-3 (Alice): 2p",
        "Konge på par-4 (Alice): 2p",
        "Konge på par-5 (Alice): 2p",
        "Flest albatrosser (Alice): 2p",
        "Flest eagles+ (Alice): 2p",
        "Flest hole-in-one (Alice): 2p",
        "Allsidig birdie (Alice): 2p",
        "To birdier på rad (Alice, hull 4–5): 2p",
        "Best brutto back 9 (lag): 2p",
        "Best brutto front 9 (lag): 2p",
        "Comeback kid (Alice, snudd 4 slag): 2p",
        "Even-par-runden (Alice): 2p",
        "Hardeste hull (Alice, 4 brutto på hull 9): 2p",
        "Lavest enkelthull (Alice, 2 på hull 14): 2p",
        "Flest birdier (lag): 2p",
        "Flest pars+ (lag): 2p",
        "Best brutto back 9 (Alice): 1p",
        "Best brutto front 9 (Alice): 1p",
        "Flest birdier (Alice): 1p",
        "Flest pars+ (Alice): 1p",
        "Flest double-bogeys (Alice): -1p",
        "Verste enkelthull (Alice, 9 på hull 11): -1p",
        "Snowman (hele laget +5 på hull 7): -2phele lagets brutto ≥ par+5 på samme hull",
      ]
    `);
  });
});

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
