import { SmartLink } from '@/components/ui/SmartLink';
import {
  BaneIcon,
  FlaggIcon,
  FormatsIcon,
  KonvoluttIcon,
  LaurbaerIcon,
  PokalIcon,
  ScorekortIcon,
  SparkleIcon,
} from '@/components/icons';

// ─── Tile grid (presentational) ────────────────────────────────────────────
//
// Pure presentational tile primitives, split out of TilesGrid.tsx so they can
// be reused by both the admin dashboard (server, data-fetching) and the
// player Klubbhuset room (#892) without pulling the admin data-context — and
// so they're importable from unit tests without tripping `server-only`.

export type TileIconKind =
  | 'flagg'
  | 'konvolutt'
  | 'bane'
  | 'pokal'
  | 'sparkle'
  | 'formats'
  | 'laurbaer'
  | 'spillformater';

export type Tile = {
  label: string;
  href: string;
  meta: string;
  icon: TileIconKind;
  accent?: boolean;
  /** Optional count surfaced as a champagne pill top-right (capped «9+»). */
  badge?: number;
};

/**
 * Presentational tile grid — shared by the admin dashboard (TilesGrid) and the
 * regular-player Klubbhuset view (PlayerKlubbhus) so both render identical
 * card chrome. The `accent` tile gets the champagne-on-forest treatment.
 */
export function TileGridView({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="mb-2 grid grid-cols-2 gap-2.5">
      {tiles.map((tile, i) => (
        <SmartLink
          key={tile.label}
          href={tile.href}
          className="reveal-up relative min-h-[108px] rounded-2xl px-3.5 pt-3.5 pb-3 text-left transition-opacity duration-100 hover:opacity-95 active:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          style={{
            animationDelay: `${60 + i * 70}ms`,
            background: tile.accent ? 'var(--surface-strong)' : 'var(--surface)',
            color: tile.accent ? 'var(--bg-tint)' : 'var(--text)',
            border: tile.accent ? 'none' : '1px solid var(--border)',
            boxShadow: tile.accent
              ? '0 4px 14px rgba(26, 46, 31, 0.15)'
              : '0 1px 2px rgba(26, 46, 31, 0.03)',
          }}
        >
          {tile.badge ? <TileBadge count={tile.badge} /> : null}
          <div
            className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-[9px]"
            style={{
              background: tile.accent
                ? 'rgba(201, 169, 97, 0.20)'
                : 'var(--admin-bg)',
              color: tile.accent ? 'var(--accent)' : 'var(--primary)',
            }}
          >
            <TileIcon kind={tile.icon} />
          </div>
          <p className="font-serif text-base font-medium tracking-[-0.005em]">
            {tile.label}
          </p>
          <p
            className="mt-0.5 font-sans text-[11px] tabular-nums"
            style={{
              color: tile.accent
                ? 'rgba(240, 237, 229, 0.75)'
                : 'var(--text-muted)',
            }}
          >
            {tile.meta}
          </p>
        </SmartLink>
      ))}
    </div>
  );
}

/**
 * Compact tile grid — the «Mer i Sekretariatet»-section (#914). Same data
 * shape as TileGridView but a denser single-row layout (icon + label, meta
 * dropped) so the everyday core cards stay visually dominant. Tap target stays
 * ≥44px (min-h-[56px]); the champagne badge is supported here too.
 */
export function CompactTileGrid({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="mb-2 grid grid-cols-2 gap-2.5">
      {tiles.map((tile, i) => (
        <SmartLink
          key={tile.label}
          href={tile.href}
          className="reveal-up relative flex min-h-[56px] items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2.5 text-left text-text transition-opacity duration-100 hover:opacity-95 active:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          style={{ animationDelay: `${60 + i * 70}ms` }}
        >
          {tile.badge ? <TileBadge count={tile.badge} /> : null}
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px]"
            style={{ background: 'var(--admin-bg)', color: 'var(--primary)' }}
          >
            <TileIcon kind={tile.icon} size={18} />
          </span>
          <span className="font-serif text-sm font-medium tracking-[-0.005em]">
            {tile.label}
          </span>
        </SmartLink>
      ))}
    </div>
  );
}

/**
 * Champagne count pill, top-right of a tile (#914). Reuses the BottomNav-dot
 * treatment — accent fill, page-bg border to lift it off the card — but carries
 * a number with `tabular-nums`, capped at «9+». Decorative: the count is also
 * conveyed by the tile meta / «Krever handling»-stripa, so it's aria-hidden.
 */
function TileBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      aria-hidden
      data-testid="tile-badge"
      className="absolute right-2.5 top-2.5 flex h-5 min-w-[20px] items-center justify-center rounded-full border-2 border-bg px-1 font-sans text-[11px] font-semibold tabular-nums"
      style={{ background: 'var(--accent)', color: 'var(--primary)' }}
    >
      {count > 9 ? '9+' : count}
    </span>
  );
}

function TileIcon({ kind, size = 22 }: { kind: TileIconKind; size?: number }) {
  if (kind === 'flagg') return <FlaggIcon width={size} height={size} />;
  if (kind === 'konvolutt') return <KonvoluttIcon width={size} height={size} />;
  if (kind === 'bane') return <BaneIcon width={size} height={size} />;
  if (kind === 'sparkle') return <SparkleIcon width={size} height={size} />;
  if (kind === 'formats') return <FormatsIcon width={size} height={size} />;
  if (kind === 'laurbaer') return <LaurbaerIcon width={size} height={size} />;
  if (kind === 'spillformater') return <ScorekortIcon width={size} height={size} />;
  return <PokalIcon width={size} height={size} />;
}
