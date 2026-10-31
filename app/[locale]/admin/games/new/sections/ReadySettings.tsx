'use client';

/**
 * ReadySettings — INNSTILLINGER on step 5 «Klar?» (#2457): Handicap,
 * Startkontingent, Under runden and Sideturnering og premier as short rows,
 * each with the value that is set and «Endre». «Endre» opens a bottom sheet
 * with only that row's fields. Replaces the «Vis avanserte innstillinger»
 * panel.
 *
 * A sheet that closes unmounts its fields, so the values are never carried by
 * the fields themselves: `FormDataInputs` in GameWizard mirrors all of
 * `useGameFormState` into hidden inputs on every step (#1011, #1400). Publish
 * and «Lagre som utkast» read from there.
 *
 * Which sheet is open is owned by ReadyStep (`openKey`), so the checklist's
 * «Endre» on a red Format row can open the Handicap sheet.
 */

import { useTranslations } from 'next-intl';
import type { GameFormState } from '../useGameFormState';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Kicker } from '@/components/ui/Kicker';
import { countPrizesInPlay, prizeShapeFor } from '@/lib/games/prizes';
import { AdvancedSettingsSection } from './AdvancedSettingsSection';
import { HandicapSettings } from './HandicapSettings';
import { RegistrationSection } from './RegistrationSection';
import {
  readySettingsRows,
  type ReadySettingsKey,
  type ReadySettingsRow,
} from './readySettingsRules';

// The row's 48 px include the divider under it, so the text centres above it,
// as on the artboard. The last row has no divider.
const ROW_CLASS =
  'flex min-h-12 w-full items-center gap-2.5 px-3.5 py-2 text-left border-b border-row-divider-warm';

export function ReadySettings({
  state,
  openKey,
  onOpenChange,
}: {
  state: GameFormState;
  openKey: ReadySettingsKey | null;
  onOpenChange: (key: ReadySettingsKey | null) => void;
}) {
  const t = useTranslations('wizard.ready.settings');

  // The same count as the prize table's own row: a prize in a slot the format
  // does not show is dropped when the game is saved, so it is not counted.
  const prizeCount = countPrizesInPlay(state.prizeDraft, prizeShapeFor(state));

  const rows = readySettingsRows({
    gameMode: state.gameMode,
    teamSize: state.teamSize,
    hcpAllowance: state.hcpAllowance,
    fourballAllowancePct: state.fourballAllowancePct,
    foursomesAllowancePct: state.foursomesAllowancePct,
    greensomeAllowancePct: state.greensomeAllowancePct,
    chapmanAllowancePct: state.chapmanAllowancePct,
    gruesomeAllowancePct: state.gruesomeAllowancePct,
    roundRobinAllowancePct: state.roundRobinAllowancePct,
    texasHandicapPct: state.texasHandicapPct,
    ambroseHandicapPct: state.ambroseHandicapPct,
    floridaHandicapPct: state.floridaHandicapPct,
    entryFeeKr: state.entryFeeKr,
    scoreVisibility: state.scoreVisibility,
    requirePeerApproval: state.requirePeerApproval,
    sideEnabled: state.sideEnabled,
    prizeCount,
  }).filter((row) => row.visible);

  function valueText(row: ReadySettingsRow): string {
    if (row.key === 'handicap') {
      const v = row.value;
      if (v.kind === 'gross') return t('values.handicapGross');
      if (v.kind === 'teamAverage') return t('values.handicapTeamAverage', { pct: v.pct });
      return t('values.handicapNet', { pct: v.pct });
    }
    if (row.key === 'fee') {
      return row.value.kind === 'none'
        ? t('values.feeNone')
        : t('values.feeAmount', { kr: row.value.kr });
    }
    if (row.key === 'duringRound') {
      return [
        row.value.visibility === 'live'
          ? t('values.visibilityLive')
          : t('values.visibilityReveal'),
        row.value.peerApproval ? t('values.peerApproval') : null,
      ]
        .filter(Boolean)
        .join(' · ');
    }
    return [
      row.value.sideEnabled ? t('values.sideOn') : t('values.sideOff'),
      row.value.prizeCount > 0 ? t('values.prizes', { count: row.value.prizeCount }) : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }

  const close = () => onOpenChange(null);

  return (
    <>
      <Kicker className="px-1 pt-[18px] pb-2 leading-[normal]">{t('kicker')}</Kicker>
      <ul
        data-focus-inset
        data-testid="ready-settings"
        className="overflow-hidden rounded-2xl border border-border bg-surface"
      >
        {rows.map((row, i) => (
          <li key={row.key} data-testid={`ready-setting-${row.key}`}>
            <button
              type="button"
              onClick={() => onOpenChange(row.key)}
              className={`${ROW_CLASS} ${i === rows.length - 1 ? 'border-b-0' : ''}`}
            >
              {/* Plain spaces between the parts are for the accessible name: a
                  flex container does not draw them, and a screen reader would
                  run «HandicapNetto, 100 %Endre» together. */}
              <span className="min-w-0 flex-1 font-sans text-sm leading-[normal] font-semibold text-text">
                {t(`rows.${row.key}`)}
              </span>{' '}
              <span className="font-sans text-[13px] leading-[normal] text-muted">
                {valueText(row)}
              </span>{' '}
              <span className="shrink-0 font-sans text-[13px] leading-[normal] font-semibold text-primary">
                {t('edit')}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <BottomSheet
        open={openKey === 'handicap'}
        title={t('rows.handicap')}
        onClose={close}
        doneLabel={t('done')}
        closeLabel={t('close')}
      >
        <HandicapSettings state={state} />
      </BottomSheet>
      <BottomSheet
        open={openKey === 'fee'}
        title={t('rows.fee')}
        onClose={close}
        doneLabel={t('done')}
        closeLabel={t('close')}
      >
        <RegistrationSection state={state} hideHeading part="fee" />
      </BottomSheet>
      <BottomSheet
        open={openKey === 'duringRound'}
        title={t('rows.duringRound')}
        onClose={close}
        doneLabel={t('done')}
        closeLabel={t('close')}
      >
        <AdvancedSettingsSection
          state={state}
          includeVisibility
          hideHeading
          serializedExternally
          part="duringRound"
        />
      </BottomSheet>
      <BottomSheet
        open={openKey === 'sideAndPrizes'}
        title={t('rows.sideAndPrizes')}
        onClose={close}
        doneLabel={t('done')}
        closeLabel={t('close')}
      >
        <AdvancedSettingsSection
          state={state}
          includeVisibility
          hideHeading
          serializedExternally
          part="sideAndPrizes"
        />
      </BottomSheet>
    </>
  );
}
