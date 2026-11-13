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

/**
 * «Forespørsel sendt»: the organiser has not decided. `withTeam` for a captain
 * whose team waits (`self_request`) and for a teammate who said yes to it
 * (`team_awaiting_approval`, #2061).
 */
export function RequestSentView({
  shortId,
  withTeam,
  testId,
}: {
  shortId: string;
  withTeam: boolean;
  testId?: string;
}) {
  const t = useTranslations('signup');
  return (
    <div className="space-y-4">
      <Banner tone="info" testId={testId}>
        {t('pendingRequestBanner')}
      </Banner>
      {withTeam && (
        <LinkButton href={`/signup/${shortId}/team`} full>
          {t('goToTeamButton')}
        </LinkButton>
      )}
      <GetTheApp />
    </div>
  );
}
