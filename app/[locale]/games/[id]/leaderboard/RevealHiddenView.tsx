import { useTranslations } from 'next-intl';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Kicker } from '@/components/ui/Kicker';

type Props = {
  /** Game's tournament name — surfaced as the TopBar kicker, same as every
   *  sibling leaderboard view. */
  gameName: string;
  /** Back-link href — typically points back to the originating hole. */
  backHref: string;
};

/**
 * Blind cup-day placeholder (#1441 D12) — the owner's "ingenting avsløres
 * før arrangøren avslutter" requirement for the split cup day's team/duel
 * formats (matchplay, fourball, foursomes, best ball). Shown instead of
 * match status / team standings whenever `score_visibility === 'reveal'`
 * and the game is still active.
 *
 * Deliberately shows nothing about the state of play — not even the brutto
 * totals `RevealBruttoView` shows for the solo/stroke formats. A player's
 * own scoring stays visible elsewhere (hole-entry, scorecard); this view
 * only gates the leaderboard / match-status surface.
 *
 * Finished (or non-reveal) games never reach this component — callers
 * gate on `shouldHideNetto(revealState(...))` before rendering it, same
 * gate `RevealBruttoView` already uses.
 */
export function RevealHiddenView({ gameName, backHref }: Props) {
  const tc = useTranslations('leaderboard.common');
  const t = useTranslations('leaderboard.revealHidden');
  return (
    <AppShell>
      <TopBar backHref={backHref} backLabel={tc('back')} kicker={gameName} />

      <section className="flex flex-col items-center text-center px-6 pt-12 pb-8">
        <Kicker tone="accent">{t('kicker')}</Kicker>
        <h1 className="mt-4 font-serif text-[22px] font-medium tracking-[-0.015em] leading-tight text-text">
          {t('heading')}
        </h1>
        <p className="mt-3 max-w-[280px] font-sans text-[13px] leading-[1.5] text-muted">
          {t('description')}
        </p>
      </section>
    </AppShell>
  );
}
