'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { setLeagueEmbed } from '@/lib/league/spectate';
import { buildEmbedSnippet } from '@/lib/embed/snippet';
import { routing } from '@/i18n/routing';
import { Card } from '@/components/ui/Card';

/**
 * Arrangør-kontroll for liga-embedden (#1024). Speiler LiveFollowControl
 * (#938): toggle på/av + «Kopier embed-kode»-knapp som legger en ferdig
 * iframe-snutt på utklippstavla, klar til å limes inn i en custom-HTML-blokk
 * på klubbens nettside.
 *
 * `spectateToken` er null når embedden er av; en uuid-streng når den er på.
 */
export function LigaEmbedControl({
  leagueId,
  spectateToken: initialToken,
  locale,
  leagueName,
}: {
  leagueId: string;
  spectateToken: string | null;
  locale: string;
  leagueName: string;
}) {
  const t = useTranslations('liga.embed');
  const [token, setToken] = useState<string | null>(initialToken);
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  const enabled = token !== null;

  // Default-locale er uprefikset (localePrefix: 'as-needed') — og header-
  // regelen som tillater framing matcher /embed/..., ikke /no/embed/...
  const prefix = locale === routing.defaultLocale ? '' : `/${locale}`;
  const embedUrl =
    typeof window !== 'undefined' && token
      ? `${window.location.origin}${prefix}/embed/liga/${token}`
      : null;

  function handleToggle() {
    startTransition(async () => {
      try {
        const next = await setLeagueEmbed(leagueId, !enabled);
        setToken(next);
      } catch (err) {
        console.error('[LigaEmbedControl] setLeagueEmbed failed', err);
      }
    });
  }

  async function handleCopySnippet() {
    if (!embedUrl) return;
    const snippet = buildEmbedSnippet(embedUrl, {
      height: 600,
      title: `Tørny – ${leagueName}`,
    });
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard write failed (e.g., missing permission) — silently ignore.
    }
  }

  return (
    <Card className="min-h-[44px]">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-base font-medium text-text">
            {enabled ? t('on') : t('off')}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            {t('hint')}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={t('label')}
          onClick={handleToggle}
          disabled={isPending}
          className={[
            'relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer',
            'rounded-full border-2 border-transparent transition-colors duration-200',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
            'disabled:opacity-60',
            enabled ? 'bg-primary' : 'bg-border',
          ].join(' ')}
        >
          <span
            aria-hidden
            className={[
              'inline-block size-[22px] rounded-full bg-white shadow',
              'transform transition-transform duration-200',
              enabled ? 'translate-x-5' : 'translate-x-0',
            ].join(' ')}
          />
        </button>
      </div>

      {enabled && embedUrl && (
        <button
          type="button"
          onClick={handleCopySnippet}
          className={[
            'mt-3 flex w-full min-h-[44px] items-center justify-center gap-2',
            'rounded-2xl border border-border bg-transparent px-4',
            'text-sm font-medium text-text transition-colors hover:bg-primary-soft',
          ].join(' ')}
        >
          {copied ? t('copied') : t('copySnippet')}
        </button>
      )}
    </Card>
  );
}
