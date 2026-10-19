import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ceremonyPlaces, ceremonySteps, type CeremonyLine } from '@/lib/games/ceremony';
import type { CeremonyData, CeremonySidePrize } from '@/app/[locale]/games/[id]/premieutdeling/ceremonyData';
import { CeremonyStage } from './CeremonyStage';

// Type C (#2298): what the big screen renders at a step — one render test.
// The order of the steps and the grouping are tested in
// lib/games/ceremony.test.ts; here only what reaches the screen.

const NAMES: Record<string, string> = {
  w: 'Vilde Vinner',
  s: 'Jonas Berg',
  b: 'Anders Moe',
  m1: 'Marte Lie',
  m2: 'Kristian Holm',
  m3: 'Ola Nordmann',
  m4: 'Kari Nordmann',
  t1: 'Per Hansen',
  t2: 'Eva Olsen',
};

const player = (key: string, rank: number, total: number): CeremonyLine => ({
  key,
  rank,
  total,
  unit: 'points',
  members: [key],
  teamNumber: null,
});
const team = (n: number, rank: number, total: number, members: string[]): CeremonyLine => ({
  key: `team-${n}`,
  rank,
  total,
  unit: 'net',
  members,
  teamNumber: n,
});

const SIDE: CeremonySidePrize[] = [
  { category: 'closest_to_pin', position: 1, count: 1, winnerUserId: 'm2' },
  { category: 'longest_drive', position: 1, count: 1, winnerUserId: 'm1' },
];

function data(lines: CeremonyLine[], sidePrizes: CeremonySidePrize[] = []): CeremonyData {
  const places = ceremonyPlaces(lines);
  return { places, steps: ceremonySteps(places, sidePrizes.length > 0), sidePrizes, names: NAMES };
}

const cards = () => screen.getAllByTestId('ceremony-card');
const stage = () => screen.getByTestId('ceremony-stage');
const currents = () => document.querySelectorAll('[data-current="true"]');

describe('CeremonyStage', () => {
  it('shows only the turned cards, as drawn, for players and teams', () => {
    const solo = data([player('w', 1, 38), player('s', 2, 36), player('b', 3, 34)], SIDE);

    // At the start every card is hidden, and no name is in the output.
    const { rerender } = render(<CeremonyStage gameName="Lørdagsrunden" data={solo} step={0} />);
    expect(cards().map((c) => c.getAttribute('data-shown'))).toEqual(['false', 'false', 'false']);
    for (const name of Object.values(NAMES)) expect(stage()).not.toHaveTextContent(name);
    expect(screen.queryByTestId('ceremony-side')).toBeNull();
    expect(stage()).toHaveTextContent('3. plass, ikke vist ennå');

    // The side prizes are the step shown last: they carry the current mark.
    rerender(<CeremonyStage gameName="Lørdagsrunden" data={solo} step={1} />);
    expect(screen.getByTestId('ceremony-side')).toHaveAttribute('data-current', 'true');
    expect(currents()).toHaveLength(1);

    // The drawn moment: 3rd and 2nd turned, the winner hidden and nowhere in
    // the output; reveal order in the list, slots 3 | 1 | 2 on screen.
    rerender(<CeremonyStage gameName="Lørdagsrunden" data={solo} step={3} />);
    expect(cards().map((c) => c.getAttribute('data-slot'))).toEqual(['3', '2', '1']);
    expect(cards().map((c) => c.className.match(/col-start-\d/)?.[0])).toEqual([
      'col-start-1',
      'col-start-3',
      'col-start-2',
    ]);
    expect(cards()[0]).toHaveTextContent('Anders Moe');
    expect(cards()[0]).toHaveTextContent('34 poeng');
    expect(cards()[2]).toHaveTextContent('Vinneren');
    expect(cards()[2]).toHaveTextContent('Arrangøren avslører den på mobilen');
    expect(stage()).not.toHaveTextContent('Vilde Vinner');
    expect(stage()).not.toHaveTextContent('38 poeng');
    expect(currents()).toHaveLength(1);
    expect(cards()[1]).toHaveAttribute('data-current', 'true');
    expect(screen.getByTestId('ceremony-side')).not.toHaveAttribute('data-current');
    expect(screen.getByTestId('ceremony-side')).toHaveTextContent('Nærmest pinnen');

    // The winner revealed.
    rerender(<CeremonyStage gameName="Lørdagsrunden" data={solo} step={4} />);
    expect(cards()[2]).toHaveAttribute('data-current', 'true');
    expect(cards()[2]).toHaveTextContent('Vilde Vinner');
    expect(cards()[2]).toHaveTextContent('38 poeng');

    // Teams: «Lag N» and every member; the hidden winning team shows neither.
    const texas = data([
      team(3, 1, 61, ['m1', 'm2', 'm3', 'm4']),
      team(1, 2, 63, ['t1', 't2']),
      team(2, 3, 65, ['w', 's']),
    ]);
    rerender(<CeremonyStage gameName="Klubbkvelden" data={texas} step={2} />);
    expect(cards()[1]).toHaveTextContent('Lag 1');
    expect(within(cards()[1]).getByTestId('ceremony-members')).toHaveTextContent('Per Hansen · Eva Olsen');
    expect(cards()[1]).toHaveTextContent('63 slag');
    expect(stage()).not.toHaveTextContent('Lag 3');
    for (const id of ['m1', 'm2', 'm3', 'm4']) expect(stage()).not.toHaveTextContent(NAMES[id]!);

    // A shared team place is one card with a line per team.
    const sharedTeams = data([
      team(1, 1, 60, ['w', 's']),
      team(2, 2, 62, ['m1', 'm2']),
      team(4, 2, 62, ['m3', 'm4']),
    ]);
    rerender(<CeremonyStage gameName="Klubbkvelden" data={sharedTeams} step={1} />);
    expect(cards()).toHaveLength(2);
    expect(cards()[0]).toHaveTextContent('Delt 2. plass');
    expect(within(cards()[0]).getAllByTestId('ceremony-members').map((l) => l.textContent)).toEqual([
      'Lag 2 · Marte Lie, Kristian Holm',
      'Lag 4 · Ola Nordmann, Kari Nordmann',
    ]);

    // Two sharing 1st: no 2nd place card, «Vinnerne» while hidden, both
    // names once revealed.
    const tied = data([player('w', 1, 38), player('s', 1, 38), player('b', 3, 34)]);
    rerender(<CeremonyStage gameName="Lørdagsrunden" data={tied} step={1} />);
    expect(cards().map((c) => c.getAttribute('data-slot'))).toEqual(['3', '1']);
    expect(cards()[1]).toHaveTextContent('Vinnerne');
    expect(cards()[1]).toHaveTextContent('Arrangøren avslører dem på mobilen');
    rerender(<CeremonyStage gameName="Lørdagsrunden" data={tied} step={2} />);
    expect(cards()[1]).toHaveTextContent('Delt 1. plass');
    expect(cards()[1]).toHaveTextContent('Vilde Vinner');
    expect(cards()[1]).toHaveTextContent('Jonas Berg');
  });
});
