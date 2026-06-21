import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/Card';
import { SmartLink } from '@/components/ui/SmartLink';
import { getGameContext } from './gameContext';

/**
 * When a game belongs to a cup (`games.tournament_id` set), surface a link to
 * the public cup leaderboard so a participating player can reach the cup
 * standing straight from the match — not only via a direct URL (#347, part of
 * the «én vei til rom»-umbrella #344). Self-fetches like the other sections
 * here, so it streams behind Suspense and the shared `getGameWithPlayers`
 * cache helper stays untouched. Returns null for non-cup games and for cups
 * that no longer exist (so we never link to a deleted cup → 404).
 */
export async function CupStandingsLink({ gameId }: { gameId: string }) {
  const { supabase } = await getGameContext();
  const { data: row } = await supabase
    .from('games')
    .select('tournament_id')
    .eq('id', gameId)
    .maybeSingle<{ tournament_id: string | null }>();
  const tournamentId = row?.tournament_id ?? null;
  if (!tournamentId) return null;

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
        <span aria-hidden className="text-muted">
          →
        </span>
      </Card>
    </SmartLink>
  );
}
