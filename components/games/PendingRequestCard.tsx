import { useTranslations } from 'next-intl';
import { SmartLink } from '@/components/ui/SmartLink';
import type { PendingRequest } from '@/lib/games/getDiscoverableGames';

/**
 * One of «Mine forespørsler» — a request waiting for the organiser. Moved out
 * of `HomeDiscoverySection` (#2258) and drawn as a terminliste row, so Hjem and
 * the terminliste share it. A team request links to the team page, a solo
 * request to the poster.
 */
export function PendingRequestCard({
  request,
}: {
  request: Pick<PendingRequest, 'short_id' | 'game_name' | 'team_name' | 'is_team_captain'>;
}) {
  const t = useTranslations('discover');
  const target = request.team_name
    ? `/signup/${request.short_id}/team`
    : `/signup/${request.short_id}`;

  const subtitle = request.team_name
    ? request.is_team_captain
      ? t('pendingApprovalCaptain', { teamName: request.team_name })
      : t('pendingApprovalMember', { teamName: request.team_name })
    : t('pendingApproval');

  return (
    <li>
      <SmartLink
        href={target}
        className="flex min-h-11 flex-col justify-center px-[14px] py-3 transition-colors hover:bg-surface-2"
      >
        <span className="block text-[15px] font-semibold text-text">{request.game_name}</span>
        <span className="mt-0.5 block text-[12px] text-muted">{subtitle}</span>
      </SmartLink>
    </li>
  );
}
