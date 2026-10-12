'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Kicker } from '@/components/ui/Kicker';
import { UnconfirmedBadge } from '@/components/ui/UnconfirmedBadge';
import type { RosterEntry } from './types';

const CIRCLE =
  'flex size-[30px] items-center justify-center rounded-full text-[10px] font-semibold leading-[normal] shadow-[0_0_0_2px_var(--surface)]';

/**
 * «Med · 8» (#2288): the first three on the roster in overlapping circles, the
 * rest as «+5», and their first names in one line. «Vis alle» unfolds the
 * whole roster with handicap and «Ikke bekreftet». The page sorts the entries
 * and writes the names line (`sortRoster`, `firstNamesLine`).
 */
export function SignupRoster({
  entries,
  namesLine,
}: {
  entries: RosterEntry[];
  namesLine: string;
}) {
  const t = useTranslations('admin.game.signups');
  const [open, setOpen] = useState(false);
  const count = entries.length;
  const shown = entries.slice(0, 3);
  const rest = count - shown.length;
  const headingId = 'signups-roster-heading';
  const listId = 'signups-roster-list';

  return (
    <section aria-labelledby={headingId}>
      <div className="flex items-baseline justify-between pt-[18px] pb-2">
        <Kicker as="h2" id={headingId} className="leading-[normal]">
          {t('withHeading', { count })}
        </Kicker>
        {count > 3 && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((o) => !o)}
            className="flex min-h-11 items-center text-[13px] font-semibold leading-[normal] text-primary underline"
          >
            {t('showAll')}
          </button>
        )}
      </div>

      <div className="-mx-1 rounded-2xl border border-border bg-surface px-3.5 py-3 leading-[normal]">
        {count === 0 ? (
          <p className="text-[13px] text-muted">{t('rosterEmpty')}</p>
        ) : (
          <div className="flex items-center gap-3">
            <span aria-hidden className="flex shrink-0">
              {shown.map((e, idx) => (
                <span
                  key={e.userId}
                  className={`${CIRCLE} bg-primary text-surface-2 ${idx > 0 ? '-ml-2' : ''}`}
                >
                  {e.initials}
                </span>
              ))}
              {rest > 0 && (
                <span className={`${CIRCLE} -ml-2 bg-meter-track text-muted`}>+{rest}</span>
              )}
            </span>
            <span className="text-[13px] text-muted">{namesLine}</span>
          </div>
        )}

        {count > 3 && (
          <ul id={listId} hidden={!open} className="mt-3 flex flex-col border-t border-border pt-1">
            {entries.map((e) => (
              <li key={e.userId} className="flex items-center justify-between gap-3 py-2">
                <span className="flex min-w-0 flex-wrap items-center gap-2 text-[14px] text-text">
                  {e.displayName}
                  {e.unconfirmed && <UnconfirmedBadge />}
                </span>
                {e.hcp !== null && (
                  <span className="shrink-0 text-[13px] text-muted">{t('hcp', { hcp: e.hcp })}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
