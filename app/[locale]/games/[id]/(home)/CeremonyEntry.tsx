import { SmartLink } from '@/components/ui/SmartLink';
import { Card } from '@/components/ui/Card';
import { ChevronRightIcon } from '@/components/icons';

/**
 * «Premieutdelingen →» on a finished game's page (#2298), for the organiser.
 * The callers decide when it shows (finished, organiser, podium format).
 */
export function CeremonyEntry({ gameId, label }: { gameId: string; label: string }) {
  return (
    <SmartLink href={`/games/${gameId}/premieutdeling`} className="block" data-testid="ceremony-entry">
      <Card className="min-h-[44px] flex items-center justify-between transition-colors hover:border-primary/30">
        <span className="text-base font-medium text-text">{label}</span>
        <ChevronRightIcon className="shrink-0 text-muted" />
      </Card>
    </SmartLink>
  );
}
