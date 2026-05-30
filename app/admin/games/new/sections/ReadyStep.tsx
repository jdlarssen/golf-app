'use client';

/**
 * ReadyStep — wizard-only steg 4 «Klar?».
 *
 * Ansvar: viser et summary-kort av valgene (format + lagstørrelse,
 * bane + tee + tee-off, antall spillere + lag-fordeling), spillnavn med
 * inline-rediger, en sammenleggbar «Vis avanserte innstillinger»-disclosure
 * som mounter AdvancedSettingsSection med score-visibility + sideturnering,
 * og publish/draft-knappene + escape-hatch-tekstlenken.
 *
 * Filen lever som komponent, men er IKKE wired i GameForm. GameWizard
 * mounter den i wizard-stegtreet.
 */

import { useState } from 'react';
import type { GameFormMode } from '../GameForm';
import type { GameFormState } from '../useGameFormState';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AdvancedSettingsSection } from './AdvancedSettingsSection';
import { TEAM_NUMBERS } from '../useGameFormState';
import type { GameMode } from '@/lib/scoring/modes/types';
import type { TeamSize } from '../TeamSizeSelector';

type Props = {
  state: GameFormState;
  mode: GameFormMode;
  /**
   * Bryter til full-form-view («Tilpass alle detaljer»-lenken). Wizard-en
   * sender en handler som setter `view = 'full'` i orkestratoren.
   */
  onOpenFullForm: () => void;
  /**
   * Kalles første gang admin redigerer navnet manuelt. Wizard-en setter
   * `nameTouched = true` slik at auto-name fra bane/tee-off ikke
   * overstyrer det redigerte navnet.
   */
  onNameTouched?: () => void;
};

// Lokal label-map som matcher spec-en sin summary-copy. `MODE_LABELS` i
// `lib/scoring/modes/types.ts` bruker «Best ball» (kort), men summary-kortet
// stiller «Best ball» eksplisitt så Jørgen ikke lurer på om det er
// brutto-varianten.
const MODE_SUMMARY_LABELS: Record<GameMode, string> = {
  best_ball: 'Best ball',
  stableford: 'Stableford',
  modified_stableford: 'Modifisert Stableford',
  singles_matchplay: 'Singles matchplay',
  solo_strokeplay: 'Solo slagspill netto',
  texas_scramble: 'Texas scramble',
  ambrose: 'Ambrose',
  florida_scramble: 'Florida Scramble',
  fourball_matchplay: 'Four-ball matchplay',
  foursomes_matchplay: 'Foursomes matchplay',
  wolf: 'Wolf',
  nassau: 'Nassau',
  skins: 'Skins',
  bingo_bango_bongo: 'Bingo Bango Bongo',
  nines: 'Nines / Split Sixes',
  round_robin: 'Round Robin',
  acey_deucey: 'Acey Deucey',
  shamble: 'Shamble / Champagne Scramble',
  patsome: 'Patsome',
};

function teamSizeLabel(size: TeamSize): string {
  if (size === 1) return 'Solo';
  if (size === 2) return '2-mannslag';
  if (size === 3) return '3-mannslag';
  return '4-mannslag';
}

const NORWEGIAN_MONTHS = [
  'januar',
  'februar',
  'mars',
  'april',
  'mai',
  'juni',
  'juli',
  'august',
  'september',
  'oktober',
  'november',
  'desember',
] as const;

