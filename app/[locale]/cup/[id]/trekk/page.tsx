import { notFound } from 'next/navigation';
import { getTranslations, getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { first } from '@/lib/url/searchParams';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Banner } from '@/components/ui/Banner';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { SmartLink } from '@/components/ui/SmartLink';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { formatTeeOffDateLocale } from '@/lib/i18n/format';
import type { AppLocale } from '@/i18n/routing';
import { getCupSnapshot } from '@/lib/cup/getCupSnapshot';
import { canViewCupPage } from '@/lib/cup/cupPageAccess';
import { loadCupWithdrawalContext } from '@/lib/cup/cupWithdrawalContext';
import { submitSelfCupWithdrawal } from '@/lib/cup/withdrawalFormActions';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ error?: string | string[] }>;

/**
 * `/cup/[id]/trekk` — spilleren melder seg selv ut av en cup (#1814, E7).
 *
 * Samme konsekvensliste som arrangør-siden, men UTEN fourball-valget: det er
 * arrangøren som registrerer om makkeren spiller alene (E4), og forhåndsvalget
 * «etter regelen» gjelder til hen har bestemt seg. Ingen selv-angre.
 *
 * Denne ruta er også målet for «Trekk deg»-lenkene i en cup-kamps venterom —
 * `/games/[id]/trekk-fra` SLETTER `game_players`-raden, som på en cup-kamp
 * etterlot en ufullstendig side auto-start aldri kunne starte.
 *
 * Gate: samme deltaker-/klubbregel som selve cup-siden (`canViewCupPage`), og
 * i tillegg at brukeren faktisk står i cupen. Snapshotet leser med service-role
 * (#1542), så gaten HER er håndhevelsen.
 */
export default async function CupSelfWithdrawPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const [userId, t, locale] = await Promise.all([
    getProxyVerifiedUserId(),
    getTranslations('cup'),
    getLocale() as Promise<AppLocale>,
  ]);
  if (!userId) redirect({ href: `/login?next=/cup/${id}/trekk`, locale });

  const snapshot = await getCupSnapshot(id, t('manage.unknownPlayer'));
  if (!snapshot) notFound();

  const allowed = await canViewCupPage({
    tournamentId: id,
    groupId: snapshot.tournament.group_id,
    roster: snapshot.roster,
    proxyUserId: userId,
  });
  if (!allowed) notFound();

  const ctx = await loadCupWithdrawalContext({
    tournamentId: id,
    userId: userId as string,
    unknownLabel: t('manage.unknownPlayer'),
  });
  // Ikke-deltaker: ingen kamper i det hele tatt.
  if (!ctx || (ctx.pending.length === 0 && ctx.untouched.length === 0)) notFound();

  const errorCode = first(sp.error);
  const errorMessage = (() => {
    if (!errorCode) return undefined;
    const key = `withdraw.errors.${errorCode}` as Parameters<typeof t>[0];
    return t.has(key) ? t(key) : t('withdraw.errors.withdraw_failed');
  })();

  // Cup-status-gaten (kontrakten: «cup draft/finished → alle trekk-innganger
  // skjult og actions avviser»). `withdrawSelfFromCup` returnerer `wrong_status`
  // uansett; her sier vi det FØR spilleren trykker, i stedet for å love en
  // knapp serveren avviser. Info-linje framfor `notFound()` — spilleren fulgte
  // en gyldig lenke, og en 404 forklarer ingenting.
  const cupActive = ctx.tournament.status === 'active';
  const toWrite = ctx.pending.filter((m) => !m.alreadyWithdrawn);
  const teamNames = {
    team1: ctx.tournament.team_1_name,
    team2: ctx.tournament.team_2_name,
  };

  return (
    <AppShell>
      <TopBar
        backHref={`/cup/${id}`}
        backLabel={t('withdraw.backToCup')}
        kicker={t('withdraw.kicker')}
      />

      <div className="px-1">
        <h1 className="mb-3 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          {t('withdraw.headingSelf', { cup: ctx.tournament.name })}
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

      {cupActive && (
        <div className="mt-5">
          <Banner tone="warning">{t('withdraw.warningSelf')}</Banner>
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
          <ul
            className="space-y-1 font-sans text-[13px] text-text"
            data-testid="cup-withdraw-consequences"
          >
            {toWrite.map((m) => {
              const label = m.matchLabel ?? t('matchFallback');
              const when = m.scheduledTeeOffAt
                ? formatTeeOffDateLocale(new Date(m.scheduledTeeOffAt), locale)
                : t('withdraw.teeOffMissing');
              // Spilleren ser regelen slik den står NÅ. Velger arrangøren
              // etterpå at makkeren spiller alene, endrer utfallet seg — derfor
              // sier `selfNote` under at arrangøren ser trekket med en gang.
              const consequence = m.outcome
                ? m.outcome.outcome === 'halved'
                  ? t('withdraw.outcomeHalved')
                  : t('withdraw.outcomeWalkover', {
                      team:
                        m.outcome.winnerSide === 1 ? teamNames.team1 : teamNames.team2,
                    })
                : t('withdraw.outcomePlayOn', { partner: m.partnerName ?? '' });
              return <li key={m.gameId}>{`${label} · ${when} → ${consequence}`}</li>;
            })}
          </ul>
          <p className="mt-3 font-sans text-[12px] leading-relaxed text-muted">
            {t('withdraw.selfNote')}
          </p>
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
        {cupActive && toWrite.length > 0 && (
          <form action={submitSelfCupWithdrawal}>
            <input type="hidden" name="tournament_id" value={id} />
            <SubmitButton
              className="w-full"
              pendingLabel={t('withdraw.withdrawPending')}
              style={{
                background: 'var(--danger-deep)',
                borderColor: 'var(--danger-deep)',
              }}
            >
              {t('withdraw.withdrawButtonSelf')}
            </SubmitButton>
          </form>
        )}
        <SmartLink
          href={`/cup/${id}`}
          className="rounded-full border border-border bg-surface px-3 py-3 text-center font-sans text-[13px] font-medium text-text"
        >
          {t('withdraw.cancelButton')}
        </SmartLink>
      </div>
    </AppShell>
  );
}
