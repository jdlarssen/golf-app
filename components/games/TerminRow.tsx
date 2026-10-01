import type { ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { LinkButton } from '@/components/ui/Button';
import { SmartLink } from '@/components/ui/SmartLink';
import { formatTeeOffTimeLocale } from '@/lib/i18n/format';
import { localizeGameName } from '@/lib/games/autoGameName';
import { formatDisplayLabelKey } from '@/lib/games/formatLabel';
import { registrationSeatTeamSize } from '@/lib/games/teamFormatLimits';
import { firstName, socialProofForm, type GameSocialProof } from '@/lib/games/socialProof';
import { capacityState, terminTimeNote, type TerminEntry } from '@/lib/games/terminliste';
import { nameInitials } from '@/lib/names/initials';
import type { AppLocale } from '@/i18n/routing';

const ROW = 'flex items-center gap-3 px-[14px] py-3';

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
 * The row fetches nothing; seats and social proof come from the caller.
 */
export function TerminRow({
  entry,
  variant,
  socialProof,
}: {
  entry: TerminEntry;
  variant: 'player' | 'anon';
  socialProof?: GameSocialProof;
}) {
  const t = useTranslations('discover');
  const locale = useLocale() as AppLocale;
  const name = localizeGameName(entry.name, entry.course_name, locale);
  const href = `/signup/${entry.short_id}`;

  const body = (
    <>
      <TimeBlock entry={entry} locale={locale} />
      <span className="block min-w-0 grow">
        <span className="block text-[15px] font-semibold text-text">{name}</span>
        <CourseFormatLine entry={entry} />
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
          <span aria-hidden className="shrink-0 text-muted">
            →
          </span>
        </SmartLink>
      </li>
    );
  }

  if (entry.full) {
    return (
      <li>
        <SmartLink href={href} className={`${ROW} transition-colors hover:bg-surface-2`}>
          {body}
        </SmartLink>
      </li>
    );
  }

  return (
    <li className={ROW}>
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
      {note === 'nine_holes' && (
        <span className="block text-[11px] text-muted">{t('termin.nineHoles')}</span>
      )}
    </span>
  );
}

function CourseFormatLine({ entry }: { entry: TerminEntry }) {
  const t = useTranslations('discover');
  const tModes = useTranslations('modes');
  const format = tModes(
    formatDisplayLabelKey(entry.game_mode, entry.mode_config) as Parameters<typeof tModes>[0],
  );
  const teamSize = registrationSeatTeamSize(
    entry.game_mode,
    (entry.mode_config as { team_size?: number } | null)?.team_size,
  );
  const parts = [entry.course_name ?? t('courseNotSet'), format];
  if (teamSize > 1) parts.push(t('termin.teamOf', { size: teamSize }));
  return <span className="mt-0.5 block text-[12px] text-muted">{parts.join(' · ')}</span>;
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
        <span
          aria-hidden
          className="block h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-meter-track"
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
          key={friend}
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