function formatTeeOff(value: string): string {
  if (!value) return 'Ikke satt';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = date.getDate();
  const month = NORWEGIAN_MONTHS[date.getMonth()];
  const year = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${day}. ${month} ${year} kl. ${hh}:${mm}`;
}

export function ReadyStep({
  state,
  mode,
  onOpenFullForm,
  onNameTouched,
}: Props) {
  const {
    name,
    setName,
    canPublish,
    missingForPublish,
    gameMode,
    teamSize,
    selectedCourse,
    teeBoxId,
    availableTees,
    scheduledTeeOffAt,
    selectedPlayerIds,
    playersByTeam,
    isBestBall,
    isParStableford,
    isMatchplay,
    isTexas,
    isAmbrose,
    isShamble,
    isSolo,
  } = state;
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [nameEditing, setNameEditing] = useState(false);

  const selectedTeeBox = availableTees.find((t) => t.id === teeBoxId) ?? null;

  // Lag-fordeling-summary per modus. Spec-en ber om kort prosa:
  //   «4 lag à 2 spillere» / «2 lag à 4 spillere» / «1 v 1» / «N spillere».
  function teamsSummary(): string {
    const count = selectedPlayerIds.length;
    if (isSolo) {
      return `${count} ${count === 1 ? 'spiller' : 'spillere'}`;
    }
    if (isMatchplay) {
      const side1 = selectedPlayerIds.filter(
        (pid) => state.teamByPlayer[pid] === 1,
      ).length;
      const side2 = selectedPlayerIds.filter(
        (pid) => state.teamByPlayer[pid] === 2,
      ).length;
      return side1 === 1 && side2 === 1 ? '1 v 1' : 'Ikke fordelt';
    }
    const teamsCount = TEAM_NUMBERS.filter(
      (t) => playersByTeam[t].length > 0,
    ).length;
    if (teamsCount === 0) {
      return `${count} ${count === 1 ? 'spiller' : 'spillere'} (ikke fordelt)`;
    }
    if (isBestBall) {
      return `${teamsCount} lag à 2 spillere`;
    }
    if (isParStableford) {
      return `${teamsCount} lag à 2 spillere`;
    }
    if (isTexas || isAmbrose || isShamble) {
      return `${teamsCount} lag à ${teamSize} spillere`;
    }
    return `${count} ${count === 1 ? 'spiller' : 'spillere'}`;
  }

  // Resolve publish + draft-server-actions per mode-kind. Speiler logikken
  // i GameForm.getDraftAndPublishActions så wizard og stacked-form bruker
  // samme action-routing.
  function resolveActions() {
    if (mode.kind === 'create') {
      return {
        publish: mode.createAndPublishAction,
        draft: mode.createDraftAction,
      };
    }
    if (mode.kind === 'edit-draft') {
      return {
        publish: mode.publishAction.bind(null, mode.gameId),
        draft: mode.saveDraftAction.bind(null, mode.gameId),
      };
    }
    return null;
  }
  const actions = resolveActions();

  return (
    <section className="space-y-4">
      {/* Summary-kort — viser alle valg i rad-format. Hver rad har muted
          label til venstre og verdi til høyre. Verdien faller tilbake til
          «Ikke valgt»/«Ikke satt» når feltet er tomt. */}
      <div className="space-y-1.5 rounded-lg border border-border bg-surface-2 p-3">
        <SummaryRow
          label="Format"
          value={`${MODE_SUMMARY_LABELS[gameMode]} · ${teamSizeLabel(teamSize)}`}
        />
        <SummaryRow
          label="Bane"
          value={selectedCourse?.name ?? 'Ikke valgt'}
        />
        <SummaryRow
          label="Tee"
          value={selectedTeeBox?.name ?? 'Ikke valgt'}
        />
        <SummaryRow label="Tee-off" value={formatTeeOff(scheduledTeeOffAt)} />
        <SummaryRow label="Spillere" value={teamsSummary()} />
      </div>

      {/* Spillnavn — klikk-for-å-redigere over summary. Skjult input
          serialiserer fortsatt verdien via samme `name`-felt som GameForm
          bruker. */}
      <div className="space-y-1.5">
        <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          Spillnavn
        </span>
        {nameEditing ? (
          <Input
            id="name"
            name="name"
            type="text"
            label="Spillnavn"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              onNameTouched?.();
            }}
            onBlur={() => setNameEditing(false)}
            autoFocus
            required
          />
        ) : (
          <button
            type="button"
            onClick={() => setNameEditing(true)}
            className="w-full text-left font-serif text-lg text-text rounded-md px-2 py-1 -mx-2 hover:bg-primary-soft/40"
          >
            {name || <span className="italic text-muted">Trykk for å sette navn</span>}
          </button>
        )}
        {!nameEditing && (
          <input type="hidden" name="name" value={name} />
        )}
      </div>

      {/* «Vis avanserte innstillinger»-disclosure. Wizard-løftet inkluderer
          score-visibility-radios + sideturnering-fieldset via
          AdvancedSettingsSection-propet `includeVisibility`. `hideHeading`
          unngår dobbel-merking siden disclosure-knappen allerede har sin
          egen «Vis avanserte innstillinger»-label. */}
      <div className="rounded-lg border border-border">
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          aria-expanded={advancedOpen}
          className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-text"
        >
          <span>Vis avanserte innstillinger</span>
          <span aria-hidden="true" className="text-muted">
            {advancedOpen ? '–' : '+'}
          </span>
        </button>
        {advancedOpen && (
          <div className="border-t border-border px-3 py-3">
            <AdvancedSettingsSection
              state={state}
              includeVisibility
              hideHeading
            />
          </div>
        )}
      </div>

      {/* Publish + draft knapper — speiler GameForm submit-seksjonen. */}
      {actions && (
        <div className="space-y-3 pt-1">
          <Button
            type="submit"
            formAction={actions.publish}
            className="w-full"
            disabled={!canPublish}
            aria-describedby={
              !canPublish && missingForPublish.length > 0
                ? 'publish-missing'
                : undefined
            }
          >
            Lagre og publiser
          </Button>
          {!canPublish && missingForPublish.length > 0 && (
            <p
              id="publish-missing"
              className="text-xs text-muted text-center"
            >
              Mangler: {missingForPublish.join(', ')}
            </p>
          )}
          <Button
            type="submit"
            variant="secondary"
            formAction={actions.draft}
            formNoValidate
            className="w-full"
            disabled={name.trim() === ''}
          >
            Lagre utkast
          </Button>
          <button
            type="button"
            onClick={onOpenFullForm}
            className="block w-full text-center text-xs text-muted underline underline-offset-2 hover:text-text"
          >
            Tilpass alle detaljer
          </button>
        </div>
      )}
    </section>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted shrink-0">
        {label}
      </span>
      <span className="text-text text-right tabular-nums">{value}</span>
    </div>
  );
}
