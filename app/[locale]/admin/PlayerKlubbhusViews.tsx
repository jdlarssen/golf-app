import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { SmartLink } from '@/components/ui/SmartLink';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusChip, type StatusChipTone } from '@/components/ui/StatusChip';
import { TileGridView, type Tile } from './TilesView';
import type { GameStatus } from '@/lib/games/status';
import type { MyClub } from '@/lib/clubs/getMyClubs';

// Presentational views for the adaptive player Klubbhuset room (#892). Pure
// (data injected as props, sync `useTranslations`) so the data-fetching shell
// in PlayerKlubbhus.tsx stays thin and these render in unit tests without a
// Supabase mock.

const SECTION_LABEL =
  'mb-2 px-1 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted';

const QUIET_LINK =
  'inline-flex min-h-[44px] items-center rounded font-sans text-xs font-medium text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40';

const ROW_LINK =
  'block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40';

/** Game-arranged here carries its name already locale-resolved by the fetcher. */
export type ArrangedGame = {
  id: string;
  name: string;
  courseName: string | null;
  status: GameStatus;
};

const STATUS_TO_TONE: Record<GameStatus, StatusChipTone> = {
  draft: 'utkast',
  scheduled: 'påmelding',
  active: 'aktiv',
  finished: 'signert',
};

/**
 * Greeting — always shown, paints immediately (no await). ClubStamp and the
 * pull-quote are dropped on the player view per #892 (Sekretariat flourish,
 * not the player room).
 */
export function GreetingView({ name }: { name: string | null }) {
  const t = useTranslations('admin.dashboard');
  return (
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
        {name ? t('playerGreeting', { name }) : t('playerGreetingNoName')}
      </h1>
      <p className="mt-1.5 font-sans text-xs text-muted">{t('playerSubtitle')}</p>
    </section>
  );
}

/**
 * Arrangement block — the invitation ⇄ arranged switch plus the optional cup
 * row. With no created games it leads with the «Sett opp en runde» invitation
 * (never an empty list); with ≥1 it shrinks the invitation to a quiet
 * «+ Ny runde» affordance above the capped list. The cup row appears whenever
 * the player has ≥1 personal cup, independent of games (#10 discoverability).
 */
