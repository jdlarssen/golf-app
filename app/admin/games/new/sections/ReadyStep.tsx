'use client';

/**
 * ReadyStep — wizard-only steg 4 «Klar?».
 *
 * Ansvar: viser et summary-kort av valgene (navn, format, bane/tee/tee-off,
 * lag-fordeling), en sammenleggbar «Vis avanserte innstillinger»-disclosure
 * som mounter AdvancedSettingsSection med score-visibility + sideturnering,
 * og publish/draft-knappene + escape-hatch-tekstlenken.
 *
 * Filen lever som komponent, men er IKKE wired i GameForm. GameWizard
 * (egen subagent) mounter den i wizard-stegtreet.
 */

import { useState } from 'react';
import type { GameFormMode } from '../GameForm';
import type { GameFormState } from '../useGameFormState';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AdvancedSettingsSection } from './AdvancedSettingsSection';

type Props = {
  state: GameFormState;
  mode: GameFormMode;
  /**
   * Bryter til full-form-view («Tilpass alle detaljer»-lenken). Wizard-en
   * sender en handler som setter `view = 'full'` i orkestratoren.
   */
  onOpenFullForm: () => void;
};

export function ReadyStep({ state, mode, onOpenFullForm }: Props) {
  const {
    name,
    setName,
    canPublish,
    missingForPublish,
  } = state;
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [nameEditing, setNameEditing] = useState(false);

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
            onChange={(e) => setName(e.target.value)}
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
          AdvancedSettingsSection-propet `includeVisibility`. */}
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
            <AdvancedSettingsSection state={state} includeVisibility />
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
