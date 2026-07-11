import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SocialProofLine } from './SocialProofLine';

/**
 * One render test for the join-funnel social-proof line (#1193) — the three
 * branches (friend-named / aggregate / nothing) driven purely by props. Asserts
 * on the data-testid and the interpolated values (names, counts), never on the
 * Norwegian copy (Type C discipline). The shaping rules are covered by the
 * `buildSocialProof` Type A suite; this only proves the presentational fork.
 */
describe('SocialProofLine (#1193)', () => {
  it('renders the friend-named branch with the name and overflow count', () => {
    render(
      <SocialProofLine
        joinedCount={6}
        knownFriendNames={['Jonas']}
        knownFriendOverflow={2}
      />,
    );
    const line = screen.getByTestId('social-proof-line');
    expect(line).toHaveTextContent('Jonas');
    expect(line).toHaveTextContent('2');
  });

  it('renders the aggregate branch with just the count', () => {
    render(
      <SocialProofLine
        joinedCount={3}
        knownFriendNames={[]}
        knownFriendOverflow={0}
      />,
    );
    expect(screen.getByTestId('social-proof-line')).toHaveTextContent('3');
  });

  it('renders nothing when no one has joined (excluding the viewer)', () => {
    render(
      <SocialProofLine
        joinedCount={0}
        knownFriendNames={[]}
        knownFriendOverflow={0}
      />,
    );
    expect(screen.queryByTestId('social-proof-line')).toBeNull();
  });
});