export function ArrangementView({
  games,
  hasMore,
  cupCount,
}: {
  games: ArrangedGame[];
  hasMore: boolean;
  cupCount: number;
}) {
  const t = useTranslations('admin.dashboard');
  const hasGames = games.length > 0;

  return (
    <section className="mb-6">
      {hasGames ? (
        <>
          <div className="mb-2 flex items-center justify-between gap-3 px-1">
            <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
              {t('playerArrangedLabel')}
            </p>
            <SmartLink
              href="/opprett-spill"
              data-testid="player-new-round"
              className={QUIET_LINK}
            >
              + {t('playerNewRound')}
            </SmartLink>
          </div>
          <nav className="space-y-2">
            {games.map((g) => (
              <SmartLink
                key={g.id}
                href={`/games/${g.id}`}
                data-testid="player-arranged-game"
                className={ROW_LINK}
              >
                <Card className="min-h-[44px] p-4 transition-colors hover:border-primary/30">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <span className="block truncate font-serif text-[15px] font-medium tracking-tight text-text">
                        {g.name}
                      </span>
                      {g.courseName && (
                        <span className="mt-0.5 block truncate text-xs text-muted">
                          {g.courseName}
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <StatusChip tone={STATUS_TO_TONE[g.status]} />
                      <span aria-hidden className="text-muted">
                        →
                      </span>
                    </div>
                  </div>
                </Card>
              </SmartLink>
            ))}
          </nav>
          {hasMore && (
            <div className="mt-2 text-right">
              <SmartLink
                href="/klubbhuset"
                data-testid="player-see-all"
                className={QUIET_LINK}
              >
                {t('playerSeeAll')} →
              </SmartLink>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-3">
          <LinkButton
            href="/opprett-spill"
            full
            className="bg-primary text-white dark:text-bg"
            data-testid="player-invite-primary"
          >
            {t('playerInviteHeading')}
          </LinkButton>
          <div className="text-center">
            <SmartLink
              href="/opprett-spill?intent=cup"
              data-testid="player-invite-cup"
              className="inline-flex min-h-[44px] items-center rounded font-sans text-sm text-muted underline underline-offset-2 hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              {t('playerInviteOrCup')}
            </SmartLink>
          </div>
        </div>
      )}

      {cupCount > 0 && (
        <SmartLink
          href="/admin/cup"
          data-testid="player-cup-row"
          className={`mt-2 ${ROW_LINK}`}
        >
          <Card className="min-h-[44px] bg-surface/60 p-4 transition-colors hover:border-primary/30">
            <div className="flex items-center justify-between gap-3">
              <span className="font-sans text-sm font-medium text-text">
                {t('playerCupRow', { n: cupCount })}
              </span>
              <span aria-hidden className="text-muted">
                →
              </span>
            </div>
          </Card>
        </SmartLink>
      )}
    </section>
  );
}

export function ArrangementSkeleton() {
  return (
    <section className="mb-6 space-y-3">
      <Skeleton className="h-12 w-full rounded-full" />
      <Skeleton className="mx-auto h-4 w-28" delay={60} />
    </section>
  );
}

/**
 * Dine klubber — inline list of the player's clubs (the club page owns the
 * depth). With no clubs the section collapses to a discreet «ikke med i en
 * klubb ennå»-line that keeps the door open to /klubber.
 */
export function ClubsView({ clubs }: { clubs: MyClub[] }) {
  const t = useTranslations('admin.dashboard');
  const tRoles = useTranslations('klubb.roles');

  if (clubs.length === 0) {
    return (
      <section className="mb-6">
        <SmartLink
          href="/klubber"
          data-testid="player-no-club"
          className="inline-flex min-h-[44px] items-center rounded font-sans text-sm text-muted hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          {t('playerNoClub')} →
        </SmartLink>
      </section>
    );
  }

  return (
    <section className="mb-6">
      <p className={SECTION_LABEL}>{t('playerClubsLabel')}</p>
      <nav className="space-y-2">
        {clubs.map((club) => (
          <SmartLink
            key={club.id}
            href={`/klubber/${club.id}`}
            data-testid="player-club-row"
            className={ROW_LINK}
          >
            <Card className="min-h-[44px] p-4 transition-colors hover:border-primary/30">
              <div className="flex items-center justify-between gap-3">
                <span className="block truncate font-serif text-[15px] font-medium tracking-tight text-text">
                  {club.name}
                </span>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="rounded-full border border-border px-2.5 py-0.5 font-sans text-xs text-muted">
                    {tRoles(club.role)}
                  </span>
                  <span aria-hidden className="text-muted">
                    →
                  </span>
                </div>
              </div>
            </Card>
          </SmartLink>
        ))}
      </nav>
    </section>
  );
}

export function ClubsSkeleton() {
  return (
    <section className="mb-6 space-y-2">
      <Skeleton className="ml-1 h-3 w-24" />
      <Skeleton className="h-14 w-full rounded-2xl" delay={60} />
    </section>
  );
}

/**
 * Verktøy — always shown, de-emphasised tools at the bottom of the room:
 * adding a course and browsing the format reference. Reuses TileGridView so
 * the cards match the admin grid chrome.
 */
export function ToolsView() {
  const t = useTranslations('admin.dashboard');
  const tiles: Tile[] = [
    {
      label: t('playerBaner'),
      href: '/opprett-bane',
      meta: t('playerBanerMeta'),
      icon: 'bane',
    },
    {
      label: t('playerSpillformater'),
      href: '/spillformater',
      meta: t('playerSpillformaterMeta'),
      icon: 'spillformater',
    },
    {
      label: t('playerForeslaaIde'),
      href: '/foreslaa-ide',
      meta: t('playerForeslaaIdeMeta'),
      icon: 'sparkle',
    },
  ];
  return (
    <section>
      <p className={SECTION_LABEL}>{t('playerToolsLabel')}</p>
      <TileGridView tiles={tiles} />
    </section>
  );
}
