import { notFound } from 'next/navigation';
import { getTranslations, getLocale } from 'next-intl/server';
import { AdminShell } from '@/components/ui/AdminShell';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { Banner } from '@/components/ui/Banner';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { SmartLink } from '@/components/ui/SmartLink';
import { formatTeeOffDateLocale } from '@/lib/i18n/format';
import type { AppLocale } from '@/i18n/routing';
import { cupBasePath } from '@/lib/cup/cupPaths';
import {
  loadCupWithdrawalContext,
  type CupWithdrawalMatchView,
} from '@/lib/cup/cupWithdrawalContext';
import {
  submitCupWithdrawal,
  submitUndoCupWithdrawal,
} from '@/lib/cup/withdrawalFormActions';

/**
 * Bekreftelsesside for «trekk fra cupen» (#1814) — arrangør-varianten.
 *
 * Husregelen for destruktive flyter: egen rute, aldri en inline-toggle. Siden
 * viser konsekvensen for HVER ikke-startet kamp, regnet NÅ med den samme
 * regelmodulen skrivingen bruker — arrangøren skal se «halveres» eller
 * «walkover til {lag}» før hen trykker, ikke etterpå.
 *
 * Er spilleren allerede trukket, snur siden til angre-varianten (E7: kun
 * arrangøren kan angre, og bare for kamper som ennå ikke har startet).
 *
 * Gaten (`requireAdminOrClubAdminOfCup`) gjøres i ruta — begge variantene
 * (`/admin/cup/[id]/trekk/[userId]` og klubb-varianten) rendrer denne.
 */
export type CupWithdrawVariant = 'admin' | 'club';

/** Én linje i konsekvenslista. */
function matchLine(
  match: CupWithdrawalMatchView,
  t: Awaited<ReturnType<typeof getTranslations<'cup'>>>,
  locale: AppLocale,
  teamNames: { team1: string; team2: string },
): string {
  const label = match.matchLabel ?? t('matchFallback');
  const when = match.scheduledTeeOffAt
    ? formatTeeOffDateLocale(new Date(match.scheduledTeeOffAt), locale)
    : t('withdraw.teeOffMissing');
  const consequence = match.outcome
    ? match.outcome.outcome === 'halved'
      ? t('withdraw.outcomeHalved')
      : t('withdraw.outcomeWalkover', {
          team: match.outcome.winnerSide === 1 ? teamNames.team1 : teamNames.team2,
        })
    : t('withdraw.outcomePlayOn', { partner: match.partnerName ?? '' });
  return `${label} · ${when} → ${consequence}`;
}

