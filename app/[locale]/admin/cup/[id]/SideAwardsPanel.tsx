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
  registerGirCounts,
} from '@/lib/cup/sideAwardActions';
import { groupSideAwardRows, type SideAwardConfigInput } from '@/lib/cup/sideAwardRows';
import type { CupSideAwardSnapshot } from '@/lib/cup/getCupSnapshot';

/**
 * Sidepoeng-panel for cup-admin-detaljen (#1441 D9, #1489 slots + GIR). Ett
 * sted for begge halvdelene av flyten:
 *  - **Oppsett** (add/remove-rader: kind/hull/poeng/vinnere) — redigerbar KUN
 *    mens cupen er `draft` (#1455: sidepoeng-oppsett låses ved start).
 *    Rad-staten er CONFIG-rader (én per type+hull, med antall) — snapshotets
 *    slot-rader foldes tilbake via `groupSideAwardRows`. «Vinnere»-feltet har
 *    dobbel semantikk (eier-valgt, #1489): antall vinner-plasser for ctp/ld,
 *    maks per lag for gir — hjelpeteksten under tabellen forklarer.
 *  - **Registrering** («Etter runden») — ctp/ld: én vinner-dropdown per
 *    slot-rad, nummerert «(1 av 3)» når raden har søsken. gir: to tallfelt
 *    (én per lag) som skriver `registerGirCounts`. Synlig når cupen er
 *    `active`/`finished` OG minst ett innslag finnes.
 *
 * Plassert på cup-admin-detaljen (ikke i generer-wizarden): sidepoeng er
 * cup-dag-bredt og uavhengig av match-batchen (egen server-action, egen
 * tabell) — arrangøren kan sette dem opp før ELLER etter matchene er
 * generert, og registreringen hører uansett hjemme her (skjer etter runden er
 * spilt, når organisatoren allerede er på denne siden for å avslutte cupen).
 */

export type SideAwardRosterOption = { userId: string; label: string };

type Props = {
  tournamentId: string;
  initialAwards: CupSideAwardSnapshot[];
  rosterOptions: SideAwardRosterOption[];
  team1Name: string;
  team2Name: string;
  configEditable: boolean;
  showWinnerRegistration: boolean;
};

function formatPoints(n: number): string {
  return String(n).replace('.', ',');
}

/** Snapshot-rader → config-rader for redigerbar state og låst recap. */
function toConfigRows(awards: CupSideAwardSnapshot[]): SideAwardConfigInput[] {
  return groupSideAwardRows(
    awards.map((a) => ({
      kind: a.kind,
      holeNumber: a.holeNumber,
      points: a.points,
      maxPerTeam: a.kind === 'gir' ? a.maxPerTeam : null,
    })),
  );
}

/** Antall-feltet («Vinnere») per config-rad — maks per lag for gir. */
function countOf(row: SideAwardConfigInput): number {
  return row.kind === 'gir' ? row.maxPerTeam : row.winnerCount;
}

