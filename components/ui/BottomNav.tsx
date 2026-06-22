'use client';

import { useTranslations } from 'next-intl';
import { usePathname } from '@/i18n/navigation';
import { SmartLink } from '@/components/ui/SmartLink';
import {
  HjemIcon,
  KonvoluttIcon,
  ProfilIcon,
  KlubbhusIcon,
} from '@/components/icons/Icons';
import { useUnreadNotificationsCount } from '@/hooks/useUnreadNotificationsCount';

/**
 * Vedvarende bunn-tab-bar (#355, #392) for innloggede flater. Fast nederst i
 * viewport, fire faste destinasjoner: Hjem / Innboks / Klubbhuset / Profil.
 * Erstatter den gamle «hjem er eneste nav»-modellen — fra hvilken som helst
 * side når brukeren alle fire i ett tap.
 *
 * «Klubbhuset» (#392) er en universell fane til `/admin`-rommet, synlig for
 * ALLE innloggede — fanen gates ikke på rolle; flatene inne gates. Derfor er
 * admin ikke lenger skjult: baren vises på Klubbhus-flatene så brukeren kommer
 * seg ut igjen, og fanen er aktiv også på `/klubbhuset`, `/opprett-spill` og
 * `/opprett-bane`.
 *
 * Rendret én gang globalt i `app/layout.tsx`. `userId` kommer fra proxy-
 * headeren: null på offentlige (umatchede) ruter → baren skjuler seg selv.
 * I tillegg skjuler den seg på hull-skjermen (fullskjerm scoring) og
 * pre-profil-onboarding, som har egen chrome.
 *
 * `usePathname` MÅ komme fra `@/i18n/navigation`, ikke `next/navigation`:
 * `as-needed`-routingen rewriter `/games/x` → `/no/games/x` internt, og
 * `next/navigation`-varianten lekker det `/no`-prefikset under server-render.
 * Da matcher ikke hull-regexen `/^\/games\/…\/holes\//`, baren skjuler seg
 * ikke, og «Neste hull»-knappen havner under den. Den lokale-bevisste
 * varianten stripper prefikset konsistent (server + klient).
 *
 * Innboks-fanen overtar rollen til den gamle `NotificationBell` i TopBar:
 * samme champagne-prikk via `useUnreadNotificationsCount`, ingen telletall.
 *
 * `position: fixed` + `env(safe-area-inset-bottom)` så baren klarerer iPhone
 * home-indicator (`viewportFit: 'cover'` er satt i app/layout.tsx). App- og
 * AdminShell legger tilsvarende bunn-padding på innholdet så ingenting
 * scroller under.
 */
export function BottomNav({ userId }: { userId: string | null }) {
  const pathname = usePathname() ?? '';

  // Skjul når utlogget (null på offentlige ruter) eller på flater med egen
  // chrome: hull-skjerm (fullskjerm scoring) og pre-profil-onboarding. Admin er
  // IKKE lenger skjult (#392) — det er Klubbhus-rommet, baren hører hjemme der.
  // Vi gater FØR `useUnreadNotificationsCount` (i Bar-en) slik at det globale
  // realtime-abonnementet kun åpnes når baren faktisk vises.
  const hidden =
    userId == null ||
    pathname === '/login' ||
    pathname.startsWith('/complete-profile') ||
    /^\/games\/[^/]+\/holes\//.test(pathname);
  if (hidden) return null;

  return <BottomNavBar userId={userId} pathname={pathname} />;
}

function BottomNavBar({ userId, pathname }: { userId: string; pathname: string }) {
  const t = useTranslations('nav');
  const { count } = useUnreadNotificationsCount(userId);
  const hasUnread = count > 0;

  const matchOne = (href: string) =>
    href === '/'
      ? pathname === '/'
      : pathname === href || pathname.startsWith(`${href}/`);
  // En fane kan eie flere ruter: Klubbhuset-rommet (/admin) dekker også Spill-
  // seksjonen (/klubbhuset) og create-dørene (/opprett-spill, /opprett-bane).
  const isActive = (href: string, also: readonly string[] = []) =>
    matchOne(href) || also.some(matchOne);

  const tabs = [
    { href: '/', labelKey: 'home' as const, Icon: HjemIcon, dot: false, also: [] },
    { href: '/innboks', labelKey: 'inbox' as const, Icon: KonvoluttIcon, dot: hasUnread, also: [] },
    {
      href: '/admin',
      labelKey: 'clubhouse' as const,
      Icon: KlubbhusIcon,
      dot: false,
      also: [
        '/klubbhuset',
        '/opprett-spill',
        '/opprett-bane',
        '/klubber',
        '/spillformater',
      ],
    },
    { href: '/profile', labelKey: 'profile' as const, Icon: ProfilIcon, dot: false, also: [] },
  ] as const;

  return (
    <nav
      aria-label={t('ariaLabel')}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/95 backdrop-blur-sm"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <ul className="mx-auto flex max-w-md items-stretch">
        {tabs.map(({ href, labelKey, Icon, dot, also }) => {
          const label = t(labelKey);
          const active = isActive(href, also);
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
