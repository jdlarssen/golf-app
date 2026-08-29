import type { JSX, ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  LeaderboardBackLink,
  LeaderboardBackLinkSpacer,
} from '@/components/ui/LeaderboardBackLink';
import { AppShell } from '@/components/ui/AppShell';
import { Kicker } from '@/components/ui/Kicker';
import { LeaderboardBackdrop } from '@/components/illustrations/LeaderboardBackdrop';
import { LeaderboardRealtime } from './LeaderboardRealtime';
import { ShareResultButton } from './ShareResultButton';
import { MyScorecardCta } from './MyScorecardCta';
import { PuttsBackfillCta } from './PuttsBackfillCta';
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
 * Clips decoration that deliberately paints outside the leaderboard content
 * box, so it can no longer push the document sideways (#1739). `ConfettiBurst`
 * anchors an `absolute; height: 0; overflow: visible` container to the leader
 * card and translates each piece up to ±210px horizontally — transformed
 * absolute boxes still contribute to the document's rightward scrollable
 * overflow, which put a horizontal scrollbar on a 375px viewport.
 *
 * `overflow-x: clip` rather than `hidden`: clip does NOT establish a scroll
 * container, so no new scroll behavior is introduced anywhere in the tree
 * (nothing here is `sticky`, portalled, or horizontally scrollable). Vertical
 * overflow is untouched.
 *
 * Safari floor: `overflow: clip` needs iOS/Safari ≥ 16. Older Safari simply
 * does not clip — the side-scroll symptom remains there, nothing breaks.
 */
const DECOR_CLIP = 'overflow-x-clip';

/**
 * Full-page variant: the clip plus a 16px outset (`-mx-4 px-4`) that moves the
 * clip edge outside the content box without changing layout, because
 * `overflow: clip` clips hit-testing and focus rings as well as paint. The
 * in-shell back arrow is `LeaderboardBackLink` (`components/ui/`) — rendered by
 * `LeaderboardHeader` below (used by the `*HolesView.tsx` files among others)
 * and by the local headers in `HeadToHeadResult` and `State4View`. It hangs 8px
 * left via `-ml-2`, and the global focus ring adds 4px outside that box
 * (`outline-offset: 2px` plus a 2px `outline`, see `app/globals.css`). 16px
 * covers both with margin; the old 8px landed the clip edge exactly on the
 * arrow's border box and cut the left segment of its keyboard focus ring. Not
 * `data-focus-inset` on the root: that would re-inset rings for the whole
 * subtree, not just the arrow.
 * (`overflow-clip-margin` would be the tidier tool but Safari lacks it.)
 *
 * Safe only here: this branch's root sits inside `AppShell` (`max-w-md px-5`),
 * and 20px of padding absorbs the 16px pull, so even at 360px the border box
 * never reaches the viewport edge.
 *
 * The chromeless branch deliberately does NOT get the outset. It has no padded
 * ancestor — on the finished-game path the caller renders it as a bare sibling
 * of the podium, directly under the page body — so `-mx-4` there would make the
 * used width `viewport + 32px` and reintroduce the very side-scroll #1739
 * fixed. It needs no compensation either: every in-shell back arrow is gated
 * behind `!chromeless` at its call site (`HeadToHeadResult`, `State4View`,
 * `SkinsView`, the podiums, …), so no `LeaderboardBackLink` — and thus no
 * `-ml-2` overhang — renders in that branch.
 */
const DECOR_CLIP_INSET = `${DECOR_CLIP} -mx-4 px-4`;

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
      {/* Renders only when the authed page mounts PuttsBackfillCtaProvider (#1290). */}
      <PuttsBackfillCta />
      {/* Renders only when the authed page mounts RevansjeCtaProvider (#1020). */}
      <RevansjeCta />
    </>
  ) : null;

  if (chromeless) {
    return (
      <div className={`relative isolate ${DECOR_CLIP}`}>
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
      <div className={`relative isolate pb-12 ${DECOR_CLIP_INSET}`}>
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
      <LeaderboardBackLink href={backHref} label={tc('backAriaLabel')} />
      {/* min-w-0 + truncate: lange navn klippes i stedet for å presse pilene (#1765). */}
      <Kicker tone="accent" className="min-w-0 truncate">
        {gameName.toUpperCase()}
      </Kicker>
      <LeaderboardBackLinkSpacer />
    </header>
  );
}
