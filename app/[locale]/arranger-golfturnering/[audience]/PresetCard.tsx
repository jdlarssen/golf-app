import { useTranslations } from 'next-intl';
import { LinkButton } from '@/components/ui/Button';
import { Kicker } from '@/components/ui/Kicker';
import { SmartLink } from '@/components/ui/SmartLink';
import type { ArrangeAudience } from '@/lib/seo/arrangeAudiences';
import { ARRANGE_PRESETS } from '@/lib/seo/arrangePresets';

/**
 * «Oppsettet vi anbefaler» (#2331): the forest card under each guide's title,
 * as the artboard «Guiden med ferdig oppsett» draws it. The format and team
 * size come from `ARRANGE_PRESETS`, the same entry the wizard seeds from
 * `?oppsett=`, so the card can't promise a setup the button doesn't open. The
 * reasons sit next to the guide's own copy in the catalog, and the card writes
 * no rules itself: the rules link goes to the format's page.
 *
 * Not async, so the page's Type C test can render it inside the page; no DB
 * and no IO, so the guide stays static.
 */
export function PresetCard({ audience }: { audience: ArrangeAudience }) {
  const t = useTranslations('arrangeGuide');
  const tModes = useTranslations('modes');
  const { gameMode, teamSize } = ARRANGE_PRESETS[audience];
  const format = tModes(gameMode);
  const reasons = t.raw(`audiences.${audience}.preset.reasons`) as string[];
  const kickerId = `arrange-preset-${audience}`;

  return (
    <section
      aria-labelledby={kickerId}
      data-focus-surface="strong"
      data-testid="arrange-preset"
      // -mt-4: the artboard puts the card 16 px under the subtitle. PageHeader
      // ends in mb-8, and the two margins collapse to 32 − 16 = 16.
      className="-mx-1 -mt-4 flex flex-col gap-3 rounded-[18px] bg-surface-strong p-4 text-on-strong dark:ring-1 dark:ring-border"
    >
      <Kicker tone="onStrong" id={kickerId} className="tracking-[0.22em]!">
        {t('preset.kicker')}
      </Kicker>
      <p className="font-serif text-[24px] font-medium leading-[1.15]">
        {teamSize > 1
          ? t('preset.lineTeam', { format, size: teamSize })
          : t('preset.line', { format })}
      </p>
      <ul className="flex flex-col gap-2 text-[14px] leading-[1.4]">
        {reasons.map((reason) => (
          <li key={reason} className="flex gap-2.5">
            <span aria-hidden className="font-semibold text-live-dot-on-strong">
              ✓
            </span>
            <span>{reason}</span>
          </li>
        ))}
      </ul>
      <LinkButton
        href={`/opprett-spill?oppsett=${audience}&step=2`}
        variant="onStrong"
        size="large"
        full
        className="text-[15px]!"
        data-testid="arrange-preset-cta"
      >
        {t('preset.cta')}
      </LinkButton>
      <p className="text-center text-[12px] text-on-strong/80">{t('preset.note')}</p>
      <SmartLink
        href={`/spillformater/${gameMode}`}
        className="inline-flex min-h-[44px] items-center self-center text-[13px] font-semibold text-on-strong underline underline-offset-2"
      >
        {t('preset.rulesLink', { format })}
      </SmartLink>
    </section>
  );
}
