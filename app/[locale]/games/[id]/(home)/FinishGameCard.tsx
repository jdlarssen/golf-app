import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { SmartLink } from '@/components/ui/SmartLink';

/**
 * #427: «Avslutt spillet» for the game's creator on an active game. Understated,
 * with its own hint so it is clear why exactly you see it. #2202: shared by the
 * player's view and the organiser view (an organiser who does not play).
 */
export function FinishGameCard({ gameId }: { gameId: string }) {
  const t = useTranslations('game.home');
  return (
    <SmartLink href={`/games/${gameId}/avslutt`} className="block">
      <Card className="min-h-[44px] transition-colors hover:border-primary/30">
        <div className="flex items-center justify-between">
          <span className="text-base font-medium text-text">
            {t('finishGame')}
          </span>
          <span aria-hidden className="text-muted">
            →
          </span>
        </div>
        <p className="mt-1 text-xs text-muted">
          {t('finishGameHint')}
        </p>
      </Card>
    </SmartLink>
  );
}
