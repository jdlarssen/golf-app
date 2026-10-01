import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import no from '@/messages/no.json';
import { InvitationCard } from './InvitationCard';

// One Type C render test (#2266): the card's structure per variant. Strings
// are compared with the catalog, never typed out, so copy edits stay free.

const base: ComponentProps<typeof InvitationCard> = {
  variant: 'invite',
  inviterName: 'Kari Nordmann',
  gameName: 'Testrunden',
  gameMode: 'stableford',
  modeConfig: { kind: 'stableford', team_size: 1, points_table: 'standard' },
  teeOffAt: '2026-10-03T07:20:00Z',
  courseName: 'Testbanen',
  teeName: 'Gul',
  socialProof: {
    joinedCount: 5,
    knownFriendNames: ['Ola N.'],
    knownFriendOverflow: 0,
  },
  expiresLine: 'frist',
};

const card = no.invitationCard;

describe('InvitationCard (#2266)', () => {
  it('renders kicker, heading level, fields, rule, dots and privacy per variant', () => {
    // invite: kicker, h2, two fields with <time>, count only, expiry line.
    const invite = render(<InvitationCard {...base} />);
    const article = screen.getByTestId('invitation-card');
    expect(article.tagName).toBe('ARTICLE');
    expect(article).toHaveAttribute('data-variant', 'invite');
    expect(article).toHaveTextContent(card.kicker.invite);
    const h2 = screen.getByRole('heading', { level: 2 });
    expect(h2).toHaveTextContent('Testrunden');
    expect(article).toHaveAttribute('aria-labelledby', h2.id);
    const terms = article.querySelectorAll('dt');
    expect(terms).toHaveLength(2);
    expect(article.querySelectorAll('dd time')).toHaveLength(2);
    expect(screen.getAllByTestId('invitation-avatar')).toHaveLength(3);
    expect(screen.getByTestId('social-proof-line')).not.toHaveTextContent('Ola');
    expect(screen.getByTestId('invite-expiry')).toHaveTextContent('frist');
    expect(article).toHaveTextContent(
      no.formatGuide.content.stableford.summary,
    );
    expect(article).toHaveTextContent(card.playStyle.solo);
    invite.unmount();

    // public: its own kicker, no names, children inside the card, no expiry.
    const pub = render(
      <InvitationCard {...base} variant="public" expiresLine={null}>
        <button type="button">join</button>
      </InvitationCard>,
    );
    const pubCard = screen.getByTestId('invitation-card');
    expect(pubCard).toHaveTextContent(card.kicker.public);
    expect(screen.getByTestId('social-proof-line')).not.toHaveTextContent('Ola');
    expect(within(pubCard).getByRole('button')).toHaveTextContent('join');
    expect(screen.queryByTestId('invite-expiry')).toBeNull();
    pub.unmount();

    // member: no kicker, h1, friend names; team stableford gets the 4BBB rule.
    const member = render(
      <InvitationCard
        {...base}
        variant="member"
        modeConfig={{ kind: 'stableford', team_size: 2, points_table: 'standard' }}
        expiresLine={null}
      />,
    );
    const memberCard = screen.getByTestId('invitation-card');
    expect(memberCard).not.toHaveTextContent(card.kicker.invite);
    expect(memberCard).not.toHaveTextContent(card.kicker.public);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Testrunden',
    );
    expect(screen.getByTestId('social-proof-line')).toHaveTextContent('Ola N.');
    expect(memberCard).toHaveTextContent(
      no.formatGuide.content['stableford-4bbb'].summary,
    );
    expect(memberCard).toHaveTextContent(card.playStyle.team);
    member.unmount();

    // No tee-off, nobody joined, wolf: no fields, no dots, no play style.
    render(
      <InvitationCard
        {...base}
        gameMode="wolf"
        modeConfig={{ kind: 'wolf', team_size: 1 } as typeof base.modeConfig}
        teeOffAt={null}
        teeName={null}
        socialProof={{ joinedCount: 0, knownFriendNames: [], knownFriendOverflow: 0 }}
      />,
    );
    const bare = screen.getByTestId('invitation-card');
    expect(bare.querySelector('dl')).toBeNull();
    expect(screen.queryAllByTestId('invitation-avatar')).toHaveLength(0);
    expect(screen.queryByTestId('social-proof-line')).toBeNull();
    expect(bare).not.toHaveTextContent(card.playStyle.solo);
    expect(bare).not.toHaveTextContent(card.playStyle.team);
    expect(bare).not.toHaveTextContent(card.tee.replace('{name}', '').trim());
  });
});
