import { getServerClient } from '@/lib/supabase/server';
import { MiniRibbon } from '@/components/ui/MiniRibbon';
import { Banner } from '@/components/ui/Banner';
import { InviteToGameClient } from './InviteToGameClient';
import type { GameStatus } from '@/lib/games/status';

const BEST_BALL_MAX_PLAYERS = 8;

type CandidateRow = {
  id: string;
  name: string | null;
  nickname: string | null;
  email: string;
  hcp_index: number | string;
};

type Props = {
  gameId: string;
  status: GameStatus;
  gameMode: string;
  currentPlayerIds: string[];
};

/**
 * Server-component wrapper for «Inviter spillere»-card-en på
 * `/admin/games/[id]`. Henter eligible registered users (de som har
 * fullført profil og IKKE allerede er på rosteren), beregner mode-aware
 * full-banner, og delegerer interaktivitet til klient-komponenten.
 *
 * Rendres KUN for draft + scheduled — active/finished low-er rosteret,
 * så call-siten i page.tsx mounter denne kun for draft/scheduled.
 */
export async function InviteToGameSection({
  gameId,
  status,
  gameMode,
  currentPlayerIds,
}: Props) {
  if (status === 'active' || status === 'finished') return null;

  const supabase = await getServerClient();

  // Hent alle ferdig-profilerte registrerte brukere. Filtrer ut nåværende
  // roster i-app (enklere typer enn å bygge en ekskluderings-where i SQL).
  // Limit 200 — kompis-skala skal aldri treffe taket, klubb-skala
  // (#199 self-registrering) kan trenge bedre paginering senere.
  const { data: rawCandidates, error } = await supabase
    .from('users')
    .select('id, name, nickname, email, hcp_index')
    .not('profile_completed_at', 'is', null)
    .order('name', { ascending: true })
    .limit(200)
    .returns<CandidateRow[]>();
  const exclude = new Set(currentPlayerIds);
  const candidates = (rawCandidates ?? []).filter((c) => !exclude.has(c.id));

  if (error) {
    console.error('[InviteToGameSection] candidate fetch failed', error);
    return null;
  }

  const isBestBall = gameMode === 'best_ball_netto';
  const isFull = isBestBall && currentPlayerIds.length >= BEST_BALL_MAX_PLAYERS;

  return (
    <section className="mt-1.5">
      <MiniRibbon>Inviter spillere</MiniRibbon>
      <div
        className="overflow-hidden rounded-xl border border-border bg-surface"
        style={{ boxShadow: '0 1px 2px rgba(26, 46, 31, 0.03)' }}
      >
        <div className="space-y-4 px-3.5 pb-3.5 pt-3.5">
          {isFull && (
            <Banner tone="info">
              Spillet er fullt ({BEST_BALL_MAX_PLAYERS} av {BEST_BALL_MAX_PLAYERS}).
              Fjern noen for å invitere flere.
            </Banner>
          )}
          <InviteToGameClient
            gameId={gameId}
            candidates={candidates.map((c) => ({
              id: c.id,
              name: c.name,
              nickname: c.nickname,
              email: c.email,
              hcpIndex: Number(c.hcp_index),
            }))}
            disabled={isFull}
          />
        </div>
      </div>
    </section>
  );
}
