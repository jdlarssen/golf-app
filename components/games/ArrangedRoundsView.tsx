import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { SmartLink } from '@/components/ui/SmartLink';
import { ModeChip } from '@/components/ui/ModeChip';
import type { AppLocale } from '@/i18n/routing';
import {
  arrangedListHref,
  arrangedRoundHref,
  type ArrangedGame,
  type ArrangedRounds,
  type UpcomingRound,
} from '@/lib/games/arrangedGames';
import { localizeGameName } from '@/lib/games/autoGameName';
import {
  formatDateBlockOsloLocale,
  formatTeeOffDateLocale,
  formatTeeOffTimeLocale,
  intlLocaleTag,
} from '@/lib/i18n/format';
import { blockReasonText, type NotificationTranslator } from '@/lib/notifications/cardContent';
import type { GameMode, GameModeConfig } from '@/lib/scoring/modes/types';

/** Admin rows carry the format, for `showMode`. */
type ViewGame = ArrangedGame & { game_mode?: GameMode; mode_config?: GameModeConfig };

/**
 * «Rundene dine» (#2269): the rounds you arrange, grouped by what happens
 * next. Presentation only; `groupArrangedRounds` (`lib/games/arrangedGames.ts`)
 * decides the groups and every number. The same view stands on `/klubbhuset`,
 * in the Klubbhus room and (for admin) on `/admin/games`, so they never show
 * different things.
 *
 * Drawn after the room artboard (`Klubbhus-forslag-rom-topp-*`): group labels
 * in muted caps, rows in white cards ending in «›», the date block on
 * surface-2. No heading of its own: the page or the room owns the title.
 * Expects a parent with 20 px side padding (AppShell / AdminShell); the cards
 * reach 16 px from the edge.
 *
 * Every row is one link with the whole story in its name, so VoiceOver reads
 * it once. The date block is `aria-hidden`: the date and time are in the name.
 */
