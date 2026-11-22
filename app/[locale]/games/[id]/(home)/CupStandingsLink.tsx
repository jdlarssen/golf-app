import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/Card';
import { SmartLink } from '@/components/ui/SmartLink';
import { getGameContext } from './gameContext';
import { ChevronRightIcon } from '@/components/icons';

/**
 * When a game belongs to a cup (`games.tournament_id` set), surface a link to
 * the public cup page so a participating player can reach the cup straight from
 * the match — not only via a direct URL (#347, part of the «én vei til
 * rom»-umbrella #344). The cup page shows the matches, not the standing (#1468),
 * so the copy says «Se cupen», not «Se cup-stillingen». Self-fetches like the other sections
 * here, so it streams behind Suspense and the shared `getGameWithPlayers`
 * cache helper stays untouched. Returns null for non-cup games and for cups
 * that no longer exist (so we never link to a deleted cup → 404).
 *
 * Audit 2026-11-20: the page passes `tournament_id` from the game row it has
 * already read, instead of this section reading the game row once more.
 */
export async function CupStandingsLink({ tournamentId }: { tournamentId: string | null }) {
  if (!tournamentId) return null;
  const { supabase } = await getGameContext();

  const { data: cup } = await supabase
    .from('tournaments')
    .select('id')
    .eq('id', tournamentId)
    .maybeSingle<{ id: string }>();
  if (!cup) return null;

  const tHome = await getTranslations('game.home');
  return (
    <SmartLink href={`/cup/${tournamentId}`} className="block">
      <Card className="min-h-[44px] flex items-center justify-between transition-colors hover:border-primary/30">
        <span className="text-base font-medium text-text">
          {tHome('cupStandings')}
        </span>
        <ChevronRightIcon className="shrink-0 text-muted" />
      </Card>
    </SmartLink>
  );
}
