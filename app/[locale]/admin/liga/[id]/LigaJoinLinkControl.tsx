'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { setLeagueJoinLink, type LeagueJoinLinkMode } from '@/lib/league/joinLink';
import { leagueJoinUrl } from '@/lib/league/joinCode';
import { Card } from '@/components/ui/Card';
import { ShareLinkField } from '@/components/ui/ShareLinkField';

/**
 * The organiser's control for the league's shareable link (#2662). Mirrors
 * `LigaEmbedControl` (#1024): a switch on/off, the link with a copy button
 * while it is on, and «Lag ny lenke» for a link that has spread too far (the
 * old one dies). Only rendered for a league without a club that is not
 * finished; `setLeagueJoinLink` refuses a club league on its own.
 *
 * `joinCode` is null when the link is off.
 */
export function LigaJoinLinkControl({
  leagueId,
  joinCode: initialCode,
}: {
  leagueId: string;
  joinCode: string | null;
}) {
  const t = useTranslations('liga.shareLink');
  const [code, setCode] = useState<string | null>(initialCode);
  const [failed, setFailed] = useState(false);
  const [isPending, startTransition] = useTransition();

  const enabled = code !== null;

  function run(mode: LeagueJoinLinkMode) {
    startTransition(async () => {
      const result = await setLeagueJoinLink(leagueId, mode);
      if ('error' in result) {
        setFailed(true);
        return;
      }
      setFailed(false);
      setCode(result.joinCode);
    });
  }

  return (
    <Card className="min-h-[44px]" data-testid="liga-join-link-control">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-base font-medium text-text">{enabled ? t('on') : t('off')}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">{t('hint')}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={t('label')}
          onClick={() => run(enabled ? 'off' : 'on')}
          disabled={isPending}
          data-testid="liga-join-link-switch"
          className={[
            'relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer',
            'rounded-full border-2 border-transparent transition-colors duration-200',
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

      {failed && (
        <p role="status" className="mt-3 text-xs text-danger">
          {t('saveError')}
        </p>
      )}

      {code && (
        <div className="mt-4 space-y-3">
          <ShareLinkField
            url={leagueJoinUrl(code)}
            ariaLabel={t('ariaLabel')}
            copyLabel={t('copyButton')}
            copiedLabel={t('copiedButton')}
            errorText={t('copyError')}
            testId="liga-join-link"
          />
          <div>
            <button
              type="button"
              onClick={() => run('rotate')}
              disabled={isPending}
              data-testid="liga-join-link-rotate"
              className={[
                'flex w-full min-h-[44px] items-center justify-center',
                'rounded-2xl border border-border bg-transparent px-4',
                'text-sm font-medium text-text transition-colors hover:bg-primary-soft',
                'disabled:opacity-60',
              ].join(' ')}
            >
              {t('rotateButton')}
            </button>
            <p className="mt-1 text-center text-xs text-muted">{t('rotateHint')}</p>
          </div>
        </div>
      )}
    </Card>
  );
}
