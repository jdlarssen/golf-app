'use client';

/**
 * ReadyStep — wizard-only steg 5 «Klar?».
 *
 * #2282: arrangøren ser invitasjonen slik gjengen får den — et lite
 * invitasjonskort med spillnavnet som felt midt i kortet — og en sjekkliste
 * med fire rader (Bane, Format, Tee-off, Spillere), hver med status og
 * «Endre». Spillere-raden sier hvordan spillerne kommer (valget står på steg
 * 4, #2447). Under lista står INNSTILLINGER (#2457): Handicap, Startkontingent,
 * Under runden og Sideturnering og premier som korte rader med verdien som er
 * satt; «Endre» åpner et bunn-ark med bare den radens felt (ReadySettings).
 * Type påmelding («Hva melder man på?») står på steg 4.
 * Publiser og utkast står i et brett som følger bunnen av skjermen.
 *
 * Sjekklista er en projeksjon av publiser-gaten i useGameFormState
 * (`readyChecklist`); knappen styres fortsatt bare av `canPublish`.
 *
 * Filen lever som komponent, men er IKKE wired i GameForm. GameWizard
 * mounter den i wizard-stegtreet.
 */

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { useTranslations, useLocale } from 'next-intl';
import type { AppLocale } from '@/i18n/routing';
import type { GameFormMode } from '../GameForm';
import type { CreateGameResult } from '../actions';
import type { GameFormState } from '../useGameFormState';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import type { GameMode } from '@/lib/scoring/modes/types';
import { invitationWhen } from '@/lib/games/invitationCard';
import { InvitationPreviewCard } from './InvitationPreviewCard';
import { ReadyChecklist, type ReadyChecklistItem } from './ReadyChecklist';
import { ReadySettings } from './ReadySettings';
import type { ReadySettingsKey } from './readySettingsRules';
import {
  formatRowParts,
  playersRowParts,
  playersSummary,
  readyChecklist,
  sourceKeyFor,
  teeOffIso,
  type ReadyRowTarget,
} from './readyChecklistRules';

/** «Ingen feil»-formen; delt så useActionState-initen er referanse-stabil. */
const NO_ERROR: CreateGameResult = { error: '' };

/**
 * Server-svaret pluss en stempel-teller. Publiser og «Lagre som utkast» har
 * hver sin useActionState, og uten en felles teller vet ikke banneret hvilket
 * av de to svarene som er det ferskeste.
 */
type SubmitState = CreateGameResult & { seq: number };
const NO_SUBMIT: SubmitState = { error: '', seq: 0 };

type Props = {
  state: GameFormState;
  mode: GameFormMode;
  /**
   * #2282: «Endre» i sjekklista hopper til steget valget bor på (Format → 2,
   * Bane/Tee-off → 3, Spillere → 4). GameWizard sender `goToStep`, som pusher
   * URL-en, så Tilbake i nettleseren gir steg 5 igjen.
   */
  onGoToStep?: (step: 2 | 3 | 4) => void;
  /**
   * #1400: kalles idet et publiser-/utkast-forsøk sendes manuelt (se
   * `dispatchManually`), så veiviseren får samme «submit startet»-hook som
   * form-ens onSubmit gir på den native stien (utkast-tømming i GameWizard).
   */
  onSubmitStart?: () => void;
};

