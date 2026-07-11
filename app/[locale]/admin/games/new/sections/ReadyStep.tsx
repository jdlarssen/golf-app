'use client';

/**
 * ReadyStep — wizard-only steg 5 «Klar?».
 *
 * Ansvar: viser et summary-kort av valgene (format + lagstørrelse,
 * bane + tee + tee-off, antall spillere + lag-fordeling), spillnavn med
 * inline-rediger, «Hvem kan melde seg på?»-valget i klartekst (#1065,
 * #367-mandatet), en sammenleggbar «Vis avanserte innstillinger»-disclosure
 * som mounter allowance-feltene (#1065, flyttet fra steg 2) + resten av
 * RegistrationSection (type påmelding + startkontingent) +
 * AdvancedSettingsSection med score-visibility + sideturnering, og
 * publish/draft-knappene.
 *
 * Filen lever som komponent, men er IKKE wired i GameForm. GameWizard
 * mounter den i wizard-stegtreet.
 */

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import type { AppLocale } from '@/i18n/routing';
import { formatTeeOffLineLocale } from '@/lib/i18n/format';
import type { GameFormMode } from '../GameForm';
import type { GameFormState } from '../useGameFormState';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AdvancedSettingsSection } from './AdvancedSettingsSection';
import { RegistrationSection } from './RegistrationSection';
import { TEAM_NUMBERS } from '../useGameFormState';
import { isStablefordFamily, type GameMode } from '@/lib/scoring/modes/types';
import type { TeamSize } from '../TeamSizeSelector';
import { AllowanceField } from '@/components/admin/AllowanceField';
import { bruttoHelperKeyFor } from '@/lib/games/allowanceCopy';

type Props = {
  state: GameFormState;
  mode: GameFormMode;
  /**
   * Kalles første gang admin redigerer navnet manuelt. Wizard-en setter
   * `nameTouched = true` slik at auto-name fra bane/tee-off ikke
   * overstyrer det redigerte navnet.
   */
  onNameTouched?: () => void;
  /**
   * #1065: hopper tilbake til steg 4 (Spillere). Brukt av «Gå tilbake»-lenken
   * under publish-knappen når `missingForPublish` har et spiller-relatert
   * mangel-punkt — steg-4-gaten er nå permissiv (tomt roster er alltid
   * gyldig for å komme videre), så admin trenger en eksplisitt vei tilbake
   * hvis registreringsvalget de tar her på steg 5 (invite_only) likevel
   * krever en spillerliste de ikke fylte ut.
   */
  onGoToPlayersStep?: () => void;
};

