import { SmartLink } from './SmartLink';

/**
 * The leaderboard headers' back-arrow box, in one place (#1747). Five surfaces
 * hand-rolled this exact string before — `LeaderboardHeader`,
 * `HeadToHeadResult`, `State4View`, the holes drilldown and its skeleton — and
 * two of them had drifted to a 32px box, below the ≥44px tap target the rest of
 * the app holds.
 *
 * Two parts are load-bearing, so change neither casually:
 * - `h-11 w-11` — the 44px tap target (iOS HIG). The glyph stays `text-lg`; the
 *   box grows around it, it does not scale.
 * - `-ml-2` — the 8px left overhang that optically aligns the chevron with the
 *   content edge. `DECOR_CLIP_INSET` in `LeaderboardChrome.tsx` compensates for
 *   exactly this overhang plus the focus ring; dropping it here would leave that
 *   16px outset unexplained, and widening it would push the arrow out of the clip.
 */
// `shrink-0` is part of the tap-target guarantee: the headers are flex rows,
// and without it a long game name compresses the box below 44px (#1765) —
// `w-11` is only a basis in flex layout, not a floor.
const BACK_LINK_BOX =
  '-ml-2 inline-flex h-11 w-11 shrink-0 items-center justify-center text-lg text-text';

/**
 * Back arrow for the leaderboard headers. `label` is the already-translated
 * `aria-label` — the glyph itself is decorative, so the label is the only text a
 * screen reader gets.
 */
export function LeaderboardBackLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <SmartLink href={href} aria-label={label} className={BACK_LINK_BOX}>
      ‹
    </SmartLink>
  );
}

/**
 * Right-hand counterweight for the back arrow, so the header title stays
 * optically centred. Width matches the arrow's box (the `-ml-2` overhang is
 * deliberately not mirrored — it only shifts the glyph, not the layout column).
 */
export function LeaderboardBackLinkSpacer() {
  return <span className="w-11 shrink-0" aria-hidden />;
}

/**
 * Non-interactive stand-in with identical geometry, for skeleton headers that
 * paint before the real link's href is known. Keeps the skeleton and the loaded
 * header pixel-identical so nothing jumps when the content arrives.
 */
export function LeaderboardBackLinkPlaceholder() {
  return <span className={BACK_LINK_BOX}>‹</span>;
}
