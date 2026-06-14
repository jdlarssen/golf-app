import type { JSX, ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { SmartLink } from '@/components/ui/SmartLink';
import { AppShell } from '@/components/ui/AppShell';
import { Kicker } from '@/components/ui/Kicker';
import { LeaderboardBackdrop } from '@/components/illustrations/LeaderboardBackdrop';

export interface LeaderboardShellProps {
  children: ReactNode;
  /**
   * Når `true`, dropper ytre `AppShell` — caller eier ytre page-chrome
   * (f.eks. inne i LeaderboardTabs eller når en podium wrapper). Default
   * `false` gir full-side-varianten med `AppShell` + bunn-padding.
   */
  chromeless?: boolean;
}

/**
 * Delt ramme rundt alle poeng-format-leaderboardene: `LeaderboardBackdrop`
 * bak innholdet, valgfri `AppShell`-wrapper. Trukket ut fra ~40 identiske
 * lokale `Shell`-kopier (issue #598). `chromeless=false` (default) matcher
 * den paddede full-side-varianten; `chromeless=true` den bare backdrop-en.
 */
export function LeaderboardShell({
  children,
  chromeless = false,
}: LeaderboardShellProps): JSX.Element {
  if (chromeless) {
    return (
      <div className="relative isolate">
        <LeaderboardBackdrop />
        <div className="relative">{children}</div>
      </div>
    );
  }
  return (
    <AppShell>
      <div className="relative isolate pb-12">
        <LeaderboardBackdrop />
        <div className="relative">{children}</div>
      </div>
    </AppShell>
  );
}

export interface LeaderboardHeaderProps {
  /** Turneringsnavn — vises som accent-kicker, store bokstaver. */
  gameName: string;
  /** Hvor pilen tilbake peker (f.eks. `/` eller `/games/${gameId}`). */
  backHref: string;
}

/**
 * Delt topp-header for leaderboardene: tilbake-pil (‹) til venstre,
 * turneringsnavn som accent-kicker i midten, balansert spacer til høyre.
 * Trukket ut fra 38 identiske lokale `Header`-kopier (issue #598). Holes-
 * viewene sender `backHref={`/games/${gameId}`}`. `State4View` beholder sin
 * egen header siden den har en ekstra replay-knapp.
 */
export function LeaderboardHeader({
  gameName,
  backHref,
}: LeaderboardHeaderProps): JSX.Element {
  const tc = useTranslations('leaderboard.common');
  return (
    <header className="mb-2 flex items-center justify-between gap-4">
      <SmartLink
        href={backHref}
        aria-label={tc('backAriaLabel')}
        className="-ml-2 inline-flex h-11 w-11 items-center justify-center text-lg text-text"
      >
        ‹
      </SmartLink>
      <Kicker tone="accent">{gameName.toUpperCase()}</Kicker>
      <span className="w-11" aria-hidden />
    </header>
  );
}
