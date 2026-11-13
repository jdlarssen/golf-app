import { Skeleton } from '@/components/ui/Skeleton';
import { SmartLink } from '@/components/ui/SmartLink';
import {
  BaneIcon,
  ChevronRightIcon,
  FlaggIcon,
  FormatsIcon,
  KalenderIcon,
  KonvoluttIcon,
  LaurbaerIcon,
  PokalIcon,
  ScorekortIcon,
} from '@/components/icons';

// ─── Tile grid (presentational) ────────────────────────────────────────────
//
// Pure presentational tile primitives, used by the admin door lists
// (/admin/mer and /admin/cup-og-liga, #2345) and the player Klubbhuset room
// (#892) without pulling the admin data-context — and importable from unit
// tests without tripping `server-only`.

export type TileIconKind =
  | 'flagg'
  | 'konvolutt'
  | 'bane'
  | 'pokal'
  | 'kalender'
  | 'formats'
  | 'laurbaer'
  | 'spillformater';

export type Tile = {
  label: string;
  href: string;
  /** Sub-label under the title. */
  meta?: string;
  icon: TileIconKind;
  accent?: boolean;
  /** Hook for tests/e2e to address one specific tile. */
  testId?: string;
};

/**
 * Dense tile list (#1559): a full-width row per door, icon left, title + meta
 * stacked, arrow right. The meta line carries the room's count, which is why
 * the admin's «Mer» and «Cuper og ligaer» lists (#2345) and the player room
 * use it. Full width so long labels never clip; `accent` gives a door weight.
 *
 * Tiles carry no badge (owner calls 2026-08-11 + #1560): a bare champagne
 * number doesn't say what it counts — the words in the tile's own meta
 * («3 nye ideer») carry the signal instead.
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
          <ChevronRightIcon
            className="shrink-0"
            style={{
              color: tile.accent
                ? 'rgba(240, 237, 229, 0.75)'
                : 'var(--text-muted)',
            }}
          />
        </SmartLink>
      ))}
    </div>
  );
}

function TileIcon({ kind, size = 22 }: { kind: TileIconKind; size?: number }) {
  if (kind === 'flagg') return <FlaggIcon width={size} height={size} />;
  if (kind === 'konvolutt') return <KonvoluttIcon width={size} height={size} />;
  if (kind === 'bane') return <BaneIcon width={size} height={size} />;
  if (kind === 'kalender') return <KalenderIcon width={size} height={size} />;
  if (kind === 'formats') return <FormatsIcon width={size} height={size} />;
  if (kind === 'laurbaer') return <LaurbaerIcon width={size} height={size} />;
  if (kind === 'spillformater') return <ScorekortIcon width={size} height={size} />;
  return <PokalIcon width={size} height={size} />;
}

/**
 * `DenseTileList`'s row shape (full-width row, 36 × 36 icon, two lines) as a
 * skeleton, for the role-neutral `/admin` loading skeleton (#2488): the
 * player room's rows use `DenseTileList`.
 */
export function DenseTileListSkeleton({ rows }: { rows: number }) {
  return (
    <div className="mb-2 grid grid-cols-1 gap-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex min-h-[60px] items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-2.5"
        >
          <Skeleton className="h-9 w-9 shrink-0 rounded-[9px]" delay={i * 90} />
          <div className="flex-1">
            <Skeleton className="h-4 w-20" delay={i * 90 + 30} />
            <Skeleton className="mt-1.5 h-3 w-28" delay={i * 90 + 60} />
          </div>
        </div>
      ))}
    </div>
  );
}