export function ReadyStep({ state, mode, onGoToStep, onSubmitStart }: Props) {
  const t = useTranslations('wizard.ready');
  const tWizard = useTranslations('wizard');
  const locale = useLocale() as AppLocale;
  const {
    name,
    setName,
    canPublish,
    guestOnly,
    pendingProfileCount,
    missingForPublish,
    missingForPublishCodes,
    teeOffInPast,
    intent,
    expectedPlayerCount,
    lockGameMode,
    gameMode,
    teamSize,
    selectedCourse,
    teeBoxId,
    availableTees,
    scheduledTeeOffAt,
    teeOffNow,
    selectedPlayerIds,
    playersByTeam,
    requiresTeams,
    isBestBall,
    isParStableford,
    isMatchplay,
    isTexas,
    isAmbrose,
    isShamble,
    isSolo,
    isClubScoped,
    registrationMode,
  } = state;
  const [openSheet, setOpenSheet] = useState<ReadySettingsKey | null>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  const selectedTeeBox = availableTees.find((tee) => tee.id === teeBoxId) ?? null;
  const when = invitationWhen(teeOffIso(scheduledTeeOffAt), locale);

  // MODE_SUMMARY_LABELS — deliberately different wording from lib's MODE_LABELS.
  // Look up via catalog key so values are locale-aware.
  function modeSummaryLabel(gm: GameMode): string {
    return t(`modeSummary.${gm}` as Parameters<typeof t>[0]);
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

  // #1379: publiser/utkast går gjennom useActionState i stedet for en rå
  // server-action, slik at en serverfeil returneres som state til en fortsatt
  // montert veiviser — i stedet for en redirect som monterte den på nytt og
  // slettet alt arrangøren hadde fylt ut. Samme mønster som CreateLigaForm.
  // Hookene kalles ubetinget (resolveActions kan gi null for edit-scheduled),
  // så guarden ligger inne i closuren.
  // Stempel-teller delt av begge hookene: hvert svar som kommer i mål får et
  // høyere tall enn det forrige, så banneret kan vise det ferskeste. Uten den
  // låste en publiser-feil banneret for godt — et påfølgende utkast-forsøk
  // som feilet med en ANNEN kode viste fortsatt publiser-teksten.
  // #1398: `isPending` er tredje element fra useActionState. Uten den sto
  // knappen helt uendret mens forsøket kjørte — arrangøren på steg 5 fikk
  // ingen kvittering på at noe skjedde, og kunne trykke om igjen.
  const resultSeq = useRef(0);
  const [publishResult, publishAction, publishPending] = useActionState(
    async (_prev: SubmitState, formData: FormData): Promise<SubmitState> => {
      // edit-draft-actionene returnerer void og redirecter selv ved feil —
      // normaliser til «ingen feil» så state-formen er lik for begge modi.
      const result = (await actions?.publish(formData)) ?? NO_ERROR;
      return { ...result, seq: ++resultSeq.current };
    },
    NO_SUBMIT,
  );
  const [draftResult, draftAction, draftPending] = useActionState(
    async (_prev: SubmitState, formData: FormData): Promise<SubmitState> => {
      const result = (await actions?.draft(formData)) ?? NO_ERROR;
      return { ...result, seq: ++resultSeq.current };
    },
    NO_SUBMIT,
  );

  // #1400 (samme figur som #1397/CupSetup og #1475/CreateLigaForm): en
  // `formAction`-dispatch lar react-dom kjøre `requestFormReset` på formen —
  // også controlled radioer/checkboxer får DOM-`checked` satt tilbake til
  // `defaultChecked`, og React tegner dem ikke opp igjen fordi prop-en ikke
  // endret seg. Skjermen sier «Live» mens det skjulte feltet fortsatt sender
  // «reveal». preventDefault + manuell dispatch i en transition hopper over
  // auto-reset-en. `formAction` på knappene beholdes som React-standard
  // form-kobling (useActionState-closuren er klient-kode, så dette er IKKE
  // en progressive-enhancement-sti før hydrering). Constraint-validering
  // kjøres eksplisitt for publiser (native sti ville gjort det); utkast har
  // `formNoValidate` og hopper over.
  function dispatchManually(
    e: React.MouseEvent<HTMLButtonElement>,
    action: (formData: FormData) => void,
    validate: boolean,
  ) {
    const form = e.currentTarget.form;
    if (!form) return; // ingen form (SSR-fallback) → la native sti ta det
    if (validate && !form.reportValidity()) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    onSubmitStart?.();
    const formData = new FormData(form);
    startTransition(() => action(formData));
  }

  // Kode → melding. Samme oppslags-figur som opprett-sidenes ?error=-banner,
  // men med eksplisitt fallback i stedet for stille ingenting: en ukjent kode
  // skal aldri gi tom skjerm.
  const submitErrorCode =
    draftResult.seq > publishResult.seq ? draftResult.error : publishResult.error;
  const submitErrorMessage = (() => {
    if (!submitErrorCode) return null;
    const key = `errors.${submitErrorCode}` as Parameters<typeof tWizard>[0];
    return tWizard.has(key)
      ? tWizard(key)
      : tWizard('errors.unexpected', { code: submitErrorCode });
  })();

  // ── Sjekklista ──────────────────────────────────────────────────────
  // En passert tee-off står bevisst utenfor missingForPublish (den er ugyldig,
  // ikke manglende). Den får egen melding her og i linja under knappen, så den
  // grå knappen aldri står uten forklaring.
  const teeOffPastMessage = teeOffInPast
    ? tWizard('sections.basics.teeOffPastError')
    : null;
  const rows = readyChecklist({
    codes: missingForPublishCodes,
    messages: missingForPublish,
    teeOffPastMessage,
    intent,
    expectedPlayerCount,
    selectedCount: selectedPlayerIds.length,
    lockGameMode,
    gameMode,
    guestOnly,
  });

  function playersValue(): string {
    const summary = playersSummary({
      count: selectedPlayerIds.length,
      isSolo,
      isMatchplay,
      requiresTeams,
      side1: selectedPlayerIds.filter((pid) => state.teamByPlayer[pid] === 1).length,
      side2: selectedPlayerIds.filter((pid) => state.teamByPlayer[pid] === 2).length,
      teamsCount: Object.values(playersByTeam).filter((members) => members.length > 0).length,
      isBestBall,
      isParStableford,
      isScramble: isTexas || isAmbrose || isShamble,
      teamSize,
      fullTeamsCount: Object.values(playersByTeam).filter((m) => m.length === teamSize).length,
      shortTeamsCount: Object.values(playersByTeam).filter(
        (m) => m.length > 0 && m.length === teamSize - 1,
      ).length,
      shortTeamAllowed: state.teamSizesAllowed.has(teamSize - 1),
    });
    return t(summary.key, summary.values);
  }

  function formatValue(): string {
    const parts = formatRowParts({ teamSize });
    const out = [modeSummaryLabel(gameMode)];
    if (parts.teamSize === 2) out.push(t('teamSize2'));
    else if (parts.teamSize === 3) out.push(t('teamSize3'));
    else if (parts.teamSize !== null) out.push(t('teamSize4'));
    return out.join(', ');
  }

  function okValue(key: ReadyChecklistItem['key']): string {
    if (key === 'course') {
      return [
        selectedCourse?.name,
        selectedTeeBox && t('card.tee', { name: selectedTeeBox.name }),
      ]
        .filter(Boolean)
        .join(', ');
    }
    if (key === 'format') return formatValue();
    // #2463: «Nå» has no time yet; the server sets it when you publish.
    if (key === 'teeOff') return teeOffNow ? t('teeOffNow') : when ? t('checklist.teeOff', when) : '';
    return playersValue();
  }

  const LABEL: Record<ReadyChecklistItem['key'], string> = {
    course: t('courseLabel'),
    format: t('formatLabel'),
    teeOff: t('teeOffLabel'),
    players: t('playersLabel'),
  };

  // #2441: a friend who has not finished their profile does not stop the
  // publish (the round waits at the start), but the players row says so. A
  // `warn` value is already a whole sentence, so the note goes first there.
  const pendingNote =
    pendingProfileCount > 0
      ? t('checklist.pendingProfiles', { count: pendingProfileCount })
      : null;
  const PART_SEPARATOR = ' · ';
  // #2447: how the players come was chosen at the top of step 4; a club
  // tournament has no such choice.
  const playersSource = isClubScoped
    ? null
    : t(`checklist.source.${sourceKeyFor(registrationMode)}`);

  // #2570: the gate's «Mangler» fragment for a round with only guests. The row
  // says the whole guest sentence instead, after any other missing player.
  const accountPlayerMessage = tWizard('form.missing.accountPlayer');

  const checklistItems: ReadyChecklistItem[] = rows.map((row) => {
    let value: string;
    if (row.guestsOnly) {
      const missing = row.messages.filter((m) => m !== accountPlayerMessage);
      value = [
        // A full stop ends the «Mangler: …» part before the guest sentence.
        missing.length > 0 ? `${t('missingPrefix', { items: missing.join(', ') })}.` : null,
        t('checklist.playersGuestsOnly'),
      ]
        .filter(Boolean)
        .join(' ');
    } else if (row.status === 'block') {
      // «Mangler: …» for det som mangler; den passerte tee-offen står med sin
      // egen setning.
      const missing = row.messages.filter((m) => m !== teeOffPastMessage);
      value = [
        missing.length > 0 ? t('missingPrefix', { items: missing.join(', ') }) : null,
        row.messages.includes(teeOffPastMessage ?? '') ? teeOffPastMessage : null,
      ]
        .filter(Boolean)
        .join(' ');
    } else {
      value =
        row.status === 'warn'
          ? t('checklist.playersWarn', {
              selected: selectedPlayerIds.length,
              expected: expectedPlayerCount ?? 0,
            })
          : okValue(row.key);
      if (row.key === 'players') {
        value = playersRowParts({
          status: row.status === 'warn' ? 'warn' : 'ok',
          selectedCount: selectedPlayerIds.length,
          value,
          pendingNote,
          source: playersSource,
        }).join(PART_SEPARATOR);
      }
    }
    return { ...row, label: LABEL[row.key], value };
  });

  // «Endre» på Format med en ugyldig prosent åpner Handicap-arket og setter
  // fokus i prosentfeltet. useModalFocus flytter fokuset til første element i
  // arket når det åpnes (effekten i BottomSheet, et barn av denne), så fokuset
  // i feltet må settes etter den: effekten her kjører etter barnas.
  const focusPercentOnOpen = useRef(false);
  useEffect(() => {
    if (openSheet !== 'handicap' || !focusPercentOnOpen.current) return;
    focusPercentOnOpen.current = false;
    settingsRef.current?.querySelector<HTMLInputElement>('input[id$="__input"]')?.focus();
  }, [openSheet]);

  function handleEdit(target: Exclude<ReadyRowTarget, null>) {
    if (target !== 'handicap') {
      onGoToStep?.(target);
      return;
    }
    focusPercentOnOpen.current = true;
    setOpenSheet('handicap');
  }

  // Enter i et tekstfelt sender skjemaet via første submit-knapp, og det er
  // publiser. Arrangøren som trykker Enter i navnet, beløpet eller en premie
  // skal ikke publisere spillet. Knapper og tekstområder beholder Enter.
  function handleKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    if (e.target instanceof HTMLInputElement) e.preventDefault();
  }

  // #1384: «Lagre som utkast» krever et navn — brukt både til disabled-gaten
  // og til hint-linja som forklarer hvorfor knappen er grå.
  const nameMissing = name.trim() === '';
  const showPublishMissing = !canPublish && (missingForPublish.length > 0 || teeOffInPast);

  return (
    // Flex-kolonne på minst skjermhøyden, så brettet (mt-auto) står nederst
    // også når steget er kortere enn skjermen.
    <section className="flex min-h-svh flex-col" onKeyDown={handleKeyDown}>
      <div className="pb-[18px]">
        <InvitationPreviewCard
          name={name}
          onNameChange={setName}
          when={when}
          whenNow={teeOffNow}
          courseName={selectedCourse?.name ?? null}
          teeName={selectedTeeBox?.name ?? null}
          formatName={modeSummaryLabel(gameMode)}
        />

        <ReadyChecklist items={checklistItems} onEdit={handleEdit} />

        <div ref={settingsRef}>
          <ReadySettings state={state} openKey={openSheet} onOpenChange={setOpenSheet} />
        </div>
      </div>

      {/* Publiser + utkast i et brett som følger bunnen av skjermen. `sticky`,
          ikke `fixed`: høyden varierer med linja «Mangler: …», utkast-hintet og
          feilbanneret, og en sticky rad står i flyten, så ingenting havner bak
          den. `-mx-4` når skjermkantene (kolonnen har alt tatt 4 px av
          AppShells 20), og den negative bunnmarginen opphever AppShells
          bunn-padding, så brettet står mot kanten også rullet helt ned.
          Bunnmenyen er skjult på veiviser-rutene. `data-sticky-tray` gir
          siden bunn-padding for fokus-rulling (app/globals.css), så et felt
          tastaturet hopper til aldri havner bak brettet. */}
      {actions && (
        <div data-sticky-tray className="sticky bottom-0 z-20 -mx-4 mt-auto -mb-[calc(5rem+env(safe-area-inset-bottom,0px))] flex flex-col gap-1.5 border-t border-border bg-bg px-4 pt-3 pb-[calc(20px+env(safe-area-inset-bottom,0px))]">
          {/* #1379: serverfeilen står rett over knappen som utløste den —
              veiviseren er fortsatt montert, så alt arrangøren fylte ut er
              der. testId så e2e slipper å låse norsk copy. */}
          {submitErrorMessage && (
            <Banner tone="error" testId="wizard-submit-error">
              {submitErrorMessage}
            </Banner>
          )}
          {/* #1398: mens ett forsøk kjører er BEGGE knappene ute av spill —
              publisering og utkast-lagring på samme skjema samtidig gir to
              spill av samme runde. Button setter selv disabled + aria-busy
              når `pending`. */}
          <Button
            type="submit"
            size="xl"
            data-testid="wizard-publish"
            formAction={publishAction}
            onClick={(e) => dispatchManually(e, publishAction, true)}
            className="w-full"
            pending={publishPending}
            pendingLabel={t('publishPending')}
            disabled={!canPublish || draftPending}
            aria-describedby={showPublishMissing ? 'publish-missing' : undefined}
          >
            {t('publishButton')}
          </Button>
          {showPublishMissing && (
            <p
              id="publish-missing"
              // 8 px under the button, as -5-mangler draws it (the tray's gap is 6).
              className="mt-0.5 text-center font-sans text-[13px] leading-[normal] font-semibold text-warning-text"
            >
              {[
                missingForPublish.length > 0
                  ? t('missingPrefix', { items: missingForPublish.join(', ') })
                  : null,
                teeOffPastMessage,
              ]
                .filter(Boolean)
                .join(' ')}
            </p>
          )}
          {/* #1384: utkast-knappen krever et spillnavn. Uten hint-linja så
              knappen bare død ut for arrangøren som ville lagre tidlig. */}
          <Button
            type="submit"
            size="chip"
            variant="quiet"
            formAction={draftAction}
            onClick={(e) => dispatchManually(e, draftAction, false)}
            formNoValidate
            className="w-full leading-[normal]"
            pending={draftPending}
            pendingLabel={t('draftPending')}
            disabled={nameMissing || publishPending}
            aria-describedby={nameMissing ? 'draft-missing-name' : undefined}
          >
            {t('draftButton')}
          </Button>
          {nameMissing && (
            <p
              id="draft-missing-name"
              className="text-center font-sans text-xs leading-[normal] text-muted"
            >
              {t('draftMissingName')}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
