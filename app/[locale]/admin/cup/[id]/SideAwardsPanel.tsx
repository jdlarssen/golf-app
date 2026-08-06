'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import {
  saveSideAwardConfig,
  registerSideAwardWinner,
  type SideAwardConfigInput,
} from '@/lib/cup/sideAwardActions';
import type { CupSideAwardSnapshot } from '@/lib/cup/getCupSnapshot';

/**
 * Sidepoeng-panel for cup-admin-detaljen (#1441, D9). Ett sted for begge
 * halvdelene av flyten:
 *  - **Oppsett** (add/remove-rader: kind/hull/poeng) — redigerbar mens cupen
 *    er `draft`, eller `active` så lenge ingen rad har fått en vinner ennå
 *    (speiler `saveSideAwardConfig`s egen gate — `configEditable` sendes inn
 *    ferdig utledet fra kall-siden, som allerede har snapshotet).
 *  - **Vinner-registrering** («Etter runden») — én rad per konfigurert
 *    innslag med en vinner-dropdown, synlig når cupen er `active`/`finished`
 *    OG minst ett innslag finnes.
 *
 * Plassert på cup-admin-detaljen (ikke i generer-wizarden): sidepoeng er
 * cup-dag-bredt og uavhengig av match-batchen (egen server-action, egen
 * tabell) — arrangøren kan sette dem opp før ELLER etter matchene er
 * generert, og winner-registreringen hører uansett hjemme her (skjer etter
 * runden er spilt, når organisatoren allerede er på denne siden for å
 * avslutte cupen).
 */

export type SideAwardRosterOption = { userId: string; label: string };

type Props = {
  tournamentId: string;
  initialAwards: CupSideAwardSnapshot[];
  rosterOptions: SideAwardRosterOption[];
  configEditable: boolean;
  showWinnerRegistration: boolean;
};

function formatPoints(n: number): string {
  return String(n).replace('.', ',');
}

