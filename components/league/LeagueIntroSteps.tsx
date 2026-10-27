import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';

/**
 * «Slik funker ligaen i Tørny» (#2662): three numbered steps for someone new to
 * the league. On the link page in every state but an unknown link, and at the
 * top of `/liga/[id]` for a participant who has not delivered a round yet. It
 * goes away by itself after the first delivered round, so there is nothing to
 * close: «can be skipped» means it never stands in the way.
 *
 * Step 2 branches on the simulator league: a player there plays alone and picks
 * a marker in the league, in an ordinary league a playing partner approves.
 */
export function LeagueIntroSteps({ isSimulator }: { isSimulator: boolean }) {
  const t = useTranslations('liga.intro');
  return (
    <Card className="p-4 sm:p-5" data-testid="liga-intro">
      <h2 className="font-serif text-base text-text">{t('heading')}</h2>
      <ol className="mt-2 list-decimal space-y-1.5 pl-5 font-sans text-sm leading-relaxed text-text marker:font-semibold marker:text-primary">
        <li>{t('step1')}</li>
        <li>{isSimulator ? t('step2Simulator') : t('step2')}</li>
        <li>{t('step3')}</li>
      </ol>
    </Card>
  );
}
