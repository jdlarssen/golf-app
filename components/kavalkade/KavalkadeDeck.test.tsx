import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { KavalkadeDeck } from './KavalkadeDeck';
import type {
  KavalkadeCard,
  KavalkadeDeck as Deck,
} from '@/lib/kavalkade/kavalkadeCards';

// Type C — én render-test for kortstokken (#2129). Verifiserer strukturen:
// begge fanene finnes, kortene ligger i skinna, K4s handlingsfelt havner på
// riktig kort, og fane-byttet bytter kortsett. Tallene er dekket av Type A på
// `buildKavalkadeFacts` og `buildKavalkadeDeck` — de assereres ikke her.
//
// Kortstokken inneholder bevisst ett kort av hver sort: da fanger den samme
// testen også en ICU-melding som ikke kompilerer, siden vitest.setup bruker
// next-intls ekte oversetter mot messages/no.json.

const personal: KavalkadeCard[] = [
  {
    id: 'year',
    year: 2026,
    rounds: 12,
    soloRounds: 10,
    teamRounds: 2,
    narrative: 'NARRATIVE_TEXT',
  },
  {
    id: 'best-round',
    fact: {
      gameId: 'g1',
      gameName: 'Lørdagscup',
      courseName: 'Losby',
      brutto: 82,
      playedAt: '2026-06-14T08:00:00.000Z',
    },
  },
  {
    id: 'nemesis-hole',
    fact: { holeNumber: 7, played: 9, averageToPar: 1.44, worstStrokes: 8 },
  },
  {
    id: 'rival',
    fact: {
      userId: 'u2',
      name: 'Ola',
      met: 8,
      decided: 8,
      wins: 3,
      losses: 4,
      ties: 1,
    },
  },
  {
    id: 'form-peak',
    fact: {
      stretch: {
        rounds: 3,
        averageBrutto: 84,
        fromDate: '2026-06-01T08:00:00.000Z',
        toDate: '2026-07-01T08:00:00.000Z',
      },
      season: {
        brutto: { start: 92, now: 84, best: 82 },
        netto: { start: null, now: null, best: null },
      },
    },
  },
  {
    id: 'team',
    rounds: 2,
    bestRound: {
      gameId: 'g9',
      gameName: 'Texas',
      courseName: 'Losby',
      playedAt: '2026-08-02T08:00:00.000Z',
      brutto: 68,
      teammates: [{ userId: 'u3', name: 'Kari' }],
    },
    highlight: {
      kind: 'best',
      teammates: [
        { userId: 'u3', name: 'Kari', rounds: 2, averageBrutto: 70, scoredRounds: 2 },
      ],
    },
  },
  { id: 'below-threshold', soloRounds: 2, roundsNeeded: 3, teamRounds: 2 },
];

const gang: KavalkadeCard[] = [
  { id: 'gang-summary', members: 6, games: 12 },
  { id: 'gang-winner', fact: { userId: 'u2', name: 'Ola', count: 5 } },
  { id: 'gang-birdies', fact: { userId: 'u1', name: 'Jørgen', count: 11 } },
  { id: 'gang-snowmen', fact: { userId: 'u4', name: null, count: 4 } },
  {
    id: 'gang-tightest',
    fact: {
      gameId: 'g4',
      gameName: 'Tirsdagsrunden',
      courseName: null,
      playedAt: null,
      strokeMargin: 1,
      leader: { userId: 'u1', name: 'Jørgen', brutto: 84 },
      runnerUp: { userId: 'u2', name: 'Ola', brutto: 85 },
    },
  },
];

const deck: Deck = { personal, gang, defaultTab: 'personal' };

describe('KavalkadeDeck', () => {
  it('renders the personal rail with every card and slots an action onto one', () => {
    render(
      <KavalkadeDeck
        deck={deck}
        locale="no"
        actions={{ 'best-round': <button type="button">SHARE_BUTTON</button> }}
      />,
    );

    expect(screen.getByTestId('kavalkade-tab-personal')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('kavalkade-rail')).toBeInTheDocument();

    for (const card of personal) {
      expect(screen.getByTestId(`kavalkade-card-${card.id}`)).toBeInTheDocument();
    }
    expect(screen.queryByTestId('kavalkade-card-gang-summary')).not.toBeInTheDocument();

    // AI-innledningen står på åpningskortet, ikke i et eget kort.
    expect(screen.getByTestId('kavalkade-card-year')).toHaveTextContent(
      'NARRATIVE_TEXT',
    );

    // K4s handlingsfelt: bare på kortet den ble sendt inn for.
    expect(screen.getByTestId('kavalkade-card-best-round')).toHaveTextContent(
      'SHARE_BUTTON',
    );
    expect(screen.getByTestId('kavalkade-card-rival')).not.toHaveTextContent(
      'SHARE_BUTTON',
    );
  });

  it('swaps to the gang cards when the other tab is picked', () => {
    render(<KavalkadeDeck deck={deck} locale="no" />);

    fireEvent.click(screen.getByTestId('kavalkade-tab-gang'));

    for (const card of gang) {
      expect(screen.getByTestId(`kavalkade-card-${card.id}`)).toBeInTheDocument();
    }
    expect(screen.queryByTestId('kavalkade-card-year')).not.toBeInTheDocument();
  });

  it('opens on the tab the deck asks for, and says so when a tab is empty', () => {
    render(
      <KavalkadeDeck
        deck={{ personal: [], gang, defaultTab: 'gang' }}
        locale="no"
      />,
    );

    expect(screen.getByTestId('kavalkade-tab-gang')).toHaveAttribute(
      'aria-selected',
      'true',
    );

    fireEvent.click(screen.getByTestId('kavalkade-tab-personal'));
    expect(screen.getByTestId('kavalkade-tab-empty')).toBeInTheDocument();
  });
});
