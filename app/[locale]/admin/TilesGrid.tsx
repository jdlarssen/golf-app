import { getTranslations, getLocale } from 'next-intl/server';
import { SmartLink } from '@/components/ui/SmartLink';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { ClubStamp } from '@/components/ui/ClubStamp';
import { PullQuote } from '@/components/ui/PullQuote';
import { Skeleton } from '@/components/ui/Skeleton';
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
import { firstName } from '@/lib/firstName';
import { formatShortOsloDayMonthLocale } from '@/lib/i18n/format';
import type { AppLocale } from '@/i18n/routing';
import { type AdminRoleContext } from '@/lib/admin/auth';
import { getAdminContext } from './_dashboardContext';

// ─── Tile grid ───────────────────────────────────────────────────────────

export type TileIconKind = 'flagg' | 'konvolutt' | 'bane' | 'pokal' | 'sparkle' | 'formats' | 'laurbaer' | 'spillformater';
export type Tile = {
  label: string;
  href: string;
  meta: string;
  icon: TileIconKind;
  accent?: boolean;
};

export async function TilesGrid() {
  // Admin-only: the page branches non-admins to PlayerKlubbhus before reaching
  // here, so these counts (all games / all users / all courses) only ever run
  // for an admin.
  const { supabase } = await getAdminContext();
  const t = await getTranslations('admin.dashboard');
  const locale = await getLocale();
  const now = new Date();

  const [
    activeGamesRes,
    plannedGamesRes,
    pendingInvitesRes,
    usersRes,
    coursesRes,
    lastFinishedRes,
    lastPublishedRes,
    activeCupsRes,
    activeLeaguesRes,
  ] = await Promise.all([
    supabase
      .from('games')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active'),
    supabase
      .from('games')
      .select('id', { count: 'exact', head: true })
      .in('status', ['draft', 'scheduled']),
    supabase
      .from('invitations')
      .select('id', { count: 'exact', head: true })
      .is('accepted_at', null)
      .gt('expires_at', now.toISOString()),
    supabase.from('users').select('id', { count: 'exact', head: true }),
    supabase.from('courses').select('id', { count: 'exact', head: true }),
    supabase
      .from('games')
      .select('ended_at')
      .eq('status', 'finished')
      .order('ended_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('product_updates')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('tournaments')
      .select('id', { count: 'exact', head: true })
      .in('status', ['draft', 'active']),
    supabase
      .from('leagues')
      .select('id', { count: 'exact', head: true })
      .in('status', ['draft', 'active']),
  ]);

  const activeCount = activeGamesRes.count ?? 0;
  const plannedCount = plannedGamesRes.count ?? 0;
  const pendingInvites = pendingInvitesRes.count ?? 0;
  const userCount = usersRes.count ?? 0;
  const courseCount = coursesRes.count ?? 0;
  const lastFinishedAt = (lastFinishedRes.data as { ended_at: string | null } | null)
    ?.ended_at;
  const lastPublishedAt = (
    lastPublishedRes.data as { created_at: string | null } | null
  )?.created_at;
  const activeCupCount = activeCupsRes.count ?? 0;
  const activeLeagueCount = activeLeaguesRes.count ?? 0;

  const tiles: Tile[] = [
    {
      label: t('tilesSpill'),
      href: '/admin/games',
      meta: t('metaActiveAndPlanned', { active: activeCount, planned: plannedCount }),
      icon: 'flagg',
      accent: true,
    },
    {
      label: t('tilesSpillere'),
      href: '/admin/spillere',
      meta:
        userCount === 0
          ? t('metaNoneRegistered')
          : pendingInvites > 0
            ? t('metaRegisteredPending', { n: userCount, pending: pendingInvites })
            : t('metaRegistered', { n: userCount }),
      icon: 'konvolutt',
    },
    {
      label: t('tilesBaner'),
      href: '/admin/courses',
      meta:
        courseCount === 0
          ? t('metaNoneRegistered')
          : t('metaRegistered', { n: courseCount }),
      icon: 'bane',
    },
    {
      label: t('tilesProtokoll'),
      href: '/admin/games?status=finished',
      meta: lastFinishedAt
        ? t('metaLastSigned', { date: formatShortOsloDayMonthLocale(lastFinishedAt, locale as AppLocale) })
        : t('metaNoneSigned'),
      icon: 'pokal',
    },
    {
      label: t('tilesLanseringer'),
      href: '/admin/lanseringer',
      meta: lastPublishedAt
        ? t('metaLastPublished', { date: formatShortOsloDayMonthLocale(lastPublishedAt, locale as AppLocale) })
        : t('metaNonePublished'),
      icon: 'sparkle',
    },
    {
      label: t('tilesCuper'),
      href: '/admin/cup',
      meta:
        activeCupCount === 0
          ? t('metaNoneActive')
          : t('metaActive', { n: activeCupCount }),
      icon: 'pokal',
    },
    {
      label: t('tilesLigaer'),
      href: '/admin/liga',
      meta:
        activeLeagueCount === 0
          ? t('metaNoneActive')
          : t('metaActive', { n: activeLeagueCount }),
      icon: 'pokal',
    },
    // F3 (#273): admin format-mapping. Mappings + cup-eligibility +
    // active-flagg styres herfra. Meta er statisk (vi har ingen tellbar
    // KPI per d.d. — kan utvides hvis vi vil vise antall aktive formats).
    {
      label: t('tilesFormats'),
      href: '/admin/formats',
      meta: t('metaFormats'),
      icon: 'formats',
    },
    // #50: klubber — admin governance (opprett og styr klubber).
    {
      label: t('tilesKlubber'),
      href: '/admin/klubber',
      meta: t('metaKlubber'),
      icon: 'laurbaer',
    },
    // #500: oppslagsverket — et rolig sted å lese om formatene (flyttet hit fra
    // Hjem; den raske «slik funker det» bor bak «?» i veiviseren).
    {
      label: t('tilesSpillformater'),
      href: '/spillformater',
      meta: t('metaSpillformater'),
      icon: 'spillformater',
    },
  ];

  return <TileGridView tiles={tiles} />;
}

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
          className="reveal-up min-h-[108px] rounded-2xl px-3.5 pt-3.5 pb-3 text-left"
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
 * Regular-player (and trusted-creator) view of the universal Klubbhuset room
 * (#392). No admin counts, no activity ledger — just the two surfaces a
 * non-admin owns: the games they arrange (Spill → /klubbhuset) and adding a
 * course (Baner). Trusted creators reach the full course catalog; regular
 * players get the create-only door (#366 gave them create, not edit).
 */
export async function PlayerKlubbhus({ role }: { role: AdminRoleContext }) {
  const t = await getTranslations('admin.dashboard');
  const tNav = await getTranslations('admin.nav');
  // Display name is already on the role context (lib/admin/auth.ts) — no need
  // for a second `users` round-trip. With this gone PlayerKlubbhus awaits no
  // data of its own and paints immediately.
  const firstNameValue = firstName(role.name);

  const banerTile: Tile = role.isTrusted
    ? {
        label: t('playerBaner'),
        href: '/admin/courses',
        meta: t('playerBanerTrustedMeta'),
        icon: 'bane',
      }
    : {
        label: t('playerBaner'),
        href: '/opprett-bane',
        meta: t('playerBanerMeta'),
        icon: 'bane',
      };

  const tiles: Tile[] = [
    {
      label: t('playerSpill'),
      href: '/klubbhuset',
      meta: t('playerSpillMeta'),
      icon: 'flagg',
      accent: true,
    },
    banerTile,
    // #442: klubber — opprett og styr klubber.
    {
      label: t('playerKlubber'),
      href: '/klubber',
      meta: t('playerKlubberMeta'),
      icon: 'laurbaer',
    },
    // #500: oppslagsverket — også for vanlige spillere, så de beholder browse-
    // tilgang til formatene når format-kortet fjernes fra Hjem.
    {
      label: t('playerSpillformater'),
      href: '/spillformater',
      meta: t('playerSpillformaterMeta'),
      icon: 'spillformater',
    },
  ];

  return (
    <AdminShell>
      <TopBar backHref="/" kicker={tNav('klubbhus')} />

      <section
        className="relative mb-4 overflow-hidden rounded-2xl border px-5 py-[18px]"
        style={{
          background:
            'linear-gradient(180deg, var(--admin-salutation-top) 0%, var(--admin-salutation-bottom) 100%)',
          borderColor: 'var(--admin-salutation-border)',
        }}
      >
        <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          {t('klubbhusLabel')}
        </p>
        <h1 className="mt-1 font-serif text-[22px] font-medium leading-snug tracking-[-0.015em] text-text">
          {firstNameValue
            ? t('playerGreeting', { name: firstNameValue })
            : t('playerGreetingNoName')}
        </h1>
        <p className="mt-1.5 font-sans text-xs text-muted">
          {t('playerSubtitle')}
        </p>
        <ClubStamp className="absolute right-[14px] top-[14px]" />
      </section>

      <TileGridView tiles={tiles} />

      <PullQuote className="mt-6">
        {t('playerPullQuote')}
      </PullQuote>
    </AdminShell>
  );
}

export function TilesSkeleton() {
  return (
    <div className="mb-2 grid grid-cols-2 gap-2.5">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="min-h-[108px] rounded-2xl border border-border bg-surface px-3.5 pt-3.5 pb-3"
        >
          <Skeleton className="mb-2.5 h-9 w-9 rounded-[9px]" delay={i * 90} />
          <Skeleton className="h-4 w-16" delay={i * 90 + 30} />
          <Skeleton className="mt-1.5 h-3 w-24" delay={i * 90 + 60} />
        </div>
      ))}
    </div>
  );
}

function TileIcon({ kind }: { kind: TileIconKind }) {
  if (kind === 'flagg') return <FlaggIcon width={22} height={22} />;
  if (kind === 'konvolutt') return <KonvoluttIcon width={22} height={22} />;
  if (kind === 'bane') return <BaneIcon width={22} height={22} />;
  if (kind === 'sparkle') return <SparkleIcon width={22} height={22} />;
  if (kind === 'formats') return <FormatsIcon width={22} height={22} />;
  if (kind === 'laurbaer') return <LaurbaerIcon width={22} height={22} />;
  if (kind === 'spillformater') return <ScorekortIcon width={22} height={22} />;
  return <PokalIcon width={22} height={22} />;
}

