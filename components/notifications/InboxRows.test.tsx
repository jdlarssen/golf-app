import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { InboxEntryView } from '@/lib/notifications/inboxSections';
import { InboxRow } from './InboxRow';
import { InboxActionRow } from './InboxActionRow';

vi.mock('@/i18n/navigation', async () => {
  const { createElement } = await vi.importActual<typeof import('react')>('react');
  return {
    Link: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) =>
      createElement('a', { href, ...rest }, children),
  };
});

const BASE: InboxEntryView = {
  title: '',
  subtitle: '',
  subtitleIsFreeText: false,
  quote: null,
  body: null,
  cta: null,
  avatar: { kind: 'emoji', emoji: '🚫' },
  placeLabel: null,
  destination: null,
  actionKey: null,
};

describe('InboxRow', () => {
  it('a group with a target is one link with the stack, the arrow and the dot; a row without a target has neither link nor arrow', () => {
    const onActivate = vi.fn();
    const { container } = render(
      <div>
        <InboxRow
          view={{
            ...BASE,
            title: '4 scorekort levert',
            subtitle: 'Lørdagsrunden · sist for 2 min siden',
            avatar: { kind: 'people', initials: ['ML', 'JB'], more: 2 },
            destination: '/admin/games/g1',
          }}
          unread
          unreadLabel="Ulest"
          onActivate={onActivate}
        />
        <InboxRow
          view={{ ...BASE, title: 'Du kom ikke med i X', subtitle: 'Fullt · i går', subtitleIsFreeText: true }}
          unread={false}
          unreadLabel="Ulest"
          onActivate={vi.fn()}
        />
      </div>,
    );

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/admin/games/g1');
    expect(link).toHaveTextContent('4 scorekort levert');
    expect(link).toHaveTextContent('→');
    expect(link).toHaveTextContent('Ulest');
    expect(screen.getByTestId('initials-stack')).toHaveTextContent('MLJB+2');
    expect(link.querySelector('[data-testid="unread-dot"]')).not.toBeNull();
    fireEvent.click(link);
    expect(onActivate).toHaveBeenCalledTimes(1);

    const plain = screen.getByRole('button');
    expect(plain).not.toHaveTextContent('→');
    expect(plain.querySelector('[data-testid="unread-dot"]')).toBeNull();
    expect(container.querySelectorAll('a')).toHaveLength(1);
  });
});

describe('InboxActionRow', () => {
  it('a signup request: dot, title, start time, greeting, and Godta/Avslå acting in place', () => {
    const onDecide = vi.fn();
    render(
      <InboxActionRow
        view={{
          ...BASE,
          title: 'Kristian vil bli med',
          subtitle: 'Onsdagsgolfen · 1. okt kl. 17:30',
          quote: '«Gleder meg!»',
          destination: '/admin/games/g2/signups',
          actionKey: 'decide',
        }}
        labels={{ unread: 'Ulest', button: '', approve: 'Godta', reject: 'Avslå' }}
        onOpen={vi.fn()}
        onDecide={onDecide}
      />,
    );
    expect(screen.getByTestId('unread-dot')).toBeInTheDocument();
    expect(screen.getByText('Onsdagsgolfen · 1. okt kl. 17:30')).toBeInTheDocument();
    expect(screen.getByText('«Gleder meg!»')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Avslå' }));
    expect(onDecide).toHaveBeenCalledWith('reject');
  });
});
