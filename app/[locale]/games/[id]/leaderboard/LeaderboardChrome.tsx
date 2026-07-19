import type { JSX, ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { SmartLink } from '@/components/ui/SmartLink';
import { AppShell } from '@/components/ui/AppShell';
import { Kicker } from '@/components/ui/Kicker';
import { LeaderboardBackdrop } from '@/components/illustrations/LeaderboardBackdrop';
import { LeaderboardRealtime } from './LeaderboardRealtime';
import { ShareResultButton } from './ShareResultButton';
import { MyScorecardCta } from './MyScorecardCta';
import { RevansjeCta } from './RevansjeCta';

export interface LeaderboardShellProps {
  children: ReactNode;
  /**
   * Når `true`, dropper ytre `AppShell` — caller eier ytre page-chrome
   * (f.eks. inne i LeaderboardTabs eller når en podium wrapper). Default
   * `false` gir full-side-varianten med `AppShell` + bunn-padding.
   */
  chromeless?: boolean;
  /**
   * Valgfri hale-seksjon som rendres ETTER hovedinnholdet, men INNI shell-en
   * (#386-fiks): «Trukne spillere»-lista lå tidligere som søsken utenfor
   * `AppShell` og forsvant bak den faste bunn-navet. Ved å rendre den her får
   * den `AppShell`-ens bunn-padding og samme senterbredde som leaderboardet.
   */
  footerSlot?: ReactNode;
  /**
   * Når `false`, monteres IKKE de spill-koblede sidemontasjene
   * (`LeaderboardRealtime` + `ShareResultButton` + `RevansjeCta`). Default
   * `true` beholder dagens oppførsel for alle ekte spill-leaderboards.
   *
   * Prøvespill-demoen (#1042) setter `live={false}`: den har ingen bakenfor
   * liggende spill-rad, så realtime-abonnementet ville uansett vært inert
   * (`gameIdFromPath('/demo')` → `null`), men å la være å montere det gjør
   * demoens «null server-berøring»-garanti eksplisitt i stedet for å hvile på
   * at path-parsingen tilfeldigvis returnerer null.
   */
  live?: boolean;
}

/**
 * Delt ramme rundt alle poeng-format-leaderboardene: `LeaderboardBackdrop`
 * bak innholdet, valgfri `AppShell`-wrapper. Trukket ut fra ~40 identiske
 * lokale `Shell`-kopier (issue #598). `chromeless=false` (default) matcher
 * den paddede full-side-varianten; `chromeless=true` den bare backdrop-en.
 *
 * Montert her: `LeaderboardRealtime` (issue #679). Siden hver format-visning
 * rendrer gjennom denne shellen, får alle ~14 score-/standings-flatene live
 * auto-refresh uten at noen av visnings-filene må røres. Komponenten leser
 * spill-ID fra `window.location` siden shellen ikke får den som prop (ikke
 * `useParams`, som ville sprengt format-visnings-testene).
 */
export function LeaderboardShell({
  children,
  chromeless = false,
  footerSlot,
  live = true,
}: LeaderboardShellProps): JSX.Element {
  // Spill-koblede sidemontasjer — droppes helt når `live={false}` (demoen).
  // `LeaderboardRealtime` er den eneste som kan åpne et nettverkskall; de to
  // andre self-gater alt, men holdes under samme flagg siden ingen av dem gir
  // mening uten et ekte spill bak seg.
  const floatingCtas = live ? (
    <>
      {/* Self-gating: only renders on finished games (#942). */}
      <ShareResultButton />
      {/* Renders only when the authed page mounts MyScorecardCtaProvider (#1289). */}
      <MyScorecardCta />
      {/* Renders only when the authed page mounts RevansjeCtaProvider (#1020). */}
      <RevansjeCta />
    </>
  ) : null;

  if (chromeless) {
    return (
      <div className="relative isolate">
        {live && <LeaderboardRealtime />}
        <LeaderboardBackdrop />
        <div className="relative">{children}</div>
        {footerSlot}
        {floatingCtas}
      </div>
    );
  }
  return (
    <AppShell>
      <div className="relative isolate pb-12">
        {live && <LeaderboardRealtime />}
        <LeaderboardBackdrop />
        <div className="relative">{children}</div>
        {footerSlot}
        {floatingCtas}
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
