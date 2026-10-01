import { useTranslations } from 'next-intl';
import { LinkButton } from '@/components/ui/Button';
import { SmartLink } from '@/components/ui/SmartLink';
import { ChampagneMedallion } from '@/components/ui/ChampagneMedallion';
import { Kicker } from '@/components/ui/Kicker';
import { PullQuote } from '@/components/ui/PullQuote';
import { PinFlag } from '@/components/icons/PinFlag';
import { PlusIcon } from '@/components/icons/Icons';
import { PendingRequestCard } from '@/components/games/PendingRequestCard';
import {
  TerminCard,
  TerminDayGroups,
  TerminHeading,
} from '@/components/games/TerminDayGroups';
import {
  buildTerminEntries,
  filterTermin,
  groupTerminByDate,
  type GameSeats,
  type TerminFilter,
} from '@/lib/games/terminliste';
import type {
  DiscoverableClubGame,
  DiscoverableFriendGame,
  DiscoverableOpenGame,
  PendingRequest,
} from '@/lib/games/getDiscoverableGames';
import type { GameSocialProof } from '@/lib/games/socialProof';

const CHIPS: { filter: TerminFilter; href: string; key: 'filterAll' | 'filterWeekend' | 'filterClub' }[] = [
  { filter: 'alle', href: '/finn-turneringer', key: 'filterAll' },
  { filter: 'helg', href: '/finn-turneringer?vis=helg', key: 'filterWeekend' },
  { filter: 'klubb', href: '/finn-turneringer?vis=klubb', key: 'filterClub' },
];

/**
 * «Terminlista» — the signed-in /finn-turneringer (#2258). One list sorted on
 * tee-off and split into Oslo days, under three filter chips, with the
 * player's own pending requests first and «Lag din egen runde» last.
 *
 * The chips are links (`?vis=helg` / `?vis=klubb`), so the filter is rendered
 * on the server and works without JavaScript and offline. «Klubben min» is
 * always there; without club rounds it shows the empty-filter text.
 *
 * The wrapper pulls the page 16 px up (AppShell gives 32) and sets line-height
 * to `normal`, as the design draws it; text keeps AppShell's 20 px gutter and
 * the chips and cards bleed to 16 px.
 */
export function Terminliste({
  data,
  socialProof,
  seats,
  filter,
  now,
}: {
  data: {
    clubGames: DiscoverableClubGame[];
    openGames: DiscoverableOpenGame[];
    friendGames: DiscoverableFriendGame[];
    pendingRequests: PendingRequest[];
  };
  socialProof: Record<string, GameSocialProof>;
  seats: ReadonlyMap<string, GameSeats>;
  filter: TerminFilter;
  now: Date;
}) {
  const t = useTranslations('discover');
  const entries = buildTerminEntries(data, seats);
  const groups = groupTerminByDate(filterTermin(entries, filter, now), now);
  const { pendingRequests } = data;
  const isEmpty = entries.length === 0 && pendingRequests.length === 0;
  const afterRequests = pendingRequests.length > 0 ? 'mt-5' : 'mt-[22px]';

  return (
    <div className="-mt-4 leading-[normal]">
      <Kicker tone="accent">{t('kicker')}</Kicker>
      <h1 className="mt-1 font-serif text-[30px] font-medium text-text">{t('pageTitle')}</h1>
      <p className="mt-0.5 text-[13px] text-muted">{t('termin.subtitle')}</p>

      {isEmpty ? (
        <section className="mt-8 flex flex-col items-center text-center">
          <ChampagneMedallion className="mb-7">
            <PinFlag size={72} className="text-primary dark:text-text" />
          </ChampagneMedallion>
          <p className="max-w-[280px] font-sans text-sm leading-relaxed text-muted">
            {t('emptyBody')}
          </p>
          <div className="mt-8 w-full max-w-[280px]">
            <LinkButton href="/opprett-spill" full>
              {t('emptyAction')}
            </LinkButton>
          </div>
          <PullQuote className="mt-8">{t('emptyPullQuote')}</PullQuote>
        </section>
      ) : (
        <>
          <nav aria-label={t('termin.filterLabel')} className="-mx-1 mt-4 flex gap-2">
            {CHIPS.map((chip) => {
              const active = chip.filter === filter;
              return (
                <SmartLink
                  key={chip.filter}
                  href={chip.href}
                  aria-current={active ? 'page' : undefined}
                  className={`inline-flex h-11 items-center rounded-full px-[14px] text-[13px] font-semibold ${
                    active
                      ? 'bg-primary text-white dark:text-bg'
                      : 'border border-border bg-surface text-text'
                  }`}
                >
                  {t(`termin.${chip.key}`)}
                </SmartLink>
              );
            })}
          </nav>

          {pendingRequests.length > 0 && (
            <section className="mt-[22px]">
              <TerminHeading title={t('myRequests')} />
              <TerminCard bleed>
                {pendingRequests.map((request) => (
                  <PendingRequestCard key={request.id} request={request} />
                ))}
              </TerminCard>
            </section>
          )}

          {groups.length > 0 ? (
            <TerminDayGroups
              groups={groups}
              variant="player"
              now={now}
              socialProof={socialProof}
              bleed
              firstClassName={afterRequests}
            />
          ) : (
            filter !== 'alle' && (
              <div className={afterRequests}>
                <p className="text-[13px] text-muted">
                  {filter === 'helg' ? t('termin.emptyWeekend') : t('termin.emptyClub')}
                </p>
                <SmartLink
                  href="/finn-turneringer"
                  className="inline-flex min-h-11 items-center text-[13px] font-semibold text-primary"
                >
                  {t('termin.showAll')}
                </SmartLink>
              </div>
            )
          )}

          <SmartLink
            href="/opprett-spill"
            className="-mx-1 mt-5 flex min-h-[58px] items-center justify-center gap-2 rounded-2xl border border-dashed border-dashed-cta text-[14px] font-semibold text-primary no-underline"
          >
            <PlusIcon size={18} strokeWidth={2} />
            {t('termin.createOwn')}
          </SmartLink>
        </>
      )}
    </div>
  );
}
