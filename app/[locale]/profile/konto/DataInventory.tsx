import { SettingList } from '@/components/ui/SettingRow';

/**
 * #2332: the rows under «Dette lagrer vi» on «Dine data», in screen order.
 *
 * The same six rows, in the same order and with the same words, as the app's
 * «Personvern og konto» (`DATA_ROWS`/`DATA_TEXT` in
 * `native/app/src/lib/profileCopy.ts`, whose parity test compares the whole of
 * `messages/no.json → profile.data`). The source for every sentence — the
 * policy, migration or file behind it — lives in the comment above `DATA_ROWS`
 * there, once; change who can read one of those tables and the text, that
 * comment and this list change together (`docs/schema-ground-truth.md`, RLS).
 */
export const DATA_ROWS = ['profile', 'email', 'rounds', 'social', 'ai', 'notifications'] as const;

export type DataRowId = (typeof DATA_ROWS)[number];

export type DataRow = { id: DataRowId; title: string; body: string };

/**
 * The card of rows: a title and one or two lines each, read as a description
 * list. It describes, it does nothing, so no row is a link. Same frame and
 * dividers as {@link SettingList}; the title and text match a `SettingRow`'s
 * label and sublabel, so the card sits with the rows below it. The page passes
 * the translated rows in; this reads nothing.
 */
export function DataInventory({ rows }: { rows: readonly DataRow[] }) {
  return (
    <SettingList>
      <dl>
        {rows.map((row) => (
          <div
            key={row.id}
            data-testid={`data-row-${row.id}`}
            className="border-t border-border px-5 py-4 first:border-t-0"
          >
            <dt className="font-serif text-base font-medium text-text">{row.title}</dt>
            <dd className="mt-0.5 text-xs text-muted">{row.body}</dd>
          </div>
        ))}
      </dl>
    </SettingList>
  );
}