export function ReadyStep({
  state,
  mode,
  onNameTouched,
  onGoToPlayersStep,
}: Props) {
  const t = useTranslations('wizard.ready');
  const tWizard = useTranslations('wizard');
  const tAllowance = useTranslations('allowance');
  const locale = useLocale() as AppLocale;
  const {
    name,
    setName,
    canPublish,
    missingForPublish,
    missingForPublishCodes,
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
    isFlorida,
    isRoundRobin,
    isShamble,
    isSolo,
    isClubScoped,
    hcpAllowance,
    setHcpAllowance,
    texasHandicapPct,
    setTexasHandicapPct,
    ambroseHandicapPct,
    setAmbroseHandicapPct,
    floridaHandicapPct,
    setFloridaHandicapPct,
    fourballAllowancePct,
    setFourballAllowancePct,
    foursomesAllowancePct,
    setFoursomesAllowancePct,
    greensomeAllowancePct,
    setGreensomeAllowancePct,
    chapmanAllowancePct,
    setChapmanAllowancePct,
    gruesomeAllowancePct,
    setGruesomeAllowancePct,
    roundRobinAllowancePct,
    setRoundRobinAllowancePct,
  } = state;
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [nameEditing, setNameEditing] = useState(false);

  const selectedTeeBox = availableTees.find((tee) => tee.id === teeBoxId) ?? null;

  function teamSizeLabel(size: TeamSize): string {
    if (size === 1) return t('teamSizeSolo');
    if (size === 2) return t('teamSize2');
    if (size === 3) return t('teamSize3');
    return t('teamSize4');
  }

  // Lag-fordeling-summary per modus. Spec-en ber om kort prosa:
  //   «4 lag à 2 spillere» / «2 lag à 4 spillere» / «1 v 1» / «N spillere».
  function teamsSummary(): string {
    const count = selectedPlayerIds.length;
    const playerWord = count === 1 ? t('playersSolo', { count }) : t('playersPlural', { count });
    if (isSolo) {
      return playerWord;
    }
    if (isMatchplay) {
      const side1 = selectedPlayerIds.filter(
        (pid) => state.teamByPlayer[pid] === 1,
      ).length;
      const side2 = selectedPlayerIds.filter(
        (pid) => state.teamByPlayer[pid] === 2,
      ).length;
      return side1 === 1 && side2 === 1 ? t('players1v1') : t('playersUnassignedMatchplay');
    }
    const teamsCount = TEAM_NUMBERS.filter(
      (team) => playersByTeam[team].length > 0,
    ).length;
    if (teamsCount === 0) {
      const base = count === 1 ? t('playersSolo', { count }) : t('playersPlural', { count });
      return t('playersUnassigned', { playerWord: base });
    }
    if (isBestBall) {
      return t('teamsBestBall', { teams: teamsCount });
    }
    if (isParStableford) {
      return t('teamsParStableford', { teams: teamsCount });
    }
    if (isTexas || isAmbrose || isShamble) {
      return t('teamsScramble', { teams: teamsCount, size: teamSize });
    }
    return count === 1 ? t('playersSolo', { count }) : t('playersPlural', { count });
  }

  // Locale-aware tee-off display. Returns the 'Ikke satt' fallback when null.
  function teeOffDisplay(): string {
    const result = formatTeeOffLineLocale(scheduledTeeOffAt, locale);
    if (result === null) return t('notSet');
    return result;
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

  // MODE_SUMMARY_LABELS — deliberately different wording from lib's MODE_LABELS.
  // Look up via catalog key so values are locale-aware.
  function modeSummaryLabel(gm: GameMode): string {
    return t(`modeSummary.${gm}` as Parameters<typeof t>[0]);
  }

  // #1065: klassifiser via de locale-uavhengige kodene (parallell liste til
  // missingForPublish, samme lengde/rekkefølge), aldri via oversatt display-
  // tekst — tekst-matching brakk i engelsk locale. 'course'/'tee_box'/
  // 'tee_off' hører til steg 3 (egen gate der), 'allowance' hører til steg 5
  // (feltene bor i disclosuren rett over denne knappen), kun 'players' peker
  // tilbake til steg 4.
  const hasPlayerRelatedMiss = missingForPublishCodes.includes('players');

  // #1171: verdi-preview på publiser-knappen — «Publiser — N spillere ·
  // <format> · <bane>». Vises kun når nok er valgt (roster ≥ 1 OG bane),
  // ellers faller den pent tilbake til den nøytrale labelen. All data finnes
  // allerede i steg-5-scope; ingen ny komponent. `modeSummaryLabel` er samme
  // locale-aware format-tekst summary-kortet over bruker.
  const publishLabel =
    selectedPlayerIds.length >= 1 && selectedCourse
      ? t('publishButtonWithSummary', {
          count: selectedPlayerIds.length,
          mode: modeSummaryLabel(gameMode),
          course: selectedCourse.name,
        })
      : t('publishButton');

  return (
    <section className="space-y-4">
      {/* Summary-kort — viser alle valg i rad-format. Hver rad har muted
          label til venstre og verdi til høyre. Verdien faller tilbake til
          «Ikke valgt»/«Ikke satt» når feltet er tomt. */}
      <div className="space-y-1.5 rounded-lg border border-border bg-surface-2 p-3">
        <SummaryRow
          label={t('formatLabel')}
          value={`${modeSummaryLabel(gameMode)} · ${teamSizeLabel(teamSize)}`}
        />
        <SummaryRow
          label={t('courseLabel')}
          value={selectedCourse?.name ?? t('notSelected')}
        />
        <SummaryRow
          label={t('teeLabel')}
          value={selectedTeeBox?.name ?? t('notSelected')}
        />
        <SummaryRow label={t('teeOffLabel')} value={teeOffDisplay()} />
        <SummaryRow label={t('playersLabel')} value={teamsSummary()} />
      </div>

      {/* Spillnavn — klikk-for-å-redigere over summary. Skjult input
          serialiserer fortsatt verdien via samme `name`-felt som GameForm
          bruker. */}
      <div className="space-y-1.5">
        <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          {t('gameNameLegend')}
        </span>
        {nameEditing ? (
          <Input
            id="name"
            name="name"
            type="text"
            label={t('gameNameLabel')}
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
            {name || <span className="italic text-muted">{t('gameNamePlaceholder')}</span>}
          </button>
        )}
        {!nameEditing && (
          <input type="hidden" name="name" value={name} />
        )}
      </div>

      {/* #1065: «Hvem kan melde seg på?»-valget i klartekst — IKKE gjemt i
          «Vis avanserte innstillinger»-disclosuren (#367-mandatet: valget
          skal alltid være synlig). Skjules for klubb-spill (isClubScoped):
          medlemskap = invitasjon, modus er låst og valget er irrelevant der
          — speiler samme `hideModeChoice`-gate RegistrationSection alltid
          har hatt. Type påmelding (solo/lag) + startkontingent ligger i
          disclosuren under, siden de er sjeldnere overstyrt. */}
      {!isClubScoped && (
        <RegistrationSection state={state} onlyModeChoice />
      )}

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
          <span>{t('advancedToggle')}</span>
          <span aria-hidden="true" className="text-muted">
            {advancedOpen ? '–' : '+'}
          </span>
        </button>
        {advancedOpen && (
          <div className="border-t border-border px-3 py-3 space-y-4">
            {/* #1065: allowance-feltene flyttet hit fra steg 2 — gode
                defaults (85/50/100 % osv.) gjør at kompis-caset aldri
                trenger å røre dem. `hideHiddenInput`: FormDataInputs (montert
                på alle steg) speiler verdien uansett disclosure-tilstand. */}
            {gameMode === 'fourball_matchplay' && (
              <AllowanceField
                fieldName="fourball_allowance_pct"
                defaultPct={85}
                legend={tWizard('allowanceProps.fourball.legend')}
                description={tWizard('allowanceProps.fourball.description')}
                nettoHelperText={tWizard('allowanceProps.fourball.nettoHelper')}
                bruttoHelperText={tWizard('allowanceProps.fourball.bruttoHelper')}
                value={fourballAllowancePct}
                onChange={setFourballAllowancePct}
                hideHiddenInput
              />
            )}
            {gameMode === 'foursomes_matchplay' && (
              <AllowanceField
                fieldName="foursomes_allowance_pct"
                defaultPct={50}
                legend={tWizard('allowanceProps.foursomes.legend')}
                description={tWizard('allowanceProps.foursomes.description')}
                nettoHelperText={tWizard('allowanceProps.foursomes.nettoHelper')}
                bruttoHelperText={tWizard('allowanceProps.foursomes.bruttoHelper')}
                value={foursomesAllowancePct}
                onChange={setFoursomesAllowancePct}
                hideHiddenInput
              />
            )}
            {gameMode === 'greensome_matchplay' && (
              <AllowanceField
                fieldName="greensome_allowance_pct"
                defaultPct={100}
                legend={tWizard('allowanceProps.greensome.legend')}
                description={tWizard('allowanceProps.greensome.description')}
                nettoHelperText={tWizard('allowanceProps.greensome.nettoHelper')}
                bruttoHelperText={tWizard('allowanceProps.greensome.bruttoHelper')}
                value={greensomeAllowancePct}
                onChange={setGreensomeAllowancePct}
                hideHiddenInput
              />
            )}
            {gameMode === 'chapman_matchplay' && (
              <AllowanceField
                fieldName="chapman_allowance_pct"
                defaultPct={100}
                legend={tWizard('allowanceProps.chapman.legend')}
                description={tWizard('allowanceProps.chapman.description')}
                nettoHelperText={tWizard('allowanceProps.chapman.nettoHelper')}
                bruttoHelperText={tWizard('allowanceProps.chapman.bruttoHelper')}
                value={chapmanAllowancePct}
                onChange={setChapmanAllowancePct}
                hideHiddenInput
              />
            )}
            {gameMode === 'gruesome_matchplay' && (
              <AllowanceField
                fieldName="gruesome_allowance_pct"
                defaultPct={50}
                legend={tWizard('allowanceProps.gruesome.legend')}
                description={tWizard('allowanceProps.gruesome.description')}
                nettoHelperText={tWizard('allowanceProps.gruesome.nettoHelper')}
                bruttoHelperText={tWizard('allowanceProps.gruesome.bruttoHelper')}
                value={gruesomeAllowancePct}
                onChange={setGruesomeAllowancePct}
                hideHiddenInput
              />
            )}
            {isRoundRobin && (
              <AllowanceField
                fieldName="round_robin_allowance_pct"
                defaultPct={85}
                legend={tWizard('allowanceProps.roundRobin.legend')}
                description={tWizard('allowanceProps.roundRobin.description')}
                nettoHelperText={tWizard('allowanceProps.roundRobin.nettoHelper')}
                bruttoHelperText={tWizard('allowanceProps.roundRobin.bruttoHelper')}
                value={roundRobinAllowancePct}
                onChange={setRoundRobinAllowancePct}
                hideHiddenInput
              />
            )}
            {(gameMode === 'best_ball' ||
              isStablefordFamily(gameMode) ||
              gameMode === 'singles_matchplay' ||
              gameMode === 'solo_strokeplay') && (
              <AllowanceField
                fieldName="hcp_allowance_pct"
                defaultPct={100}
                legend={tWizard('allowanceProps.scoring.legend')}
                description={tWizard('allowanceProps.scoring.description')}
                nettoHelperText={tWizard('allowanceProps.scoring.nettoHelper')}
                bruttoHelperText={tAllowance(bruttoHelperKeyFor(gameMode))}
                value={hcpAllowance}
                onChange={setHcpAllowance}
                hideHiddenInput
              />
            )}
            {isTexas && (
              <AllowanceField
                key={teamSize}
                fieldName="texas_team_handicap_pct"
                defaultPct={texasHandicapPct}
                legend={tWizard('allowanceProps.texas.legend')}
                description={tWizard('allowanceProps.texas.description')}
                nettoHelperText={
                  teamSize === 2
                    ? tWizard('allowanceProps.texas.nettoHelper2')
                    : tWizard('allowanceProps.texas.nettoHelper4')
                }
                bruttoHelperText={tWizard('allowanceProps.texas.bruttoHelper')}
                inputLabel={tWizard('allowanceProps.texas.inputLabel')}
                value={texasHandicapPct}
                onChange={setTexasHandicapPct}
                hideHiddenInput
              />
            )}
            {/* Ambrose (#284): lag-handicap per standard Ambrose-formel.
                `key={teamSize}` forser remount ved lagstørrelse-bytte. */}
            {isAmbrose && (
              <AllowanceField
                key={teamSize}
                fieldName="ambrose_team_handicap_pct"
                defaultPct={ambroseHandicapPct}
                legend={tWizard('allowanceProps.ambrose.legend')}
                description={tWizard('allowanceProps.ambrose.description')}
                nettoHelperText={
                  teamSize === 2
                    ? tWizard('allowanceProps.ambrose.nettoHelper2')
                    : tWizard('allowanceProps.ambrose.nettoHelper4')
                }
                bruttoHelperText={tWizard('allowanceProps.ambrose.bruttoHelper')}
                inputLabel={tWizard('allowanceProps.ambrose.inputLabel')}
                value={ambroseHandicapPct}
                onChange={setAmbroseHandicapPct}
                hideHiddenInput
              />
            )}
            {/* Florida Scramble (#283): lag-handicap per NGF-fasttabell.
                `key={teamSize}` forser remount ved lagstørrelse-bytte. */}
            {isFlorida && (
              <AllowanceField
                key={teamSize}
                fieldName="florida_team_handicap_pct"
                defaultPct={floridaHandicapPct}
                legend={tWizard('allowanceProps.florida.legend')}
                description={tWizard('allowanceProps.florida.description')}
                nettoHelperText={
                  teamSize === 3
                    ? tWizard('allowanceProps.florida.nettoHelper3')
                    : tWizard('allowanceProps.florida.nettoHelper4')
                }
                bruttoHelperText={tWizard('allowanceProps.florida.bruttoHelper')}
                inputLabel={tWizard('allowanceProps.florida.inputLabel')}
                value={floridaHandicapPct}
                onChange={setFloridaHandicapPct}
                hideHiddenInput
              />
            )}

            {/* #1065: type påmelding (solo/lag/begge) + startkontingent —
                flyttet hit fra steg 2. «Hvem kan melde seg på?» rendres i
                klartekst over disclosuren (onlyModeChoice), så her vises
                resten via hideModeChoice. */}
            <RegistrationSection state={state} hideHeading hideModeChoice />

            <AdvancedSettingsSection
              state={state}
              includeVisibility
              hideHeading
              serializedExternally
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
            {publishLabel}
          </Button>
          {!canPublish && missingForPublish.length > 0 && (
            <p
              id="publish-missing"
              className="text-xs text-muted text-center"
            >
              {t('missingPrefix', { items: missingForPublish.join(', ') })}
              {/* #1065: steg-4-gaten er nå permissiv (tomt roster kommer
                  alltid videre) — hvis admin senere velger invite_only her
                  på steg 5 og mangler en gyldig spillerliste, gir vi en
                  eksplisitt vei tilbake i stedet for å la admin lete etter
                  «Forrige»-knappen selv. `hasPlayerRelatedMiss` leser den
                  locale-uavhengige kode-listen (kun 'players'-koden peker
                  til steg 4 — course/tee/tee-off hører til steg 3 og
                  allowance til disclosuren her på steg 5). */}
              {onGoToPlayersStep && hasPlayerRelatedMiss && (
                <>
                  {' '}
                  <button
                    type="button"
                    onClick={onGoToPlayersStep}
                    className="underline underline-offset-2 hover:text-text"
                  >
                    {t('missingGoToPlayers')}
                  </button>
                </>
              )}
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
            {t('draftButton')}
          </Button>
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
