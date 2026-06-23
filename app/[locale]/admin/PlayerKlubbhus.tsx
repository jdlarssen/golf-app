import { getTranslations } from 'next-intl/server';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { ClubStamp } from '@/components/ui/ClubStamp';
import { PullQuote } from '@/components/ui/PullQuote';
import { firstName } from '@/lib/firstName';
import { type AdminRoleContext } from '@/lib/admin/auth';
import { TileGridView, type Tile } from './TilesGrid';

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

  const banerTile: Tile = {
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
