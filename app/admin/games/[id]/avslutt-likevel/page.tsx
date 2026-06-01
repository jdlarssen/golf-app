import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import type { GameStatus } from '@/lib/games/status';
import type { GameMode } from '@/lib/scoring/modes/types';
import { supportsWithdrawal } from '@/lib/scoring';
import { endGameMarkingWithdrawals } from './actions';

type Params = Promise<{ id: string }>;

/**
 * «Avslutt likevel»-bekreftelse (#375) for spill UTEN sideturnering.
 *
 * Når én eller flere spillere aldri leverte, blokkerer den vanlige
 * endGame-validering med `not_all_submitted`. Denne dedikerte siden er den
 * eksplisitte escapen: den lister hvem som mangler og lar arrangøren bekrefte.
 *
 * #386-utvidelse: allerede trukne spillere vises ikke i listen (de blokkerer
 * ikke endGame). For gjenværende manglende spillere vises en avkrysningsboks
 * «Marker som trukket» (default av = «tell scorene»).
 *
 * Guards:
 *  - game må finnes (notFound ellers)
 *  - game må være `active` (redirect til detalj med not_active)
 *  - sideturneringsspill rutes til /avslutt (som håndterer manglende + vinnere)
 *  - hvis ingen mangler → redirect til detalj (bruk den vanlige avslutt-stien)
 *
 * Skjemaet kaller `endGameMarkingWithdrawals(gameId, formData)`.
 */
export default async function AvsluttLikevelPage({
  params,
}: {
  params: Params;
}) {
  const { id: gameId } = await params;
  const detailPath = `/admin/games/${gameId}`;

  const supabase = await getServerClient();
  const user = await requireAdmin(supabase);

  const { data: game } = await supabase
    .from('games')
    .select(
      'id, name, status, game_mode, side_tournament_enabled, side_ld_count, side_ctp_count',
    )
    .eq('id', gameId)
    .single<{
      id: string;
      name: string;
      status: GameStatus;
      game_mode: GameMode;
      side_tournament_enabled: boolean;
      side_ld_count: number;
      side_ctp_count: number;
    }>();

  if (!game) notFound();

  if (game.status !== 'active') {
    redirect(`${detailPath}?error=not_active`);
  }
  // Sideturneringsspill må innom vinnervalg-wizarden, som selv håndterer
  // manglende leveringer. Send dem dit i stedet for å duplisere flyten.
  if (game.side_tournament_enabled && game.side_ld_count + game.side_ctp_count > 0) {
    redirect(`${detailPath}/avslutt`);
  }

  const { data: gamePlayers } = await supabase
    .from('game_players')
    .select(
      'user_id, submitted_at, withdrawn_at, users!game_players_user_id_fkey(name, nickname, email)',
    )
    .eq('game_id', gameId)
    .returns<
      {
        user_id: string;
        submitted_at: string | null;
        withdrawn_at: string | null;
        users: {
          name: string | null;
          nickname: string | null;
          email: string | null;
        } | null;
      }[]
    >();

  // Allerede trukne er allerede ute av rangeringen — filtrer dem vekk.
  // endGame hopper over dem automatisk (#386).
  const missing = (gamePlayers ?? [])
    .filter((gp) => !gp.submitted_at && !gp.withdrawn_at)
    .map((gp) => {
      const u = gp.users;
      const base = u?.name?.trim() || u?.email || '(ukjent spiller)';
      const displayName = u?.nickname ? `${base} «${u.nickname}»` : base;
      return { userId: gp.user_id, displayName };
    });

  // Ingen mangler → ingenting å «avslutte likevel». Bruk den vanlige stien.
  if (missing.length === 0) {
    redirect(detailPath);
  }

  // WD tilbys kun for in-scope-modi. For andre format (matchplay/pott) vises
  // ingen «trukket»-hake — de manglende telles som «ikke levert» (som #375).
  const allowWd = supportsWithdrawal(game.game_mode);

  const endAnywayAction = endGameMarkingWithdrawals.bind(null, gameId);

  return (
    <AdminShell>
      <TopBar
        backHref={detailPath}
        kicker="Avslutt spillet"
        userId={user.userId}
      />
      <PageHeader
        title="Avslutt likevel?"
        subtitle={`Noen har ikke levert scorekort i «${game.name}».`}
      />

      <div className="space-y-4 px-1">
        <div className="rounded-xl border border-warning/30 bg-warning/10 px-3.5 py-3 text-sm text-warning">
          <p className="font-medium">
            {missing.length === 1
              ? '1 spiller har ikke levert:'
              : `${missing.length} spillere har ikke levert:`}
          </p>
          {/* Per-spiller valg (kun in-scope-modi): default = tell scorene
              (ingen hake), opt-in = marker som trukket. */}
          <ul className="mt-2 space-y-2">
            {missing.map(({ userId, displayName }) =>
              allowWd ? (
                <li key={userId} className="flex items-center gap-3">
                  <label className="flex min-h-[44px] flex-1 cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      name={`withdraw_${userId}`}
                      value="on"
                      className="h-4 w-4 rounded accent-primary"
                    />
                    <span className="text-sm text-text">{displayName}</span>
                    <span className="ml-auto text-xs text-muted">Marker som trukket</span>
                  </label>
                </li>
              ) : (
                <li key={userId} className="text-sm text-text">
                  {displayName}
                </li>
              ),
            )}
          </ul>
        </div>

        <p className="text-sm text-muted">
          {allowWd ? (
            <>
              Avslutter du nå, blir spillere uten hake stående som{' '}
              <span className="font-medium text-text">ikke levert</span>. Scorene
              de rakk å registrere teller fortsatt i resultatet. Spillere med hake
              markeres som <span className="font-medium text-text">Trukket</span> og
              teller ikke i rangeringen. Du kan angre trekk etterpå ved å åpne
              spillet igjen. Resten låses og leaderboard åpnes for alle.
            </>
          ) : (
            <>
              Avslutter du nå, blir disse stående som{' '}
              <span className="font-medium text-text">ikke levert</span>. Scorene
              de rakk å registrere teller fortsatt i resultatet. Resten låses og
              leaderboard åpnes for alle.
            </>
          )}
        </p>

        <form action={endAnywayAction}>
          <Button type="submit" className="w-full">
            Avslutt likevel
          </Button>
        </form>

        <Link
          href={detailPath}
          className="block min-h-[44px] rounded-full border border-border px-4 py-3 text-center font-medium tracking-tight text-text transition-colors hover:bg-surface-2"
        >
          Avbryt
        </Link>
      </div>
    </AdminShell>
  );
}
