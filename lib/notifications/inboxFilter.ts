import type { InboxFilter } from './inboxSections';
import type { InboxWire } from './inboxWire';

/**
 * A filter chip on the app's board (#2759). The server builds the whole board
 * once, so a chip costs no new request. `inboxWire.test.ts` holds «Venner» and
 * «Krever handling» equal to `buildInboxSections` with the same filter.
 *
 * Type imports only: the app bundles this file.
 */
export function filterInboxWire(
  sections: InboxWire['sections'],
  filter: InboxFilter,
): InboxWire['sections'] {
  if (filter === 'action') return { action: sections.action, today: [], earlier: [] };
  if (filter === 'friends') {
    return {
      action: sections.action.filter((entry) => entry.friend),
      today: sections.today.filter((entry) => entry.friend),
      earlier: sections.earlier.filter((entry) => entry.friend),
    };
  }
  return sections;
}
