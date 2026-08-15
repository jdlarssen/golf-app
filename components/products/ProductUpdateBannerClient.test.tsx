import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const markOneAsReadMock = vi.fn();
vi.mock('@/app/[locale]/innboks/actions', () => ({
  markOneAsRead: (id: string) => markOneAsReadMock(id),
}));

// SmartLink rendres som <a> i test-miljø (ingen prefetch eller PWA-stuff).
vi.mock('@/components/ui/SmartLink', () => ({
  SmartLink: ({
    href,
    onClick,
    children,
    className,
  }: {
    href: string;
    onClick?: () => void;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} onClick={onClick} className={className}>
      {children}
    </a>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
  // Default: skrivingen går gjennom. Rollback-testen overstyrer med ok:false.
  markOneAsReadMock.mockResolvedValue({ ok: true });
});

describe('ProductUpdateBannerClient', () => {
  it('rendrer tittel og brødtekst', async () => {
    const { ProductUpdateBannerClient } = await import('./ProductUpdateBannerClient');
    render(
      <ProductUpdateBannerClient
        notificationId="n-1"
        title="Texas scramble er ute!"
        body="Ny modus tilgjengelig."
        link={null}
        ctaLabel={null}
      />,
    );
    expect(screen.getByText('Texas scramble er ute!')).toBeInTheDocument();
    expect(screen.getByText('Ny modus tilgjengelig.')).toBeInTheDocument();
  });

  it('rendrer CTA-knapp kun når både link og ctaLabel er satt', async () => {
    const { ProductUpdateBannerClient } = await import('./ProductUpdateBannerClient');
    const { rerender } = render(
      <ProductUpdateBannerClient
        notificationId="n-1"
        title="X"
        body="Y"
        link={null}
        ctaLabel={null}
      />,
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();

    rerender(
      <ProductUpdateBannerClient
        notificationId="n-1"
        title="X"
        body="Y"
        link="/admin/games/new"
        ctaLabel="Prøv det"
      />,
    );
    const link = screen.getByRole('link', { name: 'Prøv det' });
    expect(link).toHaveAttribute('href', '/admin/games/new');
  });

  it('lukke-knapp har aria-label «Lukk varselet»', async () => {
    const { ProductUpdateBannerClient } = await import('./ProductUpdateBannerClient');
    render(
      <ProductUpdateBannerClient
        notificationId="n-1"
        title="X"
        body="Y"
        link={null}
        ctaLabel={null}
      />,
    );
    expect(screen.getByLabelText('Lukk varselet')).toBeInTheDocument();
  });

  it('dismiss fjerner banneret og kaller markOneAsRead optimistisk', async () => {
    const { ProductUpdateBannerClient } = await import('./ProductUpdateBannerClient');
    render(
      <ProductUpdateBannerClient
        notificationId="notification-xyz"
        title="X"
        body="Y"
        link={null}
        ctaLabel={null}
      />,
    );
    const banner = screen.getByTestId('product-update-banner');
    expect(banner).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Lukk varselet'));
    });

    expect(screen.queryByTestId('product-update-banner')).not.toBeInTheDocument();
    expect(markOneAsReadMock).toHaveBeenCalledWith('notification-xyz');
  });

  it('#1665: feilet lagring ruller tilbake — banneret kommer igjen med feillinje', async () => {
    // Uten rollback forsvant banneret for godt i denne økta og dukket opp
    // igjen ved neste sidelast, uten forklaring.
    markOneAsReadMock.mockResolvedValue({ ok: false });
    const { ProductUpdateBannerClient } = await import('./ProductUpdateBannerClient');
    render(
      <ProductUpdateBannerClient
        notificationId="n-1"
        title="X"
        body="Y"
        link={null}
        ctaLabel={null}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Lukk varselet'));
    });

    expect(screen.getByTestId('product-update-banner')).toBeInTheDocument();
    expect(screen.getByTestId('product-banner-action-error')).toBeInTheDocument();
  });

  it('CTA-klikk markerer også som lest (parallelt med navigasjon)', async () => {
    const { ProductUpdateBannerClient } = await import('./ProductUpdateBannerClient');
    render(
      <ProductUpdateBannerClient
        notificationId="n-1"
        title="X"
        body="Y"
        link="/admin/games/new"
        ctaLabel="Prøv det"
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: 'Prøv det' }));
    });
    expect(markOneAsReadMock).toHaveBeenCalledWith('n-1');
  });
});
