import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { SideAwardDetails } from './SideAwardDetails';
import type { CupSideAwardHoleGroup } from '@/lib/cup/sideAwardDetails';

// Type C render-test per docs/test-discipline.md — ÉN test for den strukturelle
// visningen: seksjonen finnes, hullene rendres i input-rekkefølge, hvert utfall
// får sin egen tekst, «1 av N» vises kun for flere plasser, og en cup uten
// sidepoeng gir ingen seksjon. Grupperingen og klassifiseringen er dekket av
// lib/cup/sideAwardDetails.test.ts og re-asserteres IKKE her.

const GROUPS: CupSideAwardHoleGroup[] = [
  {
    holeNumber: 7,
    rows: [
      {
        id: 'a1',
        kind: 'ctp',
        holeNumber: 7,
        points: 0.5,
        slot: 1,
        slotCount: 2,
        showSlot: true,
        outcome: 'won',
        winnerName: 'Per',
        winnerTeam: 1,
      },
      {
        id: 'a2',
        kind: 'ctp',
        holeNumber: 7,
        points: 0.5,
        slot: 2,
        slotCount: 2,
        showSlot: true,
        outcome: 'noWinner',
        winnerName: null,
        winnerTeam: null,
      },
      {
        id: 'a3',
        kind: 'ld',
        holeNumber: 7,
        points: 1,
        slot: 1,
        slotCount: 1,
        showSlot: false,
        outcome: 'unregistered',
        winnerName: null,
        winnerTeam: null,
      },
    ],
  },
  {
    holeNumber: 12,
    rows: [
      {
        id: 'g1',
        kind: 'gir',
        holeNumber: 12,
        points: 0.5,
        maxPerTeam: 4,
        registered: true,
        teams: [
          { team: 1, count: 3, points: 1.5 },
          { team: 2, count: 0, points: 0 },
        ],
      },
    ],
  },
];

describe('SideAwardDetails', () => {
  it('rendrer hull, utfall per rad og lag-tellere, og skjuler seksjonen uten sidepoeng', () => {
    const view = render(
      <SideAwardDetails groups={GROUPS} team1Name="Lag Skog" team2Name="Lag Sjø" />,
    );

    expect(screen.getByTestId('cup-side-award-details')).toBeInTheDocument();

    const rows = screen.getAllByTestId('cup-side-award-row');
    expect(rows.map((r) => r.getAttribute('data-outcome'))).toEqual([
      'won',
      'noWinner',
      'unregistered',
      null,
    ]);

    // Vinnerplass med søsken: «(1 av 2)» + navn, lag og poeng.
    expect(within(rows[0]).getByText('(1 av 2)')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Per · Lag Skog')).toBeInTheDocument();
    expect(within(rows[0]).getByText('+0,5')).toBeInTheDocument();

    // «Ingen vant» og «Ikke registrert» er ulike svar, og ingen av dem gir poeng.
    expect(within(rows[1]).getByText('Ingen vant')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Ikke registrert')).toBeInTheDocument();
    expect(within(rows[2]).queryByText('+1')).not.toBeInTheDocument();

    // Enkelt vinnerplass har ingen nummerering (gamle cuper ser ut som før).
    expect(within(rows[2]).queryByText(/av/)).not.toBeInTheDocument();

    // GIR: én linje per lag med teller og lagets poeng.
    expect(within(rows[3]).getByText('Lag Skog: 3 av 4 · +1,5')).toBeInTheDocument();
    expect(within(rows[3]).getByText('Lag Sjø: 0 av 4 · +0')).toBeInTheDocument();

    // Cup uten sidepoeng: ingen seksjon i det hele tatt.
    view.unmount();
    render(<SideAwardDetails groups={[]} team1Name="Lag Skog" team2Name="Lag Sjø" />);
    expect(screen.queryByTestId('cup-side-award-details')).not.toBeInTheDocument();
  });
});
