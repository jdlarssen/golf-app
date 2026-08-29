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
  /** Sub-label under the title. Rendered by `DenseTileList` only — the compact
   *  grid drops it — so tiles that only ever appear compact can omit it. */
  meta?: string;
  icon: TileIconKind;
  accent?: boolean;
  /** Hook for tests/e2e to address one specific tile. */
  testId?: string;
};

/**
 * Dense tile list — the everyday core doors on mobile (#1559). Same data as
 * the compact grid in a full-width row: icon left, title + meta stacked, arrow
 * right. Chosen over the compact grid for these four because the meta line is
 * why they sit on the front page at all — a door without its count is just a
 * menu, and the menu already lives in «Mer i Sekretariatet» below.
 *
 * Full width (not two columns) so long labels like «Resultatprotokoll» never
 * clip, and `accent` carries over so the primary door keeps its weight.
 *
 * Tiles carry no badge (owner calls 2026-08-11 + #1560): a bare champagne
 * number doesn't say what it counts — the words in the tile's own meta
 * («35 registrert · 2 venter», «3 nye ideer») or the «Krever handling»-stripe
 * carry the signal instead. The last badge user died with #1560.
 */
export function DenseTileList({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="mb-2 grid grid-cols-1 gap-2">
      {tiles.map((tile, i) => (
        <SmartLink
          key={tile.label}
          href={tile.href}
          data-testid={tile.testId}
          className="reveal-up flex min-h-[60px] items-center gap-3 rounded-xl px-3.5 py-2.5 text-left transition-opacity duration-100 hover:opacity-95 active:opacity-90"
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
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px]"
            style={{
              background: tile.accent
                ? 'rgba(201, 169, 97, 0.20)'
                : 'var(--admin-bg)',
              color: tile.accent ? 'var(--accent)' : 'var(--primary)',
            }}
          >
            <TileIcon kind={tile.icon} size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-serif text-[15px] font-medium tracking-[-0.005em]">
              {tile.label}
            </span>
            {tile.meta && (
              <span
                className="mt-0.5 block font-sans text-[11px] tabular-nums"
                style={{
                  color: tile.accent
                    ? 'rgba(240, 237, 229, 0.75)'
                    : 'var(--text-muted)',
                }}
              >
                {tile.meta}
              </span>
            )}
          </span>
          <span
            aria-hidden
            className="shrink-0 text-[15px]"
            style={{
              color: tile.accent
                ? 'rgba(240, 237, 229, 0.75)'
                : 'var(--text-muted)',
            }}
          >
            →
          </span>
        </SmartLink>
      ))}
    </div>
  );
}

/**
 * Compact tile grid — the «Mer i Sekretariatet»-section (#914). Same data
 * shape as DenseTileList but a denser single-row layout (icon + label, meta
 * dropped) so the everyday core cards stay visually dominant. Tap target stays
 * ≥44px (min-h-[56px]).
 *
 * `columns` drops to 1 for a lone tile (#1557: the player room's cup entry),
 * which would otherwise sit half-width with dead space beside it.
 */
export function CompactTileGrid({
  tiles,
  columns = 2,
}: {
  tiles: Tile[];
  columns?: 1 | 2;
}) {
  return (
    <div
      className={`mb-2 grid gap-2.5 ${columns === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}
    >
      {tiles.map((tile, i) => (
        <SmartLink
          key={tile.label}
          href={tile.href}
          data-testid={tile.testId}
          className="reveal-up relative flex min-h-[56px] items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2.5 text-left text-text transition-opacity duration-100 hover:opacity-95 active:opacity-90"
          style={{ animationDelay: `${60 + i * 70}ms` }}
        >
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
