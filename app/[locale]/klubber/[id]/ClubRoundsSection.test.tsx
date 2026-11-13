process.env.TZ = 'UTC';

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ClubRoundsSection } from './ClubRoundsSection';
import type { ClubRoundEntry } from '@/lib/games/terminliste';

/**
 * Type C — «Neste runder i klubben» on the club page (#2326): which rows show,
 * the «Du er med» / «Du arrangerer» rows, the empty text and «Vis 1 til».
 */

function entry(over: Partial<ClubRoundEntry> = {}): ClubRoundEntry {
  return {
    id: 'g1',
    name: 'Onsdagsgolfen',
    short_id: 'rnd00001',
    // Wednesday 7 Oct 2026, 17:30 Oslo.
    scheduled_tee_off_at: '2026-10-07T15:30:00Z',
    course_name: 'Byneset North',
    game_mode: 'stableford',
    mode_config: { kind: 'stableford', team_size: 1, points_table: 'standard' },
    hole_segment: 'full',
    start_type: 'first_tee',
    source: 'club',
    cta: 'direct',
    capacity: null,
    full: false,
    mine: null,
    ...over,
  };
}

/** The meta line, read as one string: its parts are separate no-wrap spans. */
const line = (text: string) => (_: string, el: Element | null) =>
  el?.tagName === 'SPAN' && el.children.length > 1 && el.textContent === text;

describe('ClubRoundsSection (#2326)', () => {
  it('shows a round with its date block, time and format line and a «Meld på» to the signup', () => {
    render(<ClubRoundsSection entries={[entry()]} socialProof={{}} />);
    const section = screen.getByRole('region', { name: 'Neste runder i klubben' });
    const row = within(section).getByRole('listitem');
    expect(within(row).getByText('Ons')).toBeInTheDocument();
    expect(within(row).getByText('7.10')).toBeInTheDocument();
    expect(within(row).getByText('Onsdagsgolfen')).toBeInTheDocument();
    // The club page's line leaves out the course, as drawn.
    expect(within(row).getByText(line('17:30 · Stableford'))).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'Meld meg på Onsdagsgolfen' })).toHaveAttribute(
      'href',
      '/signup/rnd00001',
    );
  });

  it('a round you are on says «Du er med», has no button and links to the round', () => {
    render(<ClubRoundsSection entries={[entry({ mine: 'joined' })]} socialProof={{}} />);
    const link = screen.getByTestId('club-round-mine');
    expect(link).toHaveAttribute('href', '/games/g1');
    expect(within(link).getByText('Du er med')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Meld meg på/ })).toBeNull();
  });

  it('a round you set up says «Du arrangerer»', () => {
    render(<ClubRoundsSection entries={[entry({ mine: 'organizer' })]} socialProof={{}} />);
    expect(within(screen.getByTestId('club-round-mine')).getByText('Du arrangerer')).toBeInTheDocument();
  });

  it('a round without a date says «Dato ikke satt» in front of the format', () => {
    render(
      <ClubRoundsSection entries={[entry({ scheduled_tee_off_at: null })]} socialProof={{}} />,
    );
    expect(screen.getByText(line('Dato ikke satt · Stableford'))).toBeInTheDocument();
  });

  it('never breaks «lag på 4», and keeps the capacity label on one line', () => {
    render(
      <ClubRoundsSection
        entries={[
          entry({
            name: 'Texas-runden',
            game_mode: 'texas_scramble',
            mode_config: { kind: 'texas_scramble', team_size: 4, teams_count: 2, team_handicap_pct: 25 },
            capacity: { cap: 40, held: 0 },
          }),
        ]}
        socialProof={{}}
      />,
    );
    const team = screen.getByText('lag på 4');
    expect(team).toHaveClass('whitespace-nowrap');
    expect(screen.getByText('Texas scramble ·')).toHaveClass('whitespace-nowrap');
    expect(screen.getByText('40 av 40 plasser ledige')).toHaveClass('whitespace-nowrap');
  });

  it('shows the friends who joined under the line', () => {
    render(
      <ClubRoundsSection
        entries={[entry()]}
        socialProof={{
          g1: { joinedCount: 2, knownFriendNames: ['Jonas Berg', 'Marte Lie'], knownFriendOverflow: 0 },
        }}
      />,
    );
    expect(screen.getByText('Jonas og Marte er med')).toBeInTheDocument();
  });

  it('says so when the club has no rounds', () => {
    render(<ClubRoundsSection entries={[]} socialProof={{}} />);
    expect(screen.getByTestId('club-rounds-empty')).toHaveTextContent(
      'Ingen runder satt opp i klubben ennå.',
    );
    expect(screen.queryByRole('listitem')).toBeNull();
  });

  it('shows five rows and puts the sixth behind «Vis 1 til»', () => {
    const six = Array.from({ length: 6 }, (_, i) =>
      entry({ id: `g${i}`, name: `Runde ${i}`, short_id: `rnd0000${i}` }),
    );
    const { container } = render(<ClubRoundsSection entries={six} socialProof={{}} />);
    const details = container.querySelector('details');
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute('open');
    expect(within(details as HTMLElement).getByText('Vis 1 til')).toBeInTheDocument();
    expect(within(details as HTMLElement).getAllByRole('listitem', { hidden: true })).toHaveLength(1);
    expect(within(details as HTMLElement).getByText('Runde 5')).toBeInTheDocument();
    // Five rows stand outside the fold.
    const visible = screen
      .getAllByRole('listitem')
      .filter((li) => !details?.contains(li));
    expect(visible).toHaveLength(5);
  });

  it('has no fold with five rounds', () => {
    const five = Array.from({ length: 5 }, (_, i) => entry({ id: `g${i}`, name: `Runde ${i}` }));
    const { container } = render(<ClubRoundsSection entries={five} socialProof={{}} />);
    expect(container.querySelector('details')).toBeNull();
  });
});
