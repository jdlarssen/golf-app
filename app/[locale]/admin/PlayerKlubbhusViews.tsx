import type { ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { SmartLink } from '@/components/ui/SmartLink';
import { Skeleton } from '@/components/ui/Skeleton';
import { SectionError } from '@/components/ui/SectionError';
import { RoomGroupHeading } from '@/components/games/ArrangedRoundsView';
import type { AppLocale } from '@/i18n/routing';
import type { MyClub } from '@/lib/clubs/getMyClubs';
import { formatTeeOffDateLocale } from '@/lib/i18n/format';
import { withKlubbhusOrigin } from '@/lib/url/klubbhusOrigin';

// Presentational views for the player's Klubbhus room (#892, redrawn in #2493
// after the room artboards `Klubbhus-forslag-rom-topp-*` / `-rom-rullet-*`).
// Pure (data injected as props, sync `useTranslations`) so the data-fetching
// shell in PlayerKlubbhus.tsx stays thin and these render in unit tests
// without a Supabase mock.

/**
 * Greeting — always shown, paints immediately. «Hei, Kari.» as the page's
 * heading, with no card, no second «Klubbhuset» label and no subtitle: the
 * TopBar above already names the room.
 */
export function GreetingView({ name }: { name: string | null }) {
  const t = useTranslations('admin.dashboard');
  return (
    <h1 className="pt-1.5 font-serif text-[28px] font-medium leading-[normal] text-text">
      {name ? t('playerGreeting', { name }) : t('playerGreetingNoName')}
    </h1>
  );
}

/**
 * «Lag en ny runde» — the room's one door for a new round (#2493; owner's
 * answer 2026-10-03: it stands here only). «Med kompiser» and «For klubben»
 * open the wizard with the tile chosen; someone who cannot make a club
 * tournament (`isClubAdminAnywhere`, the same guard as `IntentSelector`) gets
 * «Annen runde», the wizard without a preset.
 */
export function NewRoundCard({ isClubAdmin }: { isClubAdmin: boolean }) {
  const t = useTranslations('admin.dashboard');
  return (
    <section
      data-testid="new-round-card"
      data-focus-surface="strong"
      className="-mx-1 mt-3.5 flex flex-col gap-2.5 rounded-[18px] bg-surface-strong px-4 py-3.5 text-bg-tint"
    >
      <h2 className="font-serif text-xl font-semibold leading-[normal]">{t('newRoundTitle')}</h2>
      <div className="grid grid-cols-2 gap-2">
        <SmartLink
          href="/opprett-spill?intent=kompis"
          data-testid="new-round-friends"
          className="flex h-12 items-center justify-center rounded-full bg-bg-tint text-[15px] font-semibold leading-[normal] text-surface-strong"
        >
          {t('newRoundFriends')}
        </SmartLink>
        {isClubAdmin ? (
          <SmartLink
            href="/opprett-spill?intent=klubb"
            data-testid="new-round-club"
            className="flex h-12 items-center justify-center rounded-full border border-bg-tint/45 text-[15px] font-semibold leading-[normal] text-bg-tint"
          >
            {t('newRoundClub')}
          </SmartLink>
        ) : (
          <SmartLink
            href="/opprett-spill"
            data-testid="new-round-other"
            className="flex h-12 items-center justify-center rounded-full border border-bg-tint/45 text-[15px] font-semibold leading-[normal] text-bg-tint"
          >
            {t('newRoundOther')}
          </SmartLink>
        )}
      </div>
    </section>
  );
}

export function NewRoundCardSkeleton() {
  return (
    <div
      aria-hidden
      className="-mx-1 mt-3.5 flex flex-col gap-2.5 rounded-[18px] bg-surface-strong px-4 py-3.5"
    >
      <Skeleton className="h-6 w-40" />
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-12 rounded-full" delay={60} />
        <Skeleton className="h-12 rounded-full" delay={120} />
      </div>
    </div>
  );
}

/** Row heights the artboards draw: clubs and cups 64, tools 60 in the room and 56 for a new player. */
type RowHeight = 'min-h-16' | 'min-h-[60px]' | 'min-h-14';

/** A white card of rows, as every group in the room artboards draws it. */
function RoomCard({ children }: { children: ReactNode }) {
  return (
    <ul className="-mx-1 overflow-hidden rounded-2xl border border-border bg-surface">{children}</ul>
  );
}

/**
 * One row: name over a muted line, ending in «›». The whole row is the link.
 * `data` puts the row's numbers on the link as data attributes, so the
 * staging oracle checks them without reading Norwegian copy.
 */
function RoomRow({
  href,
  name,
  line,
  last,
  minHeight,
  testId,
  data,
}: {
  href: string;
  name: string;
  line: string;
  last: boolean;
  minHeight: RowHeight;
  testId: string;
  data?: Record<`data-${string}`, string | number>;
}) {
  return (
    <li>
      {/* The divider closes every row but the last and sits on the link,
          inside its min-height, as the artboard's border-box rows draw it:
          a row is 64 (60) px with it, and its text centres above it. */}
      <SmartLink
        href={href}
        data-testid={testId}
        {...data}
        className={`flex ${minHeight} items-center gap-3 px-3.5 py-2.5 text-text ${last ? '' : 'border-b border-row-divider-warm'}`}
      >
        <span className="min-w-0 grow">
          <span className="block text-[15px] font-semibold leading-[normal]">{name}</span>
          <span className="mt-0.5 block text-xs leading-[normal] text-muted">{line}</span>
        </span>
        <span aria-hidden className="text-[18px] leading-[normal] text-muted">
          ›
        </span>
      </SmartLink>
    </li>
  );
}

/** A club row's data: the club, your role, the member count and its next round. */
export type RoomClub = MyClub & {
  members: number;
  /** ISO tee-off of the next scheduled round with a time, or null. */
  nextRoundAt: string | null;
};

/**
 * Klubbene dine — role, member count and the next round per club (#2493). With
 * no clubs the section collapses to the discreet «ikke med i en klubb ennå»
 * line that keeps the door open to /klubber. `null` means a read failed
 * (#2490): an error box, not the «no club» line.
 */
export function ClubsView({ clubs }: { clubs: RoomClub[] | null }) {
  const t = useTranslations('admin.dashboard');
  const tRoles = useTranslations('klubb.roles');
  const locale = useLocale() as AppLocale;

  if (clubs === null) {
    return (
      <section className="pt-[18px]">
        <SectionError testId="klubbhus-clubs-error" />
      </section>
    );
  }

  if (clubs.length === 0) {
    return (
      <section className="pt-[18px]">
        <SmartLink
          href="/klubber"
          data-testid="player-no-club"
          className="inline-flex min-h-[44px] items-center rounded font-sans text-sm text-muted hover:text-text"
        >
          {t('playerNoClub')} →
        </SmartLink>
      </section>
    );
  }

  return (
    <section aria-labelledby="room-clubs-heading">
      <RoomGroupHeading id="room-clubs-heading">{t('playerClubsLabel')}</RoomGroupHeading>
      <RoomCard>
        {clubs.map((club, i) => (
          <RoomRow
            key={club.id}
            href={withKlubbhusOrigin(`/klubber/${club.id}`)}
            name={club.name}
            line={[
              tRoles(club.role),
              t('playerClubMembers', { n: club.members }),
              club.nextRoundAt
                ? t('playerClubNextRound', {
                    date: formatTeeOffDateLocale(new Date(club.nextRoundAt), locale),
                  })
                : t('playerClubNoRounds'),
            ].join(' · ')}
            last={i === clubs.length - 1}
            minHeight="min-h-16"
            testId="player-club-row"
            data={{
              'data-role': club.role,
              'data-members': club.members,
              'data-next-round': club.nextRoundAt ?? '',
            }}
          />
        ))}
      </RoomCard>
    </section>
  );
}

/** A cup row's data: where it leads, your part in it, and how far it has come. */
export type RoomCup = {
  id: string;
  name: string;
  href: string;
  /** In the roster or played a match; `false` = you only organise it. */
  playing: boolean;
  /** `null` = the cup's snapshot could not be read. */
  progress: { played: number; total: number } | null;
};

/**
 * Cuper — one row per cup you are part of that is not finished (#2493): «Du er
 * med» or «Du arrangerer», then «3 av 8 kamper spilt». A cup whose snapshot
 * failed says so on its own row; the others keep their numbers (#2490). With
 * only finished cups, one row in the same style leads to /admin/cup (owner's
 * answer 05.10). `null` means the cups themselves could not be read.
 */
export function CupsView({
  cups,
  finishedCount,
}: {
  cups: RoomCup[] | null;
  finishedCount: number;
}) {
  const t = useTranslations('admin.dashboard');

  if (cups === null) {
    return (
      <section className="pt-[18px]">
        <SectionError testId="klubbhus-cups-error" />
      </section>
    );
  }

  if (cups.length === 0 && finishedCount === 0) return null;

  return (
    <section aria-labelledby="room-cups-heading">
      <RoomGroupHeading id="room-cups-heading">{t('tilesCuper')}</RoomGroupHeading>
      <RoomCard>
        {cups.length === 0 ? (
          <RoomRow
            href="/admin/cup"
            name={t('playerCupFinishedName')}
            line={t('playerCupFinishedCount', { n: finishedCount })}
            last
            minHeight="min-h-16"
            testId="player-cup-row"
            data={{ 'data-finished': finishedCount }}
          />
        ) : (
          cups.map((cup, i) => (
            <RoomRow
              key={cup.id}
              href={cup.href}
              name={cup.name}
              line={[
                cup.playing ? t('playerCupPlaying') : t('playerCupOrganising'),
                cup.progress === null
                  ? t('playerCupError')
                  : cup.progress.total === 0
                    ? t('playerCupNoMatches')
                    : t('playerCupProgress', cup.progress),
              ].join(' · ')}
              last={i === cups.length - 1}
              minHeight="min-h-16"
              testId="player-cup-row"
              data={
                cup.progress === null
                  ? { 'data-role': cup.playing ? 'playing' : 'organising', 'data-error': 'true' }
                  : {
                      'data-role': cup.playing ? 'playing' : 'organising',
                      'data-played': cup.progress.played,
                      'data-total': cup.progress.total,
                    }
              }
            />
          ))
        )}
      </RoomCard>
    </section>
  );
}

/** Clubs and cups while they load: a label over a card of rows. */
export function RoomSectionSkeleton({ rows }: { rows: number }) {
  return (
    <div aria-hidden>
      <div className="pt-[18px] pb-2">
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="-mx-1 overflow-hidden rounded-2xl border border-border bg-surface">
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            className={`flex min-h-16 flex-col justify-center gap-1.5 px-3.5 py-2.5 ${i > 0 ? 'border-t border-row-divider-warm' : ''}`}
          >
            <Skeleton className="h-4 w-1/2" delay={i * 90} />
            <Skeleton className="h-3 w-2/3" delay={i * 90 + 40} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Verktøy — Baner, Spillformater and «Har du en idé?» as plain rows without
 * icons, as the room artboards draw them: 60 px rows in the room
 * (`rom-rullet`), 56 px for a new player (`ny-spiller`). Baner and Spillformater carry the
 * Klubbhuset origin so their back link returns here (#2487); /foreslaa-ide
 * already goes back to /admin.
 */
export function ToolsView({ rowHeight = 'min-h-[60px]' }: { rowHeight?: RowHeight } = {}) {
  const t = useTranslations('admin.dashboard');
  const rows = [
    { href: withKlubbhusOrigin('/opprett-bane'), name: t('playerBaner'), line: t('playerBanerMeta') },
    {
      href: withKlubbhusOrigin('/spillformater'),
      name: t('playerSpillformater'),
      line: t('playerSpillformaterMeta'),
    },
    { href: '/foreslaa-ide', name: t('playerForeslaaIde'), line: t('playerForeslaaIdeMeta') },
  ];
  return (
    <section aria-labelledby="room-tools-heading">
      <RoomGroupHeading id="room-tools-heading">{t('playerToolsLabel')}</RoomGroupHeading>
      <RoomCard>
        {rows.map((row, i) => (
          <RoomRow
            key={row.href}
            {...row}
            last={i === rows.length - 1}
            minHeight={rowHeight}
            testId="player-tool-row"
          />
        ))}
      </RoomCard>
    </section>
  );
}

/**
 * The new player's subtitle under «Hei, Kari.» (#2494, artboard
 * `Klubbhus-forslag-ny-spiller-*`). The room from #2493 has none.
 */
export function NewPlayerSubtitle() {
  const t = useTranslations('admin.dashboard');
  return (
    <p data-testid="new-player-subtitle" className="mt-1 text-sm leading-[1.45] text-muted">
      {t('newPlayerSubtitle')}
    </p>
  );
}

/**
 * Bli med — the new player's two ways in besides making a round (#2494):
 * Terminlista (/finn-turneringer) with the open rounds you can sign up for,
 * or «Ingen åpne runder akkurat nå» when there are none (O1), and «Klubben
 * din» as plain text: a club comes in through its invite link, so the row
 * leads nowhere.
 */
export function JoinView({ terminEmpty }: { terminEmpty: boolean }) {
  const t = useTranslations('admin.dashboard');
  return (
    <section aria-labelledby="room-join-heading">
      <RoomGroupHeading id="room-join-heading">{t('playerJoinLabel')}</RoomGroupHeading>
      <RoomCard>
        <RoomRow
          href="/finn-turneringer"
          name={t('playerTerminName')}
          line={terminEmpty ? t('playerTerminEmpty') : t('playerTerminLine')}
          last={false}
          minHeight="min-h-16"
          testId="player-termin-row"
          data={{ 'data-empty': String(terminEmpty) }}
        />
        <li>
          <div
            data-testid="player-club-invite"
            className="flex min-h-[72px] items-center gap-3 px-3.5 py-2.5 text-text"
          >
            <span className="min-w-0 grow">
              <span className="block text-[15px] font-semibold leading-[normal]">
                {t('playerClubInviteName')}
              </span>
              <span className="mt-0.5 block text-xs leading-[normal] text-muted">
                {t('playerClubInviteLine')}
              </span>
            </span>
          </div>
        </li>
      </RoomCard>
    </section>
  );
}
