import type { ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { LinkButton } from '@/components/ui/Button';
import { SmartLink } from '@/components/ui/SmartLink';
import { formatDateBlockOsloLocale, formatTeeOffTimeLocale } from '@/lib/i18n/format';
import { localizeGameName } from '@/lib/games/autoGameName';
import { formatDisplayLabelKey } from '@/lib/games/formatLabel';
import { registrationSeatTeamSize } from '@/lib/games/teamFormatLimits';
import { firstName, socialProofForm, type GameSocialProof } from '@/lib/games/socialProof';
import { capacityState, terminTimeNote, type TerminEntry } from '@/lib/games/terminliste';
import { nameInitials } from '@/lib/names/initials';
import type { AppLocale } from '@/i18n/routing';
import { ChevronRightIcon } from '@/components/icons';

const ROW = 'flex items-center gap-3 px-[14px] py-3';
/** The club page's row (#2326): 10 px top and bottom and CSS `normal` line height, as drawn. */
const DATE_ROW = 'flex items-center gap-3 px-[14px] py-2.5 leading-[normal]';

/**
 * One round in the terminliste (#2258): the time block, the name, «Bane ·
 * Format · lag på N», one third line and the button.
 *
 * `player`: the button follows `entry.cta` («Meld på» / «Be om plass») and
 * opens the poster. A full round has no button; the whole row links to the
 * poster. The third line is the capacity bar when the round has a cap, else the
 * friends who joined (first names, with initial bubbles), else the count.
 *
 * `anon`: the whole row links to the poster with an arrow. Only the capacity
 * line is shown — it is a number, never a name (#1193).
 *
 * `lead="date"` is the club page's row (#2326, artboard «Forslag: klubbens
 * side»): a date block («Ons» over «8.10») instead of the clock, and «17:30 ·
 * Format · lag på N» under the name, without the course. With `mine` set the
 * line under the name says «Du er med» / «Du arrangerer», there is no button,
 * and the whole row links to the round with an arrow.
 *
 * The row fetches nothing; seats and social proof come from the caller.
 */
export function TerminRow({
  entry,
  variant,
  socialProof,
  lead = 'time',
  mine = null,
}: {
  entry: TerminEntry;
  variant: 'player' | 'anon';
  socialProof?: GameSocialProof;
  lead?: 'time' | 'date';
  mine?: 'joined' | 'organizer' | null;
}) {
  const t = useTranslations('discover');
  const locale = useLocale() as AppLocale;
  const name = localizeGameName(entry.name, entry.course_name, locale);
  const href = `/signup/${entry.short_id}`;
  const row = lead === 'date' ? DATE_ROW : ROW;

  if (lead === 'date' && mine !== null) {
    return (
      <li>
        <SmartLink
          href={`/games/${entry.id}`}
          className={`${row} text-text transition-colors hover:bg-surface-2`}
          data-testid="club-round-mine"
        >
          <DateBlock entry={entry} locale={locale} />
          <span className="block min-w-0 grow">
            <span className="block text-[15px] font-semibold">{name}</span>
            <span className="block text-[12px] font-semibold text-round-mine">
              {mine === 'joined' ? t('termin.mineJoined') : t('termin.mineOrganizer')}
            </span>
          </span>
          {/* Inter has no «→»; the artboard's falls back to the system font. */}
          <span aria-hidden className="shrink-0 font-[system-ui] text-primary">
            →
          </span>
        </SmartLink>
      </li>
    );
  }

  const body = (
    <>
      {lead === 'date' ? (
        <DateBlock entry={entry} locale={locale} />
      ) : (
        <TimeBlock entry={entry} locale={locale} />
      )}
      <span className="block min-w-0 grow">
        <span className="block text-[15px] font-semibold text-text">{name}</span>
        {lead === 'date' ? (
          <TimeFormatLine entry={entry} locale={locale} />
        ) : (
          <CourseFormatLine entry={entry} />
        )}
        <ThirdLine
          entry={entry}
          socialProof={variant === 'player' ? socialProof : undefined}
        />
      </span>
    </>
  );

  if (variant === 'anon') {
    return (
      <li>
        <SmartLink
          href={href}
          className={`${ROW} transition-colors hover:bg-surface-2`}
          data-testid="anon-discovery-card"
        >
          {body}
          <ChevronRightIcon className="shrink-0 text-muted" />
        </SmartLink>
      </li>
    );
  }

  if (entry.full) {
    return (
      <li>
        <SmartLink href={href} className={`${row} transition-colors hover:bg-surface-2`}>
          {body}
        </SmartLink>
      </li>
    );
  }

  return (
    <li className={row}>
      {body}
      {entry.cta === 'direct' ? (
        <LinkButton
          href={href}
          size="compact"
          aria-label={t('termin.signUpLabel', { name })}
        >
          {t('termin.signUp')}
        </LinkButton>
      ) : (
        <LinkButton
          href={href}
          size="compact"
          variant="outline"
          aria-label={t('termin.requestLabel', { name })}
        >
          {t('termin.request')}
        </LinkButton>
      )}
    </li>
  );
}

/**
 * Clock and the small line under it. Content-box: 56 px of content plus the
 * 10 px gap and the 1 px divider, as the design draws it — with border-box
 * «09:20» would run over the divider.
 */
function TimeBlock({ entry, locale }: { entry: TerminEntry; locale: AppLocale }) {
  const t = useTranslations('discover');
  const teeOff = entry.scheduled_tee_off_at ? new Date(entry.scheduled_tee_off_at) : null;
  const valid = teeOff !== null && !Number.isNaN(teeOff.getTime());
  const note = terminTimeNote(entry);
  return (
    <span className="box-content block w-14 shrink-0 border-r border-row-divider-warm pr-2.5 text-center">
      {valid ? (
        <time
          dateTime={entry.scheduled_tee_off_at as string}
          className="block font-serif text-[20px] font-semibold text-text"
        >
          {formatTeeOffTimeLocale(teeOff, locale)}
        </time>
      ) : (
        <span aria-hidden className="block font-serif text-[20px] font-semibold text-muted">
          –
        </span>
      )}
      {note !== null && (
        <span className="block text-[11px] text-muted">
          {note === 'nine_holes'
            ? t('termin.nineHoles')
            : note === 'shotgun'
              ? t('termin.shotgun')
              : t('termin.firstTee')}
        </span>
      )}
    </span>
  );
}

/**
 * The club page's date block (#2326): weekday over «8.10», 44 px of content
 * plus the 8 px gap and the 1 px divider (content-box, as drawn). A round
 * without a date shows «–»; the line beside it says «Dato ikke satt».
 */
function DateBlock({ entry, locale }: { entry: TerminEntry; locale: AppLocale }) {
  const teeOff = validTeeOff(entry);
  const block = teeOff ? formatDateBlockOsloLocale(teeOff, locale) : null;
  return (
    <span className="box-content block w-11 shrink-0 border-r border-row-divider-warm pr-2 text-center">
      {block ? (
        <>
          <span className="block text-xs font-semibold text-muted">{block.weekday}</span>
          <span className="block font-serif text-[20px] font-semibold text-text">
            {block.dayMonth}
          </span>
        </>
      ) : (
        <span aria-hidden className="block font-serif text-[20px] font-semibold text-muted">
          –
        </span>
      )}
    </span>
  );
}

function validTeeOff(entry: TerminEntry): Date | null {
  if (!entry.scheduled_tee_off_at) return null;
  const teeOff = new Date(entry.scheduled_tee_off_at);
  return Number.isNaN(teeOff.getTime()) ? null : teeOff;
}

/** «Format · lag på N» — the course, or not, in front. */
function formatParts(
  entry: TerminEntry,
  t: ReturnType<typeof useTranslations<'discover'>>,
  tModes: ReturnType<typeof useTranslations<'modes'>>,
): string[] {
  const format = tModes(
    formatDisplayLabelKey(entry.game_mode, entry.mode_config) as Parameters<typeof tModes>[0],
  );
  const teamSize = registrationSeatTeamSize(
    entry.game_mode,
    (entry.mode_config as { team_size?: number } | null)?.team_size,
  );
  return teamSize > 1 ? [format, t('termin.teamOf', { size: teamSize })] : [format];
}

function CourseFormatLine({ entry }: { entry: TerminEntry }) {
  const t = useTranslations('discover');
  const tModes = useTranslations('modes');
  const parts = [entry.course_name ?? t('courseNotSet'), ...formatParts(entry, t, tModes)];
  return <span className="mt-0.5 block text-[12px] text-muted">{parts.join(' · ')}</span>;
}

/** The club page's line (#2326): «17:30 · Stableford · lag på 4», no course. */
function TimeFormatLine({ entry, locale }: { entry: TerminEntry; locale: AppLocale }) {
  const t = useTranslations('discover');
  const tModes = useTranslations('modes');
  const teeOff = validTeeOff(entry);
  const when = teeOff ? formatTeeOffTimeLocale(teeOff, locale) : t('termin.undated');
  const parts = [when, ...formatParts(entry, t, tModes)];
  return (
    <span className="block text-[12px] text-muted">{parts.join(' · ')}</span>
  );
}

/** Capacity bar, «Fullt», the friends who joined, the count — or nothing. */
function ThirdLine({
  entry,
  socialProof,
}: {
  entry: TerminEntry;
  socialProof?: GameSocialProof;
}) {
  const t = useTranslations('discover');
  const tProof = useTranslations('socialProof');

  if (entry.capacity) {
    const { free, fillRatio, tone } = capacityState(entry.capacity);
    const warn = tone !== 'normal';
    return (
      <Line3 className="flex items-center gap-1.5">
        {/* No shrink-0: the design's 64 px track gives way when the label wraps. */}
        <span
          aria-hidden
          className="block h-1.5 w-16 overflow-hidden rounded-full bg-meter-track"
        >
          <span
            className={`block h-1.5 ${warn ? 'bg-warning' : 'bg-primary'}`}
            style={{ width: `${Math.round(fillRatio * 100)}%` }}
          />
        </span>
        <span
          className={
            warn ? 'text-[11px] font-semibold text-warning-text' : 'text-[11px] text-muted'
          }
        >
          {tone === 'full'
            ? t('termin.full')
            : tone === 'low'
              ? t('termin.seatsLeft', { count: free })
              : t('termin.seatsFree', { free, cap: entry.capacity.cap })}
        </span>
      </Line3>
    );
  }

  if (entry.full) {
    return (
      <Line3 className="block text-[11px] font-semibold text-warning-text">
        {t('termin.full')}
      </Line3>
    );
  }

  const form = socialProof ? socialProofForm(socialProof, firstName) : null;
  if (form == null) return null;

  if (form.kind === 'count') {
    return (
      <Line3 className="block text-[11px] text-muted">
        {tProof('count', { count: form.count })}
      </Line3>
    );
  }

  const text =
    form.kind === 'friendsOverflow'
      ? tProof('friendsOverflow', { name: form.name, count: form.count })
      : form.kind === 'friendsTwo'
        ? tProof('friendsTwo', { name1: form.name1, name2: form.name2 })
        : tProof('friendsOne', { name: form.name });
  return (
    <Line3 className="flex items-center gap-1">
      {(socialProof?.knownFriendNames ?? []).map((friend, i) => (
        <span
          key={i}
          aria-hidden
          className={`flex size-[22px] shrink-0 items-center justify-center rounded-full bg-primary-soft text-[9px] font-semibold text-primary${
            i > 0 ? ' -ml-1.5 ring-2 ring-surface' : ''
          }`}
        >
          {nameInitials(friend)}
        </span>
      ))}
      <span className="ml-1 text-[11px] text-muted">{text}</span>
    </Line3>
  );
}

function Line3({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`mt-1.5 ${className}`}>{children}</span>;
}
