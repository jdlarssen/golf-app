import { useTranslations } from 'next-intl';
import { Banner } from '@/components/ui/Banner';
import { GetTheApp } from '@/components/app/GetTheApp';
import { LinkButton } from '@/components/ui/Button';

/**
 * What the signup page shows once you are in (#2840 del 5). After a team
 * signup the page renders again and the team form with its receipt is gone, so
 * the way to the team page lives here: «Gå til laget» for the captain and for a
 * teammate who has not said no (`hasTeamPage` in `lib/games/teamPageModel.ts`).
 */

/** On the list. `team` is null when you have no team page in the round. */
export function AlreadyRegisteredView({
  shortId,
  gameId,
  team,
}: {
  shortId: string;
  gameId: string;
  team: { name: string | null } | null;
}) {
  const t = useTranslations('signup');
  return (
    <div className="space-y-4">
      <Banner tone="success" testId="already-registered">
        {team?.name ? t('teamRegisteredBanner', { teamName: team.name }) : t('alreadyRegisteredBanner')}
      </Banner>
      {/* #2562: «Hent appen» under kvitteringen; ingenting før appen er ute. */}
      <GetTheApp />
      {team && (
        <LinkButton href={`/signup/${shortId}/team`} full>
          {t('goToTeamButton')}
        </LinkButton>
      )}
      <LinkButton href={`/games/${gameId}`} variant={team ? 'outline' : 'primary'} full>
        {t('goToGameButton')}
      </LinkButton>
    </div>
  );
}

/** #2061: you said yes to a team the organiser has not approved yet. */
export function TeamAwaitingApprovalView({ shortId }: { shortId: string }) {
  const t = useTranslations('signup');
  return (
    <div className="space-y-4">
      <Banner tone="info" testId="team-awaiting-approval">
        {t('pendingRequestBanner')}
      </Banner>
      <LinkButton href={`/signup/${shortId}/team`} full>
        {t('goToTeamButton')}
      </LinkButton>
      <GetTheApp />
    </div>
  );
}
