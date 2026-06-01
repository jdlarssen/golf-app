'use client';

import { usePathname } from 'next/navigation';
import { SmartLink } from '@/components/ui/SmartLink';
import { HjemIcon, KonvoluttIcon, ProfilIcon } from '@/components/icons/Icons';
import { useUnreadNotificationsCount } from '@/hooks/useUnreadNotificationsCount';

/**
 * Vedvarende bunn-tab-bar (#355) for innloggede spiller-flater. Fast nederst
 * i viewport, tre faste destinasjoner: Hjem / Innboks / Profil. Erstatter den
 * gamle «hjem er eneste nav»-modellen — fra hvilken som helst spiller-side når
 * brukeren alle tre i ett tap.
 *
 * Rendret én gang globalt i `app/layout.tsx`. `userId` kommer fra proxy-
 * headeren: null på offentlige (umatchede) ruter → baren skjuler seg selv.
 * I tillegg skjuler den seg på admin (eget rom), hull-skjermen (fullskjerm
 * scoring) og pre-profil-onboarding, som har egen chrome.
 *
 * Innboks-fanen overtar rollen til den gamle `NotificationBell` i TopBar:
 * samme champagne-prikk via `useUnreadNotificationsCount`, ingen telletall.
 *
 * `position: fixed` + `env(safe-area-inset-bottom)` så baren klarerer iPhone
 * home-indicator (`viewportFit: 'cover'` er satt i app/layout.tsx). AppShell
 * legger tilsvarende bunn-padding på innholdet så ingenting scroller under.
 */
export function BottomNav({ userId }: { userId: string | null }) {
  const pathname = usePathname() ?? '';

  // Skjul når utlogget (null på offentlige ruter) eller på flater med egen
  // chrome: admin, hull-skjerm (fullskjerm scoring) og pre-profil-onboarding.
  // Vi gater FØR `useUnreadNotificationsCount` (i Bar-en) slik at det globale
  // realtime-abonnementet kun åpnes når baren faktisk vises — ikke på hver
  // autentisert rute (hull-skjerm/admin) der den uansett er skjult.
  const hidden =
    userId == null ||
    pathname === '/login' ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/complete-profile') ||
    /^\/games\/[^/]+\/holes\//.test(pathname);
  if (hidden) return null;

  return <BottomNavBar userId={userId} pathname={pathname} />;
}

function BottomNavBar({ userId, pathname }: { userId: string; pathname: string }) {
  const { count } = useUnreadNotificationsCount(userId);
  const hasUnread = count > 0;

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  const tabs = [
    { href: '/', label: 'Hjem', Icon: HjemIcon, dot: false },
    { href: '/innboks', label: 'Innboks', Icon: KonvoluttIcon, dot: hasUnread },
    { href: '/profile', label: 'Profil', Icon: ProfilIcon, dot: false },
  ] as const;

  return (
    <nav
      aria-label="Hovednavigasjon"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/95 backdrop-blur-sm"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <ul className="mx-auto flex max-w-md items-stretch">
        {tabs.map(({ href, label, Icon, dot }) => {
          const active = isActive(href);
          return (
            <li key={href} className="flex-1">
              <SmartLink
                href={href}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium tracking-tight transition-colors ${
                  active ? 'text-primary' : 'text-muted hover:text-text'
                }`}
              >
                <span className="relative inline-flex">
                  <Icon size={24} />
                  {dot && (
                    <span
                      data-testid="bottomnav-innboks-dot"
                      aria-hidden
                      className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full border-2 border-bg"
                      style={{ background: 'var(--accent)' }}
                    />
                  )}
                </span>
                <span>{label}</span>
              </SmartLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