export function ArrangedRoundsView({
  rounds,
  isAdmin,
  locale,
  upcomingLimit,
  showMode = false,
}: {
  rounds: ArrangedRounds<ViewGame>;
  isAdmin: boolean;
  locale: AppLocale;
  /** The room shows the first three (#2493). */
  upcomingLimit?: number;
  /** `ModeChip` under each live and upcoming row (`/admin/games`). */
  showMode?: boolean;
}) {
  const t = useTranslations('klubbhuset');
  const tInbox = useTranslations('inbox');
  const tHome = useTranslations('game.home');
  const upcoming = rounds.upcoming.slice(0, upcomingLimit);
  const nameOf = (g: ViewGame) => localizeGameName(g.name, g.courses?.name ?? null, locale);
  const modeChip = (g: ViewGame) =>
    showMode && g.game_mode ? (
      <span className="mt-1 inline-flex">
        <ModeChip mode={g.game_mode} modeConfig={g.mode_config} />
      </span>
    ) : null;

  return (
    <div data-testid="arranged-rounds">
      {rounds.live.length > 0 && (
        <section aria-labelledby="arranged-live-heading" data-testid="arranged-live">
          <GroupHeading id="arranged-live-heading">{t('groupLive')}</GroupHeading>
          <ul className="-mx-1 overflow-hidden rounded-2xl border border-border bg-surface">
            {rounds.live.map(({ game, counts }, i) => {
              const name = nameOf(game);
              const delivered = t('delivered', { submitted: counts.submitted, total: counts.total });
              const pending =
                counts.pendingApproval > 0
                  ? t('pendingApproval', { n: counts.pendingApproval })
                  : null;
              return (
                <li key={game.id} className={i > 0 ? 'border-t border-row-divider-warm' : undefined}>
                  <SmartLink
                    href={arrangedRoundHref('live', game.id, isAdmin)}
                    aria-label={[name, t('liveStatus'), delivered, pending].filter(Boolean).join(', ')}
                    data-testid="arranged-live-row"
                    data-submitted={counts.submitted}
                    data-total={counts.total}
                    data-pending={counts.pendingApproval}
                    className="flex min-h-16 items-center gap-3 px-3.5 py-2.5 text-text"
                  >
                    <span className="min-w-0 grow">
                      <span className="block text-[15px] font-semibold leading-[normal]">{name}</span>
                      <span className="mt-0.5 block text-xs leading-[normal] text-muted">
                        {[delivered, pending].filter(Boolean).join(' · ')}
                      </span>
                      {modeChip(game)}
                    </span>
                    <span
                      data-testid="arranged-live-pill"
                      className="flex h-11 shrink-0 items-center whitespace-nowrap rounded-full border border-border bg-surface px-3 text-[13px] font-semibold leading-[normal] text-primary"
                    >
                      {isAdmin ? t('deskPill') : tHome('managePlayersLink')}
                    </span>
                  </SmartLink>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {upcoming.length > 0 && (
        <section aria-labelledby="arranged-next-heading" data-testid="arranged-next">
          <GroupHeading id="arranged-next-heading">{t('groupNext')}</GroupHeading>
          <ul className="-mx-1 overflow-hidden rounded-2xl border border-border bg-surface">
            {upcoming.map((round, i) => (
              <li
                key={round.game.id}
                className={i > 0 ? 'border-t border-row-divider-warm' : undefined}
              >
                <UpcomingRow
                  round={round}
                  name={nameOf(round.game)}
                  isAdmin={isAdmin}
                  locale={locale}
                  modeChip={modeChip(round.game)}
                  t={t}
                  reasonText={(reason) =>
                    blockReasonText(reason, tInbox as unknown as NotificationTranslator)
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {rounds.drafts.count > 0 && (
        <SmartLink
          href={
            rounds.drafts.onlyId
              ? arrangedRoundHref('draft', rounds.drafts.onlyId, isAdmin)
              : arrangedListHref('drafts', isAdmin)
          }
          data-testid="arranged-drafts"
          data-count={rounds.drafts.count}
          className="-mx-1 mt-2.5 flex min-h-[51px] items-center justify-between gap-3 rounded-[14px] border-[1.5px] border-dashed border-border px-3.5 text-sm leading-[normal] text-text"
        >
          <span>
            {t('drafts', { n: rounds.drafts.count })} · {t('draftsHint')}
          </span>
          <span aria-hidden className="text-[18px] leading-[normal] text-muted">
            ›
          </span>
        </SmartLink>
      )}

      {rounds.finished.count > 0 && (
        <div className="pt-1">
          <SmartLink
            href={arrangedListHref('finished', isAdmin)}
            data-testid="arranged-finished"
            data-count={rounds.finished.count}
            className="inline-flex min-h-11 items-center text-sm font-semibold leading-[normal] text-primary"
          >
            {t('finishedLink', { n: rounds.finished.count })}
            <span aria-hidden>&nbsp;→</span>
          </SmartLink>
        </div>
      )}
    </div>
  );
}

function GroupHeading({ id, children }: { id: string; children: string }) {
  return (
    <h2
      id={id}
      className="pt-[18px] pb-2 text-[10px] font-semibold uppercase leading-[normal] tracking-[0.2em] text-muted"
    >
      {children}
    </h2>
  );
}

type KlubbhusetT = ReturnType<typeof useTranslations<'klubbhuset'>>;

function UpcomingRow({
  round,
  name,
  isAdmin,
  locale,
  modeChip,
  t,
  reasonText,
}: {
  round: UpcomingRound<ViewGame>;
  name: string;
  isAdmin: boolean;
  locale: AppLocale;
  modeChip: ReactNode;
  t: KlubbhusetT;
  reasonText: (reason: string) => string;
}) {
  const { game, note } = round;
  const teeOff = game.scheduled_tee_off_at ? new Date(game.scheduled_tee_off_at) : null;
  const block = teeOff ? formatDateBlockOsloLocale(teeOff, locale) : null;
  const time = teeOff ? formatTeeOffTimeLocale(teeOff, locale) : null;
  const when = teeOff
    ? t('teeOff', { date: formatTeeOffDateLocale(teeOff, locale), time: time ?? '' })
    : null;

  // The line under the name: why the round will not start by itself, or the
  // time, the signed-up count and the signup state.
  let lineParts: string[];
  let labelParts: (string | null)[];
  if (note?.kind === 'missingTeeOff') {
    lineParts = [t('missingTeeOff'), t('notStartingBySelf')];
    // Mid-sentence in the link's name: «…, mangler tee-tid, …».
    const missing = t('missingTeeOff');
    labelParts = [missing.charAt(0).toLocaleLowerCase(intlLocaleTag(locale)) + missing.slice(1), t('notStartingBySelf')];
  } else if (note?.kind === 'blocked') {
    const reason = reasonText(note.reason);
    const capitalised = reason.charAt(0).toLocaleUpperCase(intlLocaleTag(locale)) + reason.slice(1);
    lineParts = [capitalised, t('notStartingBySelf')];
    labelParts = [when, reason, t('notStartingBySelf')];
  } else {
    const signups =
      round.signups === 'open'
        ? t('signupsOpen')
        : round.signups === 'closed'
          ? t('signupsClosed')
          : null;
    const rest = [t('signedUp', { n: round.signedUp }), signups].filter(
      (s): s is string => s != null,
    );
    lineParts = [time, ...rest].filter((s): s is string => s != null);
    labelParts = [when, ...rest];
  }

  return (
    <SmartLink
      href={arrangedRoundHref('upcoming', game.id, isAdmin)}
      aria-label={[name, ...labelParts].filter(Boolean).join(', ')}
      data-testid="arranged-next-row"
      data-note={note ? (note.kind === 'blocked' ? note.reason : note.kind) : undefined}
      data-signed-up={round.signedUp}
      className="flex min-h-[68px] items-center gap-3 px-3.5 py-2.5 text-text"
    >
      <span
        aria-hidden
        className="flex h-[50px] w-[46px] shrink-0 flex-col items-center justify-center rounded-[10px] bg-surface-2"
      >
        {block ? (
          <>
            <span className="text-[10px] font-semibold leading-[normal] tracking-[0.12em] text-muted">
              {block.weekday}
            </span>
            <span className="font-serif text-[17px] font-semibold leading-[normal] tabular-nums">
              {block.dayMonth}
            </span>
          </>
        ) : (
          // No tee-off means no date at all (the date and the time are one column).
          <span className="font-serif text-[17px] font-semibold leading-[normal] text-muted">–</span>
        )}
      </span>
      <span className="min-w-0 grow">
        <span className="block text-[15px] font-semibold leading-[normal]">{name}</span>
        <span
          className={`mt-0.5 block text-xs leading-[normal] tabular-nums ${
            note ? 'font-semibold text-warning-text' : 'text-muted'
          }`}
        >
          {lineParts.join(' · ')}
        </span>
        {modeChip}
      </span>
      <span aria-hidden className="text-[18px] leading-[normal] text-muted">
        ›
      </span>
    </SmartLink>
  );
}
