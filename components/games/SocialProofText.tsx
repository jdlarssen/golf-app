import { useTranslations } from 'next-intl';
import type { SocialProofForm } from '@/lib/games/socialProof';

/**
 * The wording of the join funnel's social proof (#1193) for one form that
 * `socialProofForm` chose (#2258):
 *
 *   - mutual friends on the roster → «Jonas og 2 andre du kjenner er med»
 *   - otherwise                    → «3 har blitt med»
 *
 * Pure presentation: names have already passed the field whitelist in
 * `getGameSocialProof`. The invitation card (#2266) shows the friend forms
 * through this and writes its own count line.
 */
export function SocialProofText({ form }: { form: SocialProofForm }) {
  const t = useTranslations('socialProof');
  return form.kind === 'friendsOverflow'
    ? t('friendsOverflow', { name: form.name, count: form.count })
    : form.kind === 'friendsTwo'
      ? t('friendsTwo', { name1: form.name1, name2: form.name2 })
      : form.kind === 'friendsOne'
        ? t('friendsOne', { name: form.name })
        : t('count', { count: form.count });
}
