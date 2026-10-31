import type { useTranslations } from 'next-intl';

type BasicsT = ReturnType<typeof useTranslations<'wizard.sections.basics'>>;

/** Who a tee is rated for: «herre · dame · junior». */
export function formatRatingBadge(
  tee: {
    has_mens: boolean;
    has_ladies: boolean;
    has_juniors: boolean;
  },
  t: BasicsT,
): string {
  const parts: string[] = [];
  if (tee.has_mens) parts.push(t('teeRatingMens'));
  if (tee.has_ladies) parts.push(t('teeRatingLadies'));
  if (tee.has_juniors) parts.push(t('teeRatingJuniors'));
  return parts.join(' · ');
}