export async function CupWithdrawConfirm({
  tournamentId,
  userId,
  variant,
  errorCode,
}: {
  tournamentId: string;
  userId: string;
  variant: CupWithdrawVariant;
  errorCode?: string;
}) {
  const [t, locale] = await Promise.all([
    getTranslations('cup'),
    getLocale() as Promise<AppLocale>,
  ]);

  const ctx = await loadCupWithdrawalContext({
    tournamentId,
    userId,
    unknownLabel: t('manage.unknownPlayer'),
  });
  if (!ctx) notFound();
  // En bruker som ikke står i én eneste av cupens kamper hører ikke hjemme her.
  if (ctx.pending.length === 0 && ctx.untouched.length === 0) notFound();

  const isClub = variant === 'club';
  const Shell = isClub ? AppShell : AdminShell;
  const cancelHref = cupBasePath(tournamentId, isClub ? ctx.tournament.group_id : null);
  // Bæres i skjemaet så `?error=` lander på DENNE ruta, ikke admin-varianten:
  // en klubb-styrer skal ikke kastes ut av klubb-chrome av en feilmelding.
  const groupIdField = isClub ? (ctx.tournament.group_id ?? '') : '';
  const teamNames = {
    team1: ctx.tournament.team_1_name,
    team2: ctx.tournament.team_2_name,
  };

  // Cup-status-gaten (kontrakten: «cup draft/finished → alle trekk-innganger
  // skjult og actions avviser»). Alle fire handlingene svarer `wrong_status`
  // uansett, men et utkast med genererte kamper rendret hele skjemaet — og en
  // knapp serveren garantert avviser er verre enn ingen knapp. Samme info-linje
  // som spillerens egen side (`/cup/[id]/trekk`), ikke `notFound()`: arrangøren
  // fulgte en gyldig lenke, og en 404 forklarer ingenting.
  const cupActive = ctx.tournament.status === 'active';
  // Allerede trukket → angre-varianten (E7).
  const isUndo = ctx.pending.some((m) => m.alreadyWithdrawn);
  const toWrite = ctx.pending.filter((m) => !m.alreadyWithdrawn);
  const errorMessage = (() => {
    if (!errorCode) return undefined;
    const key = `withdraw.errors.${errorCode}` as Parameters<typeof t>[0];
    return t.has(key) ? t(key) : t('withdraw.errors.withdraw_failed');
  })();

  // Fourball-kampene der makkeren KAN spille videre alene. Forhåndsvalget er
  // «etter regelen» (E4) — arrangøren huker av per kamp.
  const playOnChoices = toWrite.filter((m) => m.canPlayOn);

  return (
    <Shell>
      <TopBar backHref={cancelHref} kicker={t('ledger.kicker')} />
      <BrassRibbon kicker={t('withdraw.kicker')} />

      <div className="px-1">
        <h1 className="mb-3 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          {isUndo
            ? t('withdraw.undoHeading', { name: ctx.player.name })
            : t('withdraw.headingAdmin', {
                name: ctx.player.name,
                cup: ctx.tournament.name,
              })}
        </h1>
        <p className="font-sans text-[13px] leading-relaxed text-muted">
          {teamNames.team1} {t('manage.mot')} {teamNames.team2}
        </p>
      </div>

      {errorMessage && (
        <div className="mt-4">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}

      {!isUndo && cupActive && (
        <div className="mt-5">
          <Banner tone="warning">{t('withdraw.warningAdmin')}</Banner>
        </div>
      )}

      {!cupActive ? (
        <div className="mt-5 rounded-xl border border-border bg-surface px-4 py-3.5">
          <p
            className="font-sans text-[13px] leading-relaxed text-text"
            data-testid="cup-withdraw-cup-not-active"
          >
            {t('withdraw.errors.wrong_status')}
          </p>
        </div>
      ) : isUndo ? (
        <div className="mt-5 rounded-xl border border-border bg-surface px-4 py-3.5">
          <p className="font-sans text-[13px] leading-relaxed text-text">
            {t('withdraw.undoBody')}
          </p>
        </div>
      ) : toWrite.length === 0 ? (
        <div className="mt-5 rounded-xl border border-border bg-surface px-4 py-3.5">
          <p className="font-sans text-[13px] leading-relaxed text-text">
            {t('withdraw.nothingPending')}
          </p>
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-border bg-surface px-4 py-3.5">
          <p className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            {t('withdraw.matchesHeading')}
          </p>
          <ul className="space-y-1 font-sans text-[13px] text-text" data-testid="cup-withdraw-consequences">
            {toWrite.map((m) => (
              <li key={m.gameId}>{matchLine(m, t, locale, teamNames)}</li>
            ))}
          </ul>
        </div>
      )}

      {ctx.untouched.length > 0 && (
        <div className="mt-4 rounded-xl border border-border bg-surface px-4 py-3.5">
          <p className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            {t('withdraw.untouchedHeading')}
          </p>
          <ul className="space-y-1 font-sans text-[13px] text-muted">
            {ctx.untouched.map((m) => (
              <li key={m.gameId}>{m.matchLabel ?? t('matchFallback')}</li>
            ))}
          </ul>
          <p className="mt-3 font-sans text-[12px] leading-relaxed text-muted">
            {t('withdraw.untouchedNote')}
          </p>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-2.5">
        {!cupActive ? null : isUndo ? (
          <form action={submitUndoCupWithdrawal}>
            <input type="hidden" name="tournament_id" value={tournamentId} />
            <input type="hidden" name="user_id" value={userId} />
            <input type="hidden" name="group_id" value={groupIdField} />
            <SubmitButton className="w-full" pendingLabel={t('withdraw.undoPending')}>
              {t('withdraw.undoButton')}
            </SubmitButton>
          </form>
        ) : (
          toWrite.length > 0 && (
            <form action={submitCupWithdrawal}>
              <input type="hidden" name="tournament_id" value={tournamentId} />
              <input type="hidden" name="user_id" value={userId} />
              <input type="hidden" name="group_id" value={groupIdField} />

              {playOnChoices.length > 0 && (
                <div className="mb-4 rounded-xl border border-border bg-surface px-4 py-3.5">
                  {playOnChoices.map((m) => (
                    <fieldset key={m.gameId} className="mb-3 last:mb-0">
                      <legend className="font-sans text-[12px] text-muted">
                        {m.matchLabel ?? t('matchFallback')} ·{' '}
                        {t('withdraw.playOnLegend', { partner: m.partnerName ?? '' })}
                      </legend>
                      {/* Forhåndsvalget er «etter regelen» (E4): arrangøren
                          skal aktivt bestemme at makkeren spiller videre. */}
                      <label className="mt-1 flex min-h-[44px] items-center gap-2 font-sans text-[13px] text-text">
                        <input
                          type="checkbox"
                          name="play_on_game_ids"
                          value={m.gameId}
                          data-testid={`cup-withdraw-playon-${m.gameId}`}
                        />
                        {t('withdraw.playOnYes', { partner: m.partnerName ?? '' })}
                      </label>
                    </fieldset>
                  ))}
                  <p className="font-sans text-[12px] leading-relaxed text-muted">
                    {t('withdraw.playOnHelp', {
                      partner: playOnChoices[0].partnerName ?? '',
                    })}
                  </p>
                </div>
              )}

              <SubmitButton
                className="w-full"
                pendingLabel={t('withdraw.withdrawPending')}
                style={{
                  background: 'var(--danger-deep)',
                  borderColor: 'var(--danger-deep)',
                }}
              >
                {t('withdraw.withdrawButtonAdmin')}
              </SubmitButton>
            </form>
          )
        )}
        <SmartLink
          href={cancelHref}
          className="rounded-full border border-border bg-surface px-3 py-3 text-center font-sans text-[13px] font-medium text-text"
        >
          {t('withdraw.cancelButton')}
        </SmartLink>
      </div>
    </Shell>
  );
}
