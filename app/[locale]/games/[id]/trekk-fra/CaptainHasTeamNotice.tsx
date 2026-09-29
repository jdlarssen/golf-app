import { getTranslations } from 'next-intl/server';
import { Banner } from '@/components/ui/Banner';
import { LinkButton } from '@/components/ui/Button';

/**
 * Står i stedet for «Trekk meg»-knappen når kalleren er kaptein og noen på
 * laget har takket ja (#2358, eierens valg). Kapteinsbindet gis videre på
 * lagsida først; da kan hen trekke seg som et vanlig lagmedlem. Kjernen nekter
 * uansett (`captain_has_team`) — denne sier det før trykket.
 */
export async function CaptainHasTeamNotice({ shortId }: { shortId: string }) {
  const t = await getTranslations('game.withdraw');
  return (
    <div className="space-y-3" data-testid="captain-has-team">
      <Banner tone="info">{t('captainHasTeamBody')}</Banner>
      <LinkButton
        href={`/signup/${shortId}/team`}
        full
        data-testid="captain-has-team-link"
      >
        {t('captainHasTeamLink')}
      </LinkButton>
    </div>
  );
}