export function SideAwardsPanel({
  tournamentId,
  initialAwards,
  rosterOptions,
  configEditable,
  showWinnerRegistration,
}: Props) {
  const t = useTranslations('cup.sideAwards');
  const router = useRouter();
  const [rows, setRows] = useState<SideAwardConfigInput[]>(
    initialAwards.map((a) => ({ kind: a.kind, holeNumber: a.holeNumber, points: a.points })),
  );
  const [isSaving, startSaving] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  const errorMap: Record<string, string> = {
    invalid_side_award: t('errors.invalid'),
    duplicate_side_award: t('errors.duplicate'),
    not_found: t('errors.notFound'),
    cup_finished: t('errors.cupFinished'),
    winners_already_registered: t('errors.winnersRegistered'),
    save_failed: t('errors.saveFailed'),
  };

  function addRow() {
    setRows((prev) => [...prev, { kind: 'ctp', holeNumber: 1, points: 1 }]);
    setSaveOk(false);
  }
  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
    setSaveOk(false);
  }
  function updateRow(i: number, patch: Partial<SideAwardConfigInput>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    setSaveOk(false);
  }

  function handleSave() {
    setSaveError(null);
    startSaving(async () => {
      const result = await saveSideAwardConfig(tournamentId, rows);
      if (!result.ok) {
        setSaveError(errorMap[result.error] ?? t('errors.saveFailed'));
        return;
      }
      setSaveOk(true);
      router.refresh();
    });
  }

  return (
    <section className="mb-5" data-testid="cup-side-awards">
      <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted mb-2">
        {t('heading')}
      </h2>
      <p className="text-xs text-muted mb-3">{t('hint')}</p>

      {configEditable ? (
        <Card>
          <div className="space-y-3">
            {rows.length === 0 && (
              <p className="text-sm text-muted">{t('empty')}</p>
            )}
            {rows.length > 0 && (
              <div className="grid grid-cols-[minmax(0,1fr)_4rem_4rem_2.25rem] gap-2 font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                <span>{t('kindLabel')}</span>
                <span>{t('holeLabel')}</span>
                <span>{t('pointsLabel')}</span>
                <span aria-hidden="true" />
              </div>
            )}
            {rows.map((row, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_4rem_4rem_2.25rem] items-center gap-2">
                <select
                  aria-label={t('kindLabel')}
                  value={row.kind}
                  onChange={(e) => updateRow(i, { kind: e.target.value as 'ctp' | 'ld' })}
                  className="rounded-lg border border-border px-2 py-2 bg-surface text-text text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                >
                  <option value="ctp">{t('kindCtp')}</option>
                  <option value="ld">{t('kindLd')}</option>
                </select>
                <input
                  type="number"
                  aria-label={t('holeLabel')}
                  min={1}
                  max={18}
                  value={row.holeNumber}
                  onChange={(e) => updateRow(i, { holeNumber: Number(e.target.value) })}
                  className="w-full rounded-lg border border-border px-2 py-2 bg-surface text-text text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
                <input
                  type="number"
                  aria-label={t('pointsLabel')}
                  min={0.5}
                  step={0.5}
                  value={row.points}
                  onChange={(e) => updateRow(i, { points: Number(e.target.value) })}
                  className="w-full rounded-lg border border-border px-2 py-2 bg-surface text-text text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  aria-label={t('removeRow')}
                  className="min-h-[36px] min-w-[36px] rounded-lg border border-border text-danger text-sm hover:bg-danger/10"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addRow}
              className="min-h-[44px] w-full rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted hover:border-primary hover:text-primary transition-colors"
            >
              {t('addRow')}
            </button>
            {saveError && <Banner tone="error">{saveError}</Banner>}
            {saveOk && !saveError && <Banner tone="success">{t('saved')}</Banner>}
            <Button
              type="button"
              className="w-full"
              onClick={handleSave}
              pending={isSaving}
              pendingLabel={t('savingPending')}
            >
              {t('saveButton')}
            </Button>
          </div>
        </Card>
      ) : (
        <Card>
          {initialAwards.length === 0 ? (
            <p className="text-sm text-muted">{t('empty')}</p>
          ) : (
            <ul className="space-y-1 text-sm text-text">
              {initialAwards.map((a) => (
                <li key={a.id}>
                  {t(a.kind === 'ctp' ? 'kindCtp' : 'kindLd')} · {t('holeShort', { n: a.holeNumber })} ·{' '}
                  {formatPoints(a.points)} p
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {showWinnerRegistration && initialAwards.length > 0 && (
        <div className="mt-4">
          <h3 className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted mb-2">
            {t('winnersHeading')}
          </h3>
          <div className="space-y-2">
            {initialAwards.map((a) => (
              <SideAwardWinnerRow
                key={a.id}
                tournamentId={tournamentId}
                award={a}
                rosterOptions={rosterOptions}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function SideAwardWinnerRow({
  tournamentId,
  award,
  rosterOptions,
}: {
  tournamentId: string;
  award: CupSideAwardSnapshot;
  rosterOptions: SideAwardRosterOption[];
}) {
  const t = useTranslations('cup.sideAwards');
  const router = useRouter();
  const [winnerId, setWinnerId] = useState(award.winnerUserId ?? '');
  const [isSaving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const registerErrorMap: Record<string, string> = {
    not_found: t('errors.notFound'),
    not_a_participant: t('errors.notParticipant'),
    save_failed: t('errors.saveFailed'),
  };

  function handleRegister() {
    if (!winnerId) return;
    setError(null);
    startSaving(async () => {
      const result = await registerSideAwardWinner({
        tournamentId,
        awardId: award.id,
        winnerUserId: winnerId,
      });
      if (!result.ok) {
        setError(registerErrorMap[result.error] ?? t('errors.saveFailed'));
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <Card className="!p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-sans text-sm text-text">
          {t(award.kind === 'ctp' ? 'kindCtp' : 'kindLd')} · {t('holeShort', { n: award.holeNumber })}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <select
            aria-label={t('winnerLabel')}
            value={winnerId}
            onChange={(e) => {
              setWinnerId(e.target.value);
              setSaved(false);
            }}
            className="rounded-lg border border-border px-2 py-2 bg-surface text-text text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
          >
            <option value="">{t('winnerPlaceholder')}</option>
            {rosterOptions.map((p) => (
              <option key={p.userId} value={p.userId}>
                {p.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleRegister}
            disabled={!winnerId || isSaving}
            className="min-h-[36px] rounded-lg bg-primary text-white px-3 py-1.5 text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isSaving ? t('registeringPending') : t('registerButton')}
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
      {saved && !error && <p className="text-xs text-primary mt-2">{t('registered')}</p>}
    </Card>
  );
}
