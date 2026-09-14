import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { Link } from '@/i18n/navigation';
import { getTranslations, getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Banner } from '@/components/ui/Banner';
import { RemindMissing } from '@/components/games/RemindMissing';
import {
  END_ANYWAY_FORM_ID,
  MissingPlayersWithdrawList,
} from '@/components/games/MissingPlayersWithdrawList';
import type { GameStatus } from '@/lib/games/status';
import type { GameMode } from '@/lib/scoring/modes/types';
import type { AppLocale } from '@/i18n/routing';
import { supportsWithdrawal } from '@/lib/scoring';
import { localizeGameName } from '@/lib/games/autoGameName';
import { endGameMarkingWithdrawals } from './actions';
// Purringen deles med søsterflaten «/avslutt» — én action, én gate
// (`requireAdmin`), og `surface` sier bare hvor brukeren skal tilbake (#1889).
import { remindMissingPlayers } from '../avslutt/actions';

type Params = Promise<{ id: string }>;
// `status=reminded` er kvitteringen purre-action-en redirecter tilbake med —
// samme search-param-mønster som admin-status-siden bruker.
// `error=roster_changed` er endGameMarkingWithdrawals som tapte et kappløp
// (#1986): noen leverte eller ble trukket mens siden sto åpen.
type SearchParams = Promise<{ status?: string; error?: string }>;

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
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id: gameId } = await params;
  const { status: notice, error } = await searchParams;
  const detailPath = `/admin/games/${gameId}`;

  const locale = await getLocale();
  const t = await getTranslations('admin.game.finishAnyway');
  const tDetail = await getTranslations('admin.game.detail');

  const supabase = await getServerClient();
  await requireAdmin(supabase);

  const { data: game } = await supabase
    .from('games')
    .select(
      'id, name, status, game_mode, side_tournament_enabled, side_ld_count, side_ctp_count, courses(name)',
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
      courses: { name: string } | null;
    }>();

  if (!game) notFound();

  if (game.status !== 'active') {
    redirect({ href: `${detailPath}?error=not_active`, locale });
  }
  // Sideturneringsspill må innom vinnervalg-wizarden, som selv håndterer
  // manglende leveringer. Send dem dit i stedet for å duplisere flyten.
  if (game.side_tournament_enabled && game.side_ld_count + game.side_ctp_count > 0) {
    redirect({ href: `${detailPath}/avslutt`, locale });
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
      const base = u?.name?.trim() || u?.email || tDetail('unknownPlayer');
      const displayName = u?.nickname ? `${base} «${u.nickname}»` : base;
      return { userId: gp.user_id, displayName };
    });

  // Ingen mangler → ingenting å «avslutte likevel». Bruk den vanlige stien.
  if (missing.length === 0) {
    redirect({ href: detailPath, locale });
  }

  // WD tilbys kun for in-scope-modi. For andre format (matchplay/pott) vises
  // ingen «trukket»-hake — de manglende telles som «ikke levert» (som #375).
  const allowWd = supportsWithdrawal(game.game_mode);

  const endAnywayAction = endGameMarkingWithdrawals.bind(null, gameId);

  return (
    <AdminShell>
      <TopBar
        backHref={detailPath}
        kicker={t('topBarKicker')}
      />
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle', { name: localizeGameName(game.name, game.courses?.name ?? null, locale as AppLocale) })}
      />

      <div className="space-y-4 px-1">
        {error === 'roster_changed' && (
          <Banner tone="error" testId="roster-changed-banner">
            {t('rosterChanged')}
          </Banner>
        )}
        {/* Per-spiller valg (kun in-scope-modi): default = tell scorene
            (ingen hake), opt-in = marker som trukket. Hakene står utenfor
            skjemaet under og bindes til det med id (#1932). */}
        <MissingPlayersWithdrawList
          players={missing}
          allowWd={allowWd}
          formId={END_ANYWAY_FORM_ID}
          heading={t('missingHeader', { count: missing.length })}
          withdrawLabel={t('markWithdrawn')}
        />

        {/* Purreknappen (#1889): den ikke-destruktive veien videre, rett under
            lista over hvem som mangler — før «avslutt likevel»-forklaringen. */}
        <RemindMissing
          gameId={gameId}
          remindAction={remindMissingPlayers.bind(
            null,
            gameId,
            'avslutt-likevel',
          )}
          justReminded={notice === 'reminded'}
        />

        <p className="text-sm text-muted">
          {allowWd
            ? t.rich('bodyWithWd', {
                notDelivered: (chunks) => <strong>{chunks}</strong>,
                withdrawn: (chunks) => <strong>{chunks}</strong>,
              })
            : t.rich('bodyNoWd', {
                notDelivered: (chunks) => <strong>{chunks}</strong>,
              })}
        </p>

        <form id={END_ANYWAY_FORM_ID} action={endAnywayAction}>
          <SubmitButton className="w-full" pendingLabel={t('submittingBusy')}>
            {t('submitButton')}
          </SubmitButton>
        </form>

        <Link
          href={detailPath}
          className="block min-h-[44px] rounded-full border border-border px-4 py-3 text-center font-medium tracking-tight text-text transition-colors hover:bg-surface-2"
        >
          {t('cancel')}
        </Link>
      </div>
    </AdminShell>
  );
}