export function SideAwardsPanel({
  tournamentId,
  initialAwards,
  rosterOptions,
  team1Name,
  team2Name,
  configEditable,
  showWinnerRegistration,
}: Props) {
  const t = useTranslations('cup.sideAwards');
  const router = useRouter();
  const [rows, setRows] = useState<SideAwardConfigInput[]>(() => toConfigRows(initialAwards));
  const [isSaving, startSaving] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  const errorMap: Record<string, string> = {
    invalid_side_award: t('errors.invalid'),
    duplicate_side_award: t('errors.duplicate'),
    not_found: t('errors.notFound'),
    cup_finished: t('errors.cupFinished'),
    cup_started: t('errors.cupStarted'),
    winners_already_registered: t('errors.winnersRegistered'),
    save_failed: t('errors.saveFailed'),
  };

  function kindLabel(kind: CupSideAwardSnapshot['kind']): string {
    return t(kind === 'ctp' ? 'kindCtp' : kind === 'ld' ? 'kindLd' : 'kindGir');
  }

  function addRow() {
    setRows((prev) => [...prev, { kind: 'ctp', holeNumber: 1, points: 1, winnerCount: 1 }]);
    setSaveOk(false);
  }
  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
    setSaveOk(false);
  }
  function updateRow(i: number, patch: (row: SideAwardConfigInput) => SideAwardConfigInput) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? patch(r) : r)));
    setSaveOk(false);
  }

  /** Bytte av type konverterer rad-formen; antall-feltet følger med over. */
  function setKind(i: number, kind: 'ctp' | 'ld' | 'gir') {
    updateRow(i, (row) => {
      const count = countOf(row);
      if (kind === 'gir') {
        return { kind, holeNumber: row.holeNumber, points: row.points, maxPerTeam: count };
      }
      return { kind, holeNumber: row.holeNumber, points: row.points, winnerCount: count };
    });
  }

  function setCount(i: number, value: number) {
    updateRow(i, (row) =>
      row.kind === 'gir' ? { ...row, maxPerTeam: value } : { ...row, winnerCount: value },
    );
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

  const lockedRows = toConfigRows(initialAwards);

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
              <div className="grid grid-cols-[minmax(0,1fr)_3.25rem_3.25rem_3.25rem_2.25rem] gap-2 font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                <span>{t('kindLabel')}</span>
                <span>{t('holeLabel')}</span>
                <span>{t('pointsLabel')}</span>
                <span>{t('winnersColumnLabel')}</span>
                <span aria-hidden="true" />
              </div>
            )}
            {rows.map((row, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_3.25rem_3.25rem_3.25rem_2.25rem] items-center gap-2">
                <select
                  aria-label={t('kindLabel')}
                  value={row.kind}
                  onChange={(e) => setKind(i, e.target.value as 'ctp' | 'ld' | 'gir')}
                  className="rounded-lg border border-border px-2 py-2 bg-surface text-text text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                >
                  <option value="ctp">{t('kindCtp')}</option>
                  <option value="ld">{t('kindLd')}</option>
                  <option value="gir">{t('kindGir')}</option>
                </select>
                <input
                  type="number"
                  aria-label={t('holeLabel')}
                  min={1}
                  max={18}
                  value={row.holeNumber}
                  onChange={(e) => updateRow(i, (r) => ({ ...r, holeNumber: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-border px-2 py-2 bg-surface text-text text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
                <input
                  type="number"
                  aria-label={t('pointsLabel')}
                  min={0.5}
                  step={0.5}
                  value={row.points}
                  onChange={(e) => updateRow(i, (r) => ({ ...r, points: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-border px-2 py-2 bg-surface text-text text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
                <input
                  type="number"
                  aria-label={t('winnersColumnLabel')}
                  min={1}
                  max={10}
                  step={1}
                  value={countOf(row)}
                  onChange={(e) => setCount(i, Number(e.target.value))}
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
            {rows.length > 0 && (
              <p className="text-xs text-muted">{t('winnersHelp')}</p>
            )}
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
          {lockedRows.length === 0 ? (
            <p className="text-sm text-muted">{t('emptyLocked')}</p>
          ) : (
            <ul className="space-y-1 text-sm text-text">
              {lockedRows.map((row) => (
                <li key={`${row.kind}-${row.holeNumber}-${row.points}`}>
                  {kindLabel(row.kind)} · {t('holeShort', { n: row.holeNumber })} ·{' '}
                  {formatPoints(row.points)} p
                  {row.kind === 'gir'
                    ? ` · ${t('girMaxSuffix', { max: row.maxPerTeam })}`
                    : row.winnerCount > 1
                      ? ` · ${t('winnerCountSuffix', { count: row.winnerCount })}`
                      : ''}
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
            {initialAwards.map((a) =>
              a.kind === 'gir' ? (
                <GirCountsRow
                  key={a.id}
                  tournamentId={tournamentId}
                  award={a}
                  team1Name={team1Name}
                  team2Name={team2Name}
                />
              ) : (
                <SideAwardWinnerRow
                  key={a.id}
                  tournamentId={tournamentId}
                  award={a}
                  rosterOptions={rosterOptions}
                />
              ),
            )}
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
  award: Extract<CupSideAwardSnapshot, { kind: 'ctp' | 'ld' }>;
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
          {/* «(1 av 3)» kun når raden faktisk har søsken-slots (#1489) —
              gamle cuper med slotCount 1 ser ut som før. */}
          {award.slotCount > 1 && <> {t('slotOfCount', { slot: award.slot, count: award.slotCount })}</>}
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

/**
 * GIR-registrering (#1489): to tallfelt — hvor mange GIR hvert lag klarte på
 * hullet, 0..maks. Tom streng = ikke tastet ennå; begge felt må fylles før
 * registrering (0 er et gyldig, eksplisitt svar).
 */
function GirCountsRow({
  tournamentId,
  award,
  team1Name,
  team2Name,
}: {
  tournamentId: string;
  award: Extract<CupSideAwardSnapshot, { kind: 'gir' }>;
  team1Name: string;
  team2Name: string;
}) {
  const t = useTranslations('cup.sideAwards');
  const router = useRouter();
  const [team1, setTeam1] = useState(award.team1Count === null ? '' : String(award.team1Count));
  const [team2, setTeam2] = useState(award.team2Count === null ? '' : String(award.team2Count));
  const [isSaving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const registerErrorMap: Record<string, string> = {
    not_found: t('errors.notFound'),
    invalid_counts: t('errors.invalidCounts', { max: award.maxPerTeam }),
    save_failed: t('errors.saveFailed'),
  };

  const bothFilled = team1 !== '' && team2 !== '';

  function handleRegister() {
    if (!bothFilled) return;
    setError(null);
    startSaving(async () => {
      const result = await registerGirCounts({
        tournamentId,
        awardId: award.id,
        team1Count: Number(team1),
        team2Count: Number(team2),
      });
      if (!result.ok) {
        setError(registerErrorMap[result.error] ?? t('errors.saveFailed'));
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  const inputClass =
    'w-16 rounded-lg border border-border px-2 py-2 bg-surface text-text text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-accent/40';

  return (
    <Card className="!p-3">
      <p className="font-sans text-sm text-text mb-2">
        {t('kindGir')} · {t('holeShort', { n: award.holeNumber })} · {formatPoints(award.points)} p ·{' '}
        {t('girMaxSuffix', { max: award.maxPerTeam })}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted">
          {t('girTeamCountLabel', { team: team1Name })}
          <input
            type="number"
            min={0}
            max={award.maxPerTeam}
            step={1}
            value={team1}
            onChange={(e) => {
              setTeam1(e.target.value);
              setSaved(false);
            }}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          {t('girTeamCountLabel', { team: team2Name })}
          <input
            type="number"
            min={0}
            max={award.maxPerTeam}
            step={1}
            value={team2}
            onChange={(e) => {
              setTeam2(e.target.value);
              setSaved(false);
            }}
            className={inputClass}
          />
        </label>
        <button
          type="button"
          onClick={handleRegister}
          disabled={!bothFilled || isSaving}
          className="min-h-[36px] rounded-lg bg-primary text-white px-3 py-1.5 text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {isSaving ? t('registeringPending') : t('registerButton')}
        </button>
      </div>
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
      {saved && !error && <p className="text-xs text-primary mt-2">{t('girRegistered')}</p>}
    </Card>
  );
}
