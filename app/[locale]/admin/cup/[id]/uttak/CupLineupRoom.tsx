import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AdminShell } from '@/components/ui/AdminShell';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { PageHeader } from '@/components/ui/PageHeader';
import { loadCupLineupBoard } from '@/lib/cup/lineupData';
import { CupLineupBoard } from './CupLineupBoard';

/**
 * Uttaks-rommet (#1884) — ett rom, to lesninger: arrangøren ser begge lag og
 * styrer øktene, kapteinen ser og fyller sitt eget uttak.
 *
 * ⚠️ Gaten ER `loadCupLineupBoard` → `access.role`. De nye tabellene har ingen
 * RLS-policyer (0172, deny-by-default), så ruta gater ikke med
 * `requireAdminOrClubAdminOfCup` slik søsterrommene gjør — den gaten
 * redirecter og slipper ikke kapteiner inn i det hele tatt, siden kapteiner
 * ikke er admins. Rommet ligger likevel under `/admin` fordi den layouten er
 * auth-only (#392) og hver underrute gater seg selv.
 *
 * `notFound()` framfor redirect for en bruker uten rolle: en cup uten
 * kapteiner og en cup du ikke har noe med å gjøre skal se like ut utenfra.
 */
export async function CupLineupRoom({
  tournamentId,
  variant,
  groupId,
}: {
  tournamentId: string;
  variant: 'admin' | 'club';
  groupId?: string | null;
}) {
  const t = await getTranslations('cup');
  const board = await loadCupLineupBoard(tournamentId, t('manage.unknownPlayer'));
  if (!board || board.access.role.kind === 'none') notFound();

  const Shell = variant === 'club' ? AppShell : AdminShell;
  const backHref =
    variant === 'club' && groupId
      ? `/klubber/${groupId}/cup/${tournamentId}`
      : `/admin/cup/${tournamentId}`;

  return (
    <Shell>
      <TopBar backHref={backHref} kicker={t('ledger.kicker')} />
      <BrassRibbon kicker={board.cupName} />
      <PageHeader
        title={t('lineup.pageTitle')}
        subtitle={
          board.access.role.kind === 'organizer'
            ? t('lineup.subtitleOrganizer')
            : t('lineup.subtitleCaptain')
        }
      />
      <CupLineupBoard tournamentId={tournamentId} board={board} />
    </Shell>
  );
}
