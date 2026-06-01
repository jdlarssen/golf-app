import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import type { GameStatus } from '@/lib/games/status';
import { endGame } from '../actions';

type Params = Promise<{ id: string }>;

/**
 * «Avslutt likevel»-bekreftelse (#375) for spill UTEN sideturnering.
 *
 * Når én eller flere spillere aldri leverte, blokkerer den vanlige
 * endGame-validering med `not_all_submitted`. Denne dedikerte siden er den
 * eksplisitte escapen: den lister hvem som mangler og lar arrangøren bekrefte.
 * De manglende markeres «ikke fullført» (submitted_at forblir null) — aldri en
 * falsk levering.
 *
 * Guards:
 *  - game må finnes (notFound ellers)
 *  - game må være `active` (redirect til detalj med not_active)
 *  - sideturneringsspill rutes til /avslutt (som håndterer manglende + vinnere)
 *  - hvis ingen mangler → redirect til detalj (bruk den vanlige avslutt-stien)
 *
 * Bekreftelses-knappen kaller `endGame(gameId, true)` (allowMissing) direkte.
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
      'id, name, status, side_tournament_enabled, side_ld_count, side_ctp_count',
    )
    .eq('id', gameId)
    .single<{
      id: string;
      name: string;
      status: GameStatus;
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
      'submitted_at, users!game_players_user_id_fkey(name, nickname, email)',
    )
    .eq('game_id', gameId)
    .returns<
      {
        submitted_at: string | null;
        users: {
          name: string | null;
          nickname: string | null;
          email: string | null;
        } | null;
      }[]
    >();

  const missing = (gamePlayers ?? [])
    .filter((gp) => !gp.submitted_at)
    .map((gp) => {
      const u = gp.users;
      const base = u?.name?.trim() || u?.email || '(ukjent spiller)';
      return u?.nickname ? `${base} «${u.nickname}»` : base;
    });

  // Ingen mangler → ingenting å «avslutte likevel». Bruk den vanlige stien.
  if (missing.length === 0) {
    redirect(detailPath);
  }

  const endAnywayAction = endGame.bind(null, gameId, true);

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
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
            {missing.map((name, i) => (
              <li key={i}>{name}</li>
            ))}
          </ul>
        </div>

        <p className="text-sm text-muted">
          Avslutter du nå, blir disse markert{' '}
          <span className="font-medium text-text">ikke fullført</span> — de
          telles ikke som levert, men blokkerer ikke lenger. Resten av
          resultatet låses og leaderboard åpnes for alle. Du kan gjenåpne spillet
          etterpå hvis noen rekker å levere.
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
