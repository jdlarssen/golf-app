import { getLocale, getTranslations } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { getRoleContext } from '@/lib/admin/auth';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { SmartLink } from '@/components/ui/SmartLink';
import { SectionError } from '@/components/ui/SectionError';
import { StatusChip } from '@/components/ui/StatusChip';
import { ArrangedRoundsView } from '@/components/games/ArrangedRoundsView';
import { formatTeeOffDateLocale, formatTeeOffTimeLocale } from '@/lib/i18n/format';
import { first } from '@/lib/url/searchParams';
import type { AppLocale } from '@/i18n/routing';
import { localizeGameName } from '@/lib/games/autoGameName';
import {
  arrangedList,
  arrangedRoundHref,
  groupArrangedRounds,
  type ArrangedGame,
  type ArrangedListKind,
} from '@/lib/games/arrangedGames';
import { getArrangedRounds } from '@/lib/games/getArrangedRounds';

type SearchParams = Promise<{ vis?: string | string[] }>;

const LIST_BY_PARAM: Record<string, ArrangedListKind> = {
  utkast: 'drafts',
  ferdige: 'finished',
};

/**
 * Klubbhuset (#429) — «Rundene dine» (#2269): the games a player *arranges*
 * (created), as opposed to the games they play in (which live on the home
 * page), grouped by what happens next: in progress, next, drafts and finished.
 * Read through the request-scoped client (RLS «games select own created»),
 * cup matches and league flights left out (#2489).
 *
 * Reached from the Klubbhus room and active under the Klubbhuset bottom-nav
 * tab, which is the way back: the top is the artboard's kicker and title, with
 * no back arrow and no door for a new round (that door stands in the room).
 * `?vis=utkast` and `?vis=ferdige` list one group as cards, back to here.
 */
export default async function KlubbhusetPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const [t, locale, sp] = await Promise.all([
    getTranslations('klubbhuset'),
    getLocale() as Promise<AppLocale>,
    searchParams,
  ]);
  const supabase = await getServerClient();
  const { userId, isAdmin } = await getRoleContext(supabase);
  const list = LIST_BY_PARAM[first(sp.vis) ?? ''] ?? null;

  // A list shows no counts, so it reads no roster and no start blocks.
  const read = await getArrangedRounds(supabase, userId, { listOnly: list != null });
  // A failed read is not «nothing arranged yet» (#2490).
  if (!read.ok) console.error('[klubbhuset]', read.error);

  if (list) {
    return (
      <AppShell>
        <TopBar backHref="/klubbhuset" kicker={t('kicker')} />
        <PageHeader title={list === 'drafts' ? t('draftsTitle') : t('finishedTitle')} />
        {!read.ok ? (
          <SectionError />
        ) : (
          <ArrangedList
            games={arrangedList(read.games, list)}
            kind={list}
            isAdmin={isAdmin}
            locale={locale}
            emptyText={list === 'drafts' ? t('draftsEmpty') : t('finishedEmpty')}
            teeOffAt={(time) => t('teeOffAt', { time })}
          />
        )}
      </AppShell>
    );
  }

  return (
    <AppShell flush>
      <div className="px-5 pt-4">
        <p className="text-[10px] font-semibold uppercase leading-[normal] tracking-[0.2em] text-muted">
          {t('kicker')}
        </p>
        <h1 className="mt-0.5 font-serif text-[30px] font-medium leading-[normal] text-text">
          {t('pageTitle')}
        </h1>

        {!read.ok ? (
          <div className="mt-6">
            <SectionError />
          </div>
        ) : read.games.length === 0 ? (
          <p className="mt-8 text-center text-sm text-muted">{t('emptyState')}</p>
        ) : (
          <ArrangedRoundsView
            rounds={groupArrangedRounds(read.games, read.rosterByGame, {
              startBlocks: read.startBlocks,
            })}
            isAdmin={isAdmin}
            locale={locale}
          />
        )}
      </div>
    </AppShell>
  );
}

/** One group as the card list the page has always had. */
function ArrangedList({
  games,
  kind,
  isAdmin,
  locale,
  emptyText,
  teeOffAt,
}: {
  games: ArrangedGame[];
  kind: ArrangedListKind;
  isAdmin: boolean;
  locale: AppLocale;
  emptyText: string;
  teeOffAt: (time: string) => string;
}) {
  if (games.length === 0) {
    return <p className="text-center text-sm text-muted">{emptyText}</p>;
  }
  return (
    <nav className="space-y-2" data-testid={`arranged-list-${kind}`}>
      {games.map((g) => {
        const teeOff = g.scheduled_tee_off_at ? new Date(g.scheduled_tee_off_at) : null;
        // A draft continues where it stopped, in the wizard's «Klar?» step,
        // like the lone-draft row; a finished round opens its game page.
        const href = kind === 'drafts' ? arrangedRoundHref('draft', g.id, isAdmin) : `/games/${g.id}`;
        return (
          <SmartLink key={g.id} href={href} className="block">
            <Card className="min-h-[44px] p-5 transition-colors hover:border-primary/30">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <span className="block truncate font-serif text-lg font-medium tracking-tight text-text">
                    {localizeGameName(g.name, g.courses?.name ?? null, locale)}
                  </span>
                  {g.courses?.name && (
                    <span className="mt-1 block truncate text-xs text-muted">
                      {g.courses.name}
                    </span>
                  )}
                  {teeOff && (
                    <span className="mt-1 block truncate text-xs tabular-nums text-muted">
                      {formatTeeOffDateLocale(teeOff, locale)}{' '}
                      {teeOffAt(formatTeeOffTimeLocale(teeOff, locale))}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <StatusChip status={g.status} />
                  <span aria-hidden className="text-muted">
                    →
                  </span>
                </div>
              </div>
            </Card>
          </SmartLink>
        );
      })}
    </nav>
  );
}
