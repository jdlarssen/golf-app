import { useTranslations } from 'next-intl';
import { SmartLink } from '@/components/ui/SmartLink';

/**
 * The six doors at the foot of the morning report (#2345), three by two over
 * a line. 46 px tall: the artboard's 44 px box plus its 1 px border on each
 * side (content-box), above the 44 px tap floor. No numbers: the rooms behind
 * them show their own. «Cuper og ligaer» and «Mer …» open short lists of the
 * doors the old tiles held, one door per room (#344).
 */
const DOORS = [
  { key: 'doorGames', href: '/admin/games' },
  { key: 'doorPlayers', href: '/admin/spillere' },
  { key: 'doorCourses', href: '/admin/courses' },
  { key: 'doorProtocol', href: '/admin/games?status=finished' },
  { key: 'doorCupsLeagues', href: '/admin/cup-og-liga' },
  { key: 'doorMore', href: '/admin/mer' },
] as const;

export function DoorGrid() {
  const t = useTranslations('admin.dashboard.morning');
  return (
    <nav
      aria-label={t('doorsLabel')}
      className="-mx-5 mt-4 grid grid-cols-3 gap-2 border-t border-border px-4 pb-4 pt-3"
    >
      {DOORS.map((door) => (
        <SmartLink
          key={door.key}
          href={door.href}
          data-testid={`morning-door-${door.key}`}
          className="flex min-h-[46px] items-center justify-center rounded-xl border border-border bg-surface px-1 text-center text-[13px] font-semibold text-primary transition-colors hover:bg-bg/50"
        >
          {t(door.key)}
        </SmartLink>
      ))}
    </nav>
  );
}
