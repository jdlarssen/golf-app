import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ceremonyPlaces, ceremonySteps, type CeremonyLine } from '@/lib/games/ceremony';
import type { CeremonyData, CeremonySidePrize } from '@/app/[locale]/games/[id]/premieutdeling/ceremonyData';
import { CeremonyStage } from './CeremonyStage';

// Type C (#2298): what the big screen renders at a step. The order of the
// steps and the grouping are tested in lib/games/ceremony.test.ts.

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

function player(key: string, rank: number, total: number): CeremonyLine {
  return { key, rank, total, unit: 'points', members: [key], teamNumber: null };
}

function team(n: number, rank: number, total: number, members: string[]): CeremonyLine {
  return { key: `team-${n}`, rank, total, unit: 'net', members, teamNumber: n };
}

const SIDE: CeremonySidePrize[] = [
  { category: 'closest_to_pin', position: 1, count: 1, winnerUserId: 'm2' },
  { category: 'longest_drive', position: 1, count: 1, winnerUserId: 'm1' },
];

function data(lines: CeremonyLine[], sidePrizes: CeremonySidePrize[] = []): CeremonyData {
  const places = ceremonyPlaces(lines);
  return { places, steps: ceremonySteps(places, sidePrizes.length > 0), sidePrizes, names: NAMES };
}

const SOLO = data([player('w', 1, 38), player('s', 2, 36), player('b', 3, 34)], SIDE);

const cards = () => screen.getAllByTestId('ceremony-card');
const stage = () => screen.getByTestId('ceremony-stage');

describe('CeremonyStage', () => {
  it('at the start every card is hidden and no name is in the output', () => {
    render(<CeremonyStage gameName="Lørdagsrunden" data={SOLO} step={0} />);

    expect(cards().map((c) => c.getAttribute('data-shown'))).toEqual(['false', 'false', 'false']);
    for (const name of Object.values(NAMES)) expect(stage()).not.toHaveTextContent(name);
    expect(screen.queryByTestId('ceremony-side')).toBeNull();
    expect(stage()).toHaveTextContent('3. plass, ikke vist ennå');
  });

  it('the drawn moment: 3rd and 2nd turned, the winner hidden — and the winner nowhere', () => {
    render(<CeremonyStage gameName="Lørdagsrunden" data={SOLO} step={3} />);

    // Reveal order in the list, podium slots 3 | 1 | 2 on screen.
    expect(cards().map((c) => c.getAttribute('data-slot'))).toEqual(['3', '2', '1']);
    expect(cards().map((c) => c.className.match(/col-start-\d/)?.[0])).toEqual([
      'col-start-1',
      'col-start-3',
      'col-start-2',
    ]);
    expect(cards()[0]).toHaveTextContent('Anders Moe');
    expect(cards()[0]).toHaveTextContent('34 poeng');
    expect(cards()[1]).toHaveTextContent('Jonas Berg');
    expect(cards()[2]).toHaveTextContent('Vinneren');
    expect(cards()[2]).toHaveTextContent('Arrangøren avslører den på mobilen');
    expect(stage()).not.toHaveTextContent('Vilde Vinner');
    expect(stage()).not.toHaveTextContent('38 poeng');

    // Exactly one card is the one turned last.
    expect(document.querySelectorAll('[data-current="true"]')).toHaveLength(1);
    expect(cards()[1]).toHaveAttribute('data-current', 'true');

    const side = screen.getByTestId('ceremony-side');
    expect(side).toHaveTextContent('Nærmest pinnen');
    expect(side).toHaveTextContent('Kristian Holm');
    expect(side).toHaveTextContent('Lengste drive');
  });

  it('the winner revealed: name, number and the gold medallion', () => {
    render(<CeremonyStage gameName="Lørdagsrunden" data={SOLO} step={4} />);

    expect(cards()[2]).toHaveAttribute('data-current', 'true');
    expect(cards()[2]).toHaveTextContent('Vilde Vinner');
    expect(cards()[2]).toHaveTextContent('38 poeng');
    expect(document.querySelectorAll('[data-current="true"]')).toHaveLength(1);
  });

  it('a team card shows «Lag N» and every member; hidden teams show none of them', () => {
    const texas = data([
      team(3, 1, 61, ['m1', 'm2', 'm3', 'm4']),
      team(1, 2, 63, ['t1', 't2']),
      team(2, 3, 65, ['w', 's']),
    ]);
    render(<CeremonyStage gameName="Klubbkvelden" data={texas} step={2} />);

    expect(cards()[1]).toHaveTextContent('Lag 1');
    expect(within(cards()[1]).getByTestId('ceremony-members')).toHaveTextContent('Per Hansen · Eva Olsen');
    expect(cards()[1]).toHaveTextContent('63 slag');
    // The winning team, hidden: neither its number nor a member.
    expect(stage()).not.toHaveTextContent('Lag 3');
    for (const id of ['m1', 'm2', 'm3', 'm4']) expect(stage()).not.toHaveTextContent(NAMES[id]!);
  });

  it('a shared team place is one card with a line per team', () => {
    const shared = data([
      team(1, 1, 60, ['w', 's']),
      team(2, 2, 62, ['m1', 'm2']),
      team(4, 2, 62, ['m3', 'm4']),
    ]);
    render(<CeremonyStage gameName="Klubbkvelden" data={shared} step={1} />);

    expect(cards()).toHaveLength(2);
    const second = cards()[0]!;
    expect(second).toHaveTextContent('Delt 2. plass');
    expect(within(second).getAllByTestId('ceremony-members').map((l) => l.textContent)).toEqual([
      'Lag 2 · Marte Lie, Kristian Holm',
      'Lag 4 · Ola Nordmann, Kari Nordmann',
    ]);
  });

  it('two sharing 1st: no 2nd place card, the column stays empty', () => {
    const tied = data([player('w', 1, 38), player('s', 1, 38), player('b', 3, 34)]);
    render(<CeremonyStage gameName="Lørdagsrunden" data={tied} step={2} />);

    expect(cards().map((c) => c.getAttribute('data-slot'))).toEqual(['3', '1']);
    expect(cards()[1]).toHaveTextContent('Delt 1. plass');
    expect(cards()[1]).toHaveTextContent('Vilde Vinner');
    expect(cards()[1]).toHaveTextContent('Jonas Berg');
  });
});
