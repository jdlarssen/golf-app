'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { setLiveFollow } from '@/lib/games/spectate';
import { buildEmbedSnippet } from '@/lib/embed/snippet';
import { routing } from '@/i18n/routing';
import { Card } from '@/components/ui/Card';
import { Kicker } from '@/components/ui/Kicker';

/**
 * Arrangør-only kontroll for live-følg (#938).
 *
 * Viser toggle (på/av) og, når aktivert, en «Del live-lenke»-knapp som
 * bruker navigator.share med kopi-til-utklippstavle-fallback (samme mønster
 * som ShareResultButton). Montert kun for isCreator/isAdmin.
 *
 * `spectateToken` er null når live-følg er av; en uuid-streng når det er på.
 */
export function LiveFollowControl({
  gameId,
  spectateToken: initialToken,
  locale,
  gameName,
}: {
  gameId: string;
  spectateToken: string | null;
  locale: string;
  /** #1024: brukes i embed-snuttens iframe-title. */
  gameName: string;
}) {
  const t = useTranslations('spectate');
  const [token, setToken] = useState<string | null>(initialToken);
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);

  const enabled = token !== null;

  const spectateUrl =
    typeof window !== 'undefined' && token
      ? `${window.location.origin}/${locale}/spectate/${token}`
      : null;

  // #1024: default-locale er uprefikset (localePrefix: 'as-needed') — og
  // header-regelen som tillater framing matcher /embed/..., ikke /no/embed/...
  const embedPrefix = locale === routing.defaultLocale ? '' : `/${locale}`;
  const embedUrl =
    typeof window !== 'undefined' && token
      ? `${window.location.origin}${embedPrefix}/embed/spill/${token}`
      : null;

  function handleToggle() {
    startTransition(async () => {
      try {
        const next = await setLiveFollow(gameId, !enabled);
        setToken(next);
      } catch (err) {
        console.error('[LiveFollowControl] setLiveFollow failed', err);
      }
    });
  }

  async function handleShare() {
    if (!spectateUrl) return;
    const shareText = t('shareText');

    const canShare =
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function';

    if (canShare) {
      try {
        await navigator.share({ url: spectateUrl, text: shareText });
        return;
      } catch (err) {
        // User dismissed the share sheet — not an error.
        if (err instanceof Error && err.name === 'AbortError') return;
        // Fall through to clipboard fallback.
      }
    }

    // Clipboard fallback (desktop / browsers without Web Share).
    try {
      await navigator.clipboard.writeText(spectateUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard write failed (e.g., missing permission) — silently ignore.
    }
  }

  return (
    <div className="pt-2">
      <Kicker tone="muted" className="mb-2">
        {t('liveFollowLabel')}
      </Kicker>

      {/* Toggle */}
      <Card className="min-h-[44px]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-base font-medium text-text">
              {enabled ? t('liveFollowOn') : t('liveFollowOff')}
            </p>
            <p className="mt-0.5 text-xs text-muted leading-relaxed">
              {t('liveFollowHint')}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label={t('liveFollowLabel')}
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
      </Card>

      {/* Share button — only when enabled */}
      {enabled && spectateUrl && (
        <button
          type="button"
          onClick={handleShare}
          aria-label={t('shareLinkAriaLabel')}
          className={[
            'mt-2 flex w-full min-h-[44px] items-center justify-center gap-2',
            'rounded-2xl border border-border bg-transparent px-4',
            'text-sm font-medium text-text transition-colors hover:bg-primary-soft',
          ].join(' ')}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
            <path d="M12 3v13" />
            <path d="m7 8 5-5 5 5" />
          </svg>
          {copied ? t('copiedLabel') : t('shareLinkLabel')}
        </button>
      )}

      {/* #1024: kopier-lim-klar iframe-snutt for klubbside/infoskjerm */}
      {enabled && embedUrl && (
        <button
          type="button"
          onClick={async () => {
            const snippet = buildEmbedSnippet(embedUrl, {
              height: 700,
              title: `Tørny – ${gameName}`,
            });
            try {
              await navigator.clipboard.writeText(snippet);
              setEmbedCopied(true);
              setTimeout(() => setEmbedCopied(false), 2000);
            } catch {
              // Clipboard write failed — silently ignore (same as share above).
            }
          }}
          className={[
            'mt-2 flex w-full min-h-[44px] items-center justify-center gap-2',
            'rounded-2xl border border-border bg-transparent px-4',
            'text-sm font-medium text-text transition-colors hover:bg-primary-soft',
          ].join(' ')}
        >
          {embedCopied ? t('copiedLabel') : t('copyEmbedLabel')}
        </button>
      )}
    </div>
  );
}
