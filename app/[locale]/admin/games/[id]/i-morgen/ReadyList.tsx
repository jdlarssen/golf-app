import { SmartLink } from '@/components/ui/SmartLink';
import { RemindButton } from '../status/RemindButton';

/** One row of «Klar for i morgen?», every string already put together by the page. */
export type ReadyRow = {
  key: string;
  testId: string;
  /** `ok` draws the green ✓, `warn` the amber ! of a row that waits. */
  tone: 'ok' | 'warn';
  title: string;
  sub: string | null;
  /** «Purr Kari» on a row of someone who has not answered. */
  remind?: { action: () => void | Promise<void>; name: string } | null;
  /** «Purret» in place of the button, right after the reminder went. */
  purredLabel?: string | null;
};

export type ReadyLink = { key: string; href: string; label: string; testId: string };

const MARK_CLASS: Record<ReadyRow['tone'], string> = {
  ok: 'bg-primary-soft text-primary',
  warn: 'bg-warning-soft text-warning-text',
};

/**
 * The card and the two buttons under it on «Klar for i morgen?» (#2483,
 * artboard «Forslag 29: status til arrangøren kvelden før»): rows of 60 px
 * with a round mark, a title and a line under it, and «Purr …» at the end of
 * a row that waits. Pure layout: the page decides every row and every word.
 */
export function ReadyList({ rows, links }: { rows: readonly ReadyRow[]; links: readonly ReadyLink[] }) {
  return (
    <>
      <ul
        data-testid="ready-list"
        className="-mx-1 mt-3.5 divide-y divide-row-divider-warm overflow-hidden rounded-2xl border border-border bg-surface leading-[normal]"
      >
        {rows.map((row) => (
          <li
            key={row.key}
            data-testid={row.testId}
            data-tone={row.tone}
            className="flex min-h-[60px] items-center gap-3 px-3.5 py-2.5"
          >
            <span
              aria-hidden
              className={`flex size-[26px] shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${MARK_CLASS[row.tone]}`}
            >
              {row.tone === 'ok' ? '✓' : '!'}
            </span>
            <span className="min-w-0 grow">
              <span className="block text-[15px] font-semibold text-text">{row.title}</span>
              {row.sub && <span className="mt-0.5 block text-[12px] text-muted">{row.sub}</span>}
            </span>
            {row.purredLabel ? (
              <span
                role="status"
                data-testid="ready-purred"
                className="shrink-0 whitespace-nowrap text-[13px] font-semibold text-muted"
              >
                {row.purredLabel}
              </span>
            ) : (
              row.remind && (
                <RemindButton
                  remindAction={row.remind.action}
                  count={1}
                  labelKey="purreRowButton"
                  confirmKey="purreRowConfirm"
                  confirmValues={{ name: row.remind.name }}
                  testId="ready-purr-button"
                  variant="row"
                  tone="warning"
                />
              )
            )}
          </li>
        ))}
      </ul>
      {links.length > 0 && (
        <div className={`-mx-1 grid gap-2 pt-3.5 ${links.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {links.map((link) => (
            <SmartLink
              key={link.key}
              href={link.href}
              data-testid={link.testId}
              className="flex h-12 items-center justify-center rounded-full border border-border bg-surface px-3 text-center text-sm font-semibold text-text transition-colors hover:bg-primary-soft"
            >
              {link.label}
            </SmartLink>
          ))}
        </div>
      )}
    </>
  );
}
