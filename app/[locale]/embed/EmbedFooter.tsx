import { getTranslations } from 'next-intl/server';

/**
 * Attribution strip at the bottom of every embed (#1024). This line IS the
 * marketing point of the feature — every club-site visitor sees a quiet way
 * into Tørny — so it is always rendered, never optional.
 *
 * `href` differs per surface: game embeds deep-link to the full spectate
 * page (more useful than the front page mid-round); the league embed links
 * to the tornygolf.no front page (acquisition).
 */
export async function EmbedFooter({
  href,
  live,
  statusLabel,
}: {
  href: string;
  live: boolean;
  statusLabel: string;
}) {
  const t = await getTranslations('embed');
  return (
    <footer className="mt-2 flex items-center justify-between gap-3 px-4 pb-3 pt-1 text-xs text-muted">
      <span className="inline-flex items-center gap-1.5">
        {live && (
          <span
            aria-hidden
            className="inline-block size-2 animate-pulse rounded-full bg-accent"
          />
        )}
        {statusLabel}
      </span>
      <a
        href={href}
        target="_blank"
        rel="noopener"
        className="font-medium text-primary underline-offset-2 hover:underline"
      >
        {t('followOnTorny')}
      </a>
    </footer>
  );
}
