'use client';

/**
 * GameWizard — 5-stegs hurtig-oppsett av nye spill (F2 #272), med escape-
 * hatch til full-form for power-users.
 *
 * Orchestrert som:
 *   Steg 1 (Arrangement) → IntentSelector (Kompis/Klubb/Cup/Solo)
 *   Steg 2 (Format)      → FormatGrid (Kompis/Klubb/Solo) eller CupSetup
 *                          (Cup, kort-circuit til 2-step cup-creation-flyt)
 *   Steg 3 (Bane)        → BasicsSection minus spillnavn + advanced
 *   Steg 4 (Spillere)    → PlayersSection + TeamsAssignmentSection inline
 *   Steg 5 (Klar)        → ReadyStep (summary + avanserte + publish/draft)
 *
 * URL-state: `?step=2..5` og `?view=full`. Browser back fra steg N tilbake
 * til N-1; back fra steg 1 går ut av wizard-en.
 *
 * `view='full'` bytter til en sticky tilbake-lenke + standard GameForm med
 * wizard-state pre-fylt som initialValues. Uncontrolled-felter
 * (score_visibility, side_ld_count, etc.) passeres uendret fra
 * `initialValues` — endringer i wizard sin advanced-disclosure propagerer
 * ikke til full-form (det er en kjent edge case, se kontrakt #203).
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import type { Intent } from '@/lib/wizard/intent';
import type {
  FormatForIntent,
  CupEligibleFormat,
} from '@/lib/formats/getFormatsForIntent';
import { isStablefordFamily, MODE_LABELS, type GameMode } from '@/lib/scoring/modes/types';
import { IntentSelector } from './IntentSelector';
import { FormatGrid } from './FormatGrid';
import { CupSetup } from './CupSetup';
import { SideTournamentsBanner } from './SideTournamentsBanner';
import { TeamSizeSelector } from './TeamSizeSelector';
import { useGameFormState } from './useGameFormState';
import { BasicsSection } from './sections/BasicsSection';
import { PlayersSection } from './sections/PlayersSection';
import { TeamsAssignmentSection } from './sections/TeamsAssignmentSection';
import { ReadyStep } from './sections/ReadyStep';
import { RegistrationSection } from './sections/RegistrationSection';
import { WolfSetup } from './sections/WolfSetup';
import { NassauSetup } from './sections/NassauSetup';
import { SkinsSetup } from './sections/SkinsSetup';
import { NinesSetup } from './sections/NinesSetup';
import { ShambleSetup } from './sections/ShambleSetup';
import { AllowanceField } from '@/components/admin/AllowanceField';
import { bruttoHelperFor } from '@/lib/games/allowanceCopy';
import {
  GameForm,
  type CourseOption,
  type PlayerOption,
  type GameFormMode,
  type InitialValues,
} from './GameForm';
import { suggestGameName } from '@/lib/games/autoGameName';

type Step = 1 | 2 | 3 | 4 | 5;

type Props = {
  courses: CourseOption[];
  players: PlayerOption[];
  mode: GameFormMode;
  initialValues?: InitialValues;
  // F2 (#272): cup-link og direkte URL kan pre-velge intent. Driver
  // step-1-IntentSelector og påfølgende step-2-render-grening (FormatGrid vs
  // CupSetup).
  initialIntent?: Intent;
  // Format-katalog forhåndshentet i page.tsx (server-component) for hver av
  // de tre ikke-cup-intents. Step 2 leser denne basert på state.intent.
  formatsByIntent: Record<'kompis' | 'klubb' | 'solo', FormatForIntent[]>;
  // Cup-eligible formats brukt av CupSetup-multi-select. Også forhåndshentet.
  cupEligibleFormats: CupEligibleFormat[];
};

const STEP_TITLES: Record<Step, string> = {
  1: 'Arrangement',
  2: 'Format',
  3: 'Bane og tidspunkt',
  4: 'Spillere',
  5: 'Klar?',
};

const TOTAL_STEPS = 5;

function parseStepFromSearch(sp: URLSearchParams): Step {
  const raw = sp.get('step');
  if (raw === '2') return 2;
  if (raw === '3') return 3;
  if (raw === '4') return 4;
  if (raw === '5') return 5;
  return 1;
}

function parseViewFromSearch(sp: URLSearchParams): 'wizard' | 'full' {
  return sp.get('view') === 'full' ? 'full' : 'wizard';
}

export function GameWizard({
  courses,
  players,
  mode,
  initialValues,
  initialIntent,
  formatsByIntent,
  cupEligibleFormats,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Initial step + view leses fra URL ved mount. Senere browser-nav (back/
  // forward) reconcileres via useEffect under.
  const [step, setStep] = useState<Step>(() =>
    parseStepFromSearch(new URLSearchParams(searchParams.toString())),
  );
  const [view, setView] = useState<'wizard' | 'full'>(() =>
    parseViewFromSearch(new URLSearchParams(searchParams.toString())),
  );

  // Auto-name: hvis admin skrev navn manuelt, slutter wizard-en å overstyre
  // det. Edit-flow med initialValues.name pre-touches.
  const [nameTouched, setNameTouched] = useState<boolean>(
    !!initialValues?.name && initialValues.name.trim() !== '',
  );

  const state = useGameFormState({ initialValues, players, courses, initialIntent });

  // Når bruker går fram/tilbake via browser, oppdateres `searchParams`. Vi
  // reconciler lokal state til URL — men kun når URL-strengen faktisk er
  // endret. Dependency på `searchParams.toString()` (ikke selve objektet)
  // unngår at en ny URLSearchParams-instans per render trigger reconciliation
  // (relevant både i prod hvor useSearchParams kan returnere nytt objekt
  // per render, og i test der vitest-mocken gir frisk instans hver gang).
  const searchParamsString = searchParams.toString();
  useEffect(() => {
    const sp = new URLSearchParams(searchParamsString);
    const urlStep = parseStepFromSearch(sp);
    const urlView = parseViewFromSearch(sp);
    // setState inne i en effect ER nødvendig her: vi synker EKSTERN tilstand
    // (URL fra browser-back/forward-nav) inn til React-state. React 19 sin
    // strenge linter advarer mot pattern-en generelt — for vårt URL-sync-
    // tilfelle er den korrekt, så vi disabler regelen lokalt.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (urlStep !== step) setStep(urlStep);
    if (urlView !== view) setView(urlView);
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParamsString]);

  // Speil step+view til URL. Bruker router.replace så history-stacken får
  // én entry per steg-overgang (browser back fungerer som forventet).
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (step === 1) params.delete('step');
    else params.set('step', String(step));
    if (view === 'wizard') params.delete('view');
    else params.set('view', 'full');
    const qs = params.toString();
    const nextUrl = qs ? `${pathname}?${qs}` : pathname;
    // Bare push hvis URL faktisk endres — unngår onødvendige history-entries.
    const currentQs = searchParams.toString();
    const currentUrl = currentQs ? `${pathname}?${currentQs}` : pathname;
    if (nextUrl !== currentUrl) {
      router.replace(nextUrl, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, view]);

  // Auto-name: når bane/tee-off endres OG admin ikke har redigert navnet
  // manuelt, oppdaterer vi forslaget. `state.selectedCourse.name` kan være
  // undefined før admin har valgt bane — `suggestGameName` returnerer da
  // tom streng, og vi unngår å overstyre eksisterende navn med tom.
  useEffect(() => {
    if (nameTouched) return;
    const suggested = suggestGameName({
      courseName: state.selectedCourse?.name ?? null,
      scheduledTeeOffAt: state.scheduledTeeOffAt,
    });
    if (suggested && suggested !== state.name) {
      state.setName(suggested);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.selectedCourse?.name, state.scheduledTeeOffAt, nameTouched]);

  // Steg-spesifikk sub-tekst under stepper-headeren. Mode-aware for steg 4
  // siden lag/sider/flighter varierer per modus.
  const subText = useMemo<string | null>(() => {
    if (step === 1) return 'Hva slags arrangement?';
    if (step === 2) return 'Hva skal dere spille?';
    if (step === 3) return 'Hvor og når?';
    if (step === 4) {
      if (state.isSolo) return 'Hvem skal spille?';
      if (state.isBestBall)
        return 'Velg 8 spillere, så fordeler du lag og flights';
      if (state.isMatchplay)
        return 'Velg 2 spillere og sett én på hver side';
      if (state.isParStableford)
        return 'Velg minst 2 spillere fordelt to og to på lag';
      if (state.isTexas)
        return `Velg minst ${state.teamSize} spillere, så fordeler du lag`;
      if (state.isShamble)
        return `Velg minst ${state.teamSize} spillere, så fordeler du lag`;
      return null;
    }
    return null;
  }, [
    step,
    state.isSolo,
    state.isBestBall,
    state.isMatchplay,
    state.isParStableford,
    state.isTexas,
    state.isShamble,
    state.teamSize,
  ]);

  // Cup-creation-flyt diverger fra standard wizard: bare step 1 (intent) og
  // step 2 (CupSetup-form). CupSetup eier sin egen `<form action=...>`
  // submission, så vi rendrer ingen ytter-`<form>` rundt wizard-en når
  // intent='cup' uten knyttet tournament. Når admin lander via cup-link
  // (tournament_id satt), kjører de regulær wizard-flyt med locked format.
  const tournamentIdFromInitial = initialValues?.tournament_id;
  const isNewCupFlow =
    state.intent === 'cup' && !tournamentIdFromInitial;

  // Neste-knappen gates per steg. Mangel-tekst under knappen henter første
  // element fra missingForPublish (mode-aware).
  function canAdvance(): boolean {
    if (step === 1) return state.intent !== undefined;
    if (step === 2) {
      // Cup-creation-flyt har ingen «Neste» — CupSetup self-submitter.
      if (isNewCupFlow) return false;
      // For øvrige intents må format være valgt (klikket et kort i
      // FormatGrid eller låst inn via cup-link/edit) før vi kan gå videre.
      return state.formatChosen;
    }
    if (step === 3) return state.courseId !== '' && state.teeBoxId !== '';
    // Steg 4: vanligvis krever vi en gyldig spiller-fordeling per modus.
    // #199: når selv-påmelding er på (open / manual_approval) er spiller-
    // listen valgfri — admin kan publisere et tomt spill og la spillerne
    // melde seg på via lenken.
    if (step === 4) return state.playersStepOptional || state.playersValidForMode;
    return false; // steg 5 har ikke neste-knapp
  }

  function nextDisabledHint(): string | null {
    if (step === 1 && state.intent === undefined) {
      return 'Velg hva slags arrangement først';
    }
    if (step === 2 && !isNewCupFlow && !state.formatChosen) {
      return 'Velg spillform først';
    }
    if (step === 3) {
      if (state.courseId === '') return 'Velg bane først';
      if (state.teeBoxId === '') return 'Velg tee-boks';
    }
    if (step === 4) {
      // playersValidForMode false → ta første mangel fra liste-en. Filtrer
      // bort bane/tee-off-mangler siden de håndteres i steg 3.
      const relevant = state.missingForPublish.filter(
        (m) => m !== 'bane' && m !== 'tee-boks' && m !== 'tee-off-tid',
      );
      if (relevant.length > 0) return `Mangler: ${relevant[0]}`;
    }
    return null;
  }

  function goNext() {
    setStep((s) => (Math.min(TOTAL_STEPS, s + 1) as Step));
  }

  function goPrev() {
    setStep((s) => (Math.max(1, s - 1) as Step));
  }

  // ────────────────────────────────────────────────────────────────────
  // View === 'full': mount GameForm med wizard-state som initialValues.
  // Uncontrolled-felter (score_visibility, side_ld_count, side_ctp_count,
  // side_disabled_categories) passeres uendret fra opprinnelig
  // initialValues — endringer i wizard sin advanced-disclosure går tapt
  // ved bytte til full-form. Se kontrakt #203 «Edge cases».
  // ────────────────────────────────────────────────────────────────────
  if (view === 'full') {
    const passthrough: InitialValues = {
      ...(initialValues ?? {}),
      name: state.name,
      course_id: state.courseId,
      tee_box_id: state.teeBoxId,
      scheduled_tee_off_at: state.scheduledTeeOffAt,
      hcp_allowance_pct: String(state.hcpAllowance),
      require_peer_approval: state.requirePeerApproval,
      side_tournament_enabled: state.sideEnabled,
      player_genders: state.playerGenders,
      players: state.orderedPayload.map((row) => ({
        user_id: row.user_id,
        team_number: row.team_number,
        flight_number: row.flight_number,
      })),
      game_mode: state.gameMode,
      team_size: state.teamSize,
      texas_team_handicap_pct: String(state.texasHandicapPct),
      fourball_allowance_pct: state.fourballAllowancePct,
      foursomes_allowance_pct: state.foursomesAllowancePct,
      wolf_scoring: state.wolfScoring,
      nassau_scoring: state.nassauScoring,
      skins_scoring: state.skinsScoring,
      nines_variant: state.ninesVariant,
      nines_scoring: state.ninesScoring,
      shamble_variant: state.shambleVariant,
      shamble_count: state.shambleCount,
      shamble_scoring: state.shambleScoring,
      tournament_id: initialValues?.tournament_id,
      tournament_match_label: initialValues?.tournament_match_label,
      registration_mode: state.registrationMode,
      registration_type: state.registrationType,
    };
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setView('wizard')}
          className="block text-sm text-muted underline underline-offset-2 hover:text-text"
        >
          ← Tilbake til hurtig-oppsett
        </button>
        <GameForm
          courses={courses}
          players={players}
          mode={mode}
          initialValues={passthrough}
        />
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────
  // Cup-creation-flyt: bare step 1 (intent) → step 2 (CupSetup). CupSetup
  // eier sin egen `<form action=createTournamentDraft>` så vi rendrer ingen
  // ytter-form rundt wizard-en — nestede form-elementer er ugyldig HTML.
  // Når intent='cup' med tournament_id satt (cup-link for å legge til
  // match i eksisterende cup) går vi i stedet videre til standard wizard
  // for game-creation, med format låst via lockGameMode.
  // ────────────────────────────────────────────────────────────────────
  if (isNewCupFlow) {
    return (
      <div className="space-y-6">
        <StepperHeader
          step={step}
          title={STEP_TITLES[step]}
          subText={subText}
          totalSteps={2}
        />

        {step === 1 && (
          <IntentSelector
            value={state.intent}
            onChange={state.setIntent}
            disabled={state.lockGameMode}
          />
        )}

        {step === 2 && (
          <section className="space-y-6">
            <CupSetup cupEligibleFormats={cupEligibleFormats} />
            <SideTournamentsBanner />
          </section>
        )}

        <WizardFooter
          step={step}
          canAdvance={canAdvance()}
          disabledHint={nextDisabledHint()}
          onPrev={goPrev}
          onNext={goNext}
          showNext={step < 2}
        />
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────
  // Standard 5-step wizard. Wrappet i <form> så ReadyStep sine publish/
  // draft-knapper (som er `type="submit"` med `formAction`) finner en
  // form å sende til.
  // ────────────────────────────────────────────────────────────────────
  return (
    <form className="space-y-6">
      <StepperHeader
        step={step}
        title={STEP_TITLES[step]}
        subText={subText}
        totalSteps={TOTAL_STEPS}
      />

      {step === 1 && (
        <IntentSelector
          value={state.intent}
          onChange={state.setIntent}
          disabled={state.lockGameMode}
        />
      )}

      {step === 2 && (
        <section className="space-y-6">
          {/* Format-velger. Locked-flow (cup-link + lockGameMode) hopper
              over selve grid-en og viser en banner med valgt format. */}
          {state.lockGameMode ? (
            <div className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
              <p>
                <strong>Format:</strong>{' '}
                {MODE_LABELS[state.gameMode] ?? state.gameMode}.{' '}
                Kan ikke endres etter spill-start.
              </p>
            </div>
          ) : state.intent === 'cup' ? null : (
            <FormatGrid
              formats={
                state.intent
                  ? (formatsByIntent[state.intent] ?? [])
                  : []
              }
              value={state.formatChosen ? state.gameMode : undefined}
              onChange={(slug) => state.handleModeChange(slug as GameMode)}
              disabled={state.lockGameMode}
            />
          )}

          {state.formatChosen && (
            <div className="space-y-4">
              {!state.isMatchplay && !state.isWolf && !state.isNassau && !state.isSkins && !state.isNines && !state.isShamble && (
                <TeamSizeSelector
                  mode={state.gameMode}
                  value={state.teamSize}
                  onChange={state.handleTeamSizeChange}
                  disabled={state.lockGameMode}
                />
              )}
              {state.isWolf && (
                <WolfSetup
                  scoring={state.wolfScoring}
                  onScoringChange={state.setWolfScoring}
                  wolfOrder={state.wolfOrder
                    .map((pid) => players.find((p) => p.id === pid))
                    .filter((p): p is PlayerOption => p !== undefined)}
                  onShuffle={state.shuffleWolfOrder}
                  disabled={state.lockGameMode}
                />
              )}
              {state.isNassau && (
                <NassauSetup
                  scoring={state.nassauScoring}
                  onScoringChange={state.setNassauScoring}
                  disabled={state.lockGameMode}
                />
              )}
              {state.isSkins && (
                <SkinsSetup
                  scoring={state.skinsScoring}
                  onScoringChange={state.setSkinsScoring}
                  disabled={state.lockGameMode}
                />
              )}
              {state.isNines && (
                <NinesSetup
                  variant={state.ninesVariant}
                  onVariantChange={state.setNinesVariant}
                  scoring={state.ninesScoring}
                  onScoringChange={state.setNinesScoring}
                  disabled={state.lockGameMode}
                />
              )}
              {state.isShamble && (
                <ShambleSetup
                  variant={state.shambleVariant}
                  onVariantChange={state.setShambleVariant}
                  count={state.shambleCount}
                  onCountChange={state.setShambleCount}
                  scoring={state.shambleScoring}
                  onScoringChange={state.setShambleScoring}
                  teamSize={state.teamSize as 3 | 4}
                  onTeamSizeChange={state.handleTeamSizeChange as (next: 3 | 4) => void}
                  disabled={state.lockGameMode}
                />
              )}
              {state.gameMode === 'fourball_matchplay' && (
                <AllowanceField
                  fieldName="fourball_allowance_pct"
                  defaultPct={85}
                  legend="Scoring for fourball-matches"
                  description="Styrer handicap for fourball-matches. Netto bruker en andel av hver spillers handicap, brutto teller laveste gross per hull per side."
                  nettoHelperText="Andel av hver spillers handicap som teller. WHS-standard for four-ball matchplay er 85."
                  bruttoHelperText="Ingen handicap — laveste gross-score per hull per side vinner. Vanlig format på ekte Ryder Cup."
                  value={state.fourballAllowancePct}
                  onChange={state.setFourballAllowancePct}
                  hideHiddenInput
                />
              )}
              {state.gameMode === 'foursomes_matchplay' && (
                <AllowanceField
                  fieldName="foursomes_allowance_pct"
                  defaultPct={50}
                  legend="Scoring for foursomes-matches"
                  description="Styrer handicap for foursomes-matches (alternate shot). Netto gir høyeste lag en andel av differansen i lagenes summerte handicap; brutto teller bare lagets gross-slag."
                  nettoHelperText="Andel av differansen i lagenes summerte handicap. WHS-standard for foursomes matchplay er 50."
                  bruttoHelperText="Ingen handicap — lagets gross-score per hull avgjør, ingen extra strokes."
                  value={state.foursomesAllowancePct}
                  onChange={state.setFoursomesAllowancePct}
                  hideHiddenInput
                />
              )}
              {(state.gameMode === 'best_ball' ||
                isStablefordFamily(state.gameMode) ||
                state.gameMode === 'singles_matchplay' ||
                state.gameMode === 'solo_strokeplay') && (
                <AllowanceField
                  fieldName="hcp_allowance_pct"
                  defaultPct={100}
                  legend="Scoring"
                  description="Styrer hvor stor andel av handicap som regnes med. Brutto = ingen handicap, kun gross."
                  nettoHelperText="Andel av spillerens handicap som teller. 100 = fullt course handicap (standard)."
                  bruttoHelperText={bruttoHelperFor(state.gameMode)}
                  value={state.hcpAllowance}
                  onChange={state.setHcpAllowance}
                  hideHiddenInput
                />
              )}
              {state.isTexas && (
                <AllowanceField
                  key={state.teamSize}
                  fieldName="texas_team_handicap_pct"
                  defaultPct={state.texasHandicapPct}
                  legend="Lag-handicap"
                  description="Styrer hvor stor andel av summen av lag-medlemmenes spille-HCP som teller som effektivt lag-handicap. Brutto = laveste lag-gross per hull vinner."
                  nettoHelperText={
                    state.teamSize === 2
                      ? 'NGF-standard: 25 % av summen av spillernes spille-HCP for 2-mannslag.'
                      : 'NGF-standard: 10 % av summen av spillernes spille-HCP for 4-mannslag.'
                  }
                  bruttoHelperText="Ingen lag-handicap — laveste gross-score per hull per lag vinner. Scratch-format."
                  inputLabel="Lag-handicap (%)"
                  value={state.texasHandicapPct}
                  onChange={state.setTexasHandicapPct}
                  hideHiddenInput
                />
              )}
              <RegistrationSection state={state} hideHeading />
            </div>
          )}

          <SideTournamentsBanner />
        </section>
      )}

      {step === 3 && (
        <BasicsSection
          state={state}
          courses={courses}
          showName={false}
          showAdvancedInline={false}
        />
      )}

      {step === 4 && (
        <div className="space-y-6">
          {state.playersStepOptional && (
            <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
              Du kan også la spillerne melde seg på selv. Lenken får du etter at
              spillet er opprettet.
            </p>
          )}
          <PlayersSection state={state} players={players} heading="Spillere" />
          {/* TeamsAssignmentSection er self-gating per modus — den rendrer
              kun de relevante under-blokkene (matchplay-sider / lag-grid /
              flights / per-spiller-tee) basert på state-flags. */}
          <TeamsAssignmentSection
            state={state}
            players={players}
            hideNumbering
          />
        </div>
      )}

      {step === 5 && (
        <ReadyStep
          state={state}
          mode={mode}
          onOpenFullForm={() => setView('full')}
          onNameTouched={() => setNameTouched(true)}
        />
      )}

      {/* Hidden inputs for FormData — speiler ALL state slik at server-
          actions mottar samme payload uavhengig av hvilket steg admin
          publiserer fra. Form-en wrappes rundt stegene + skjult-input-
          blokken; submit-knappene lever inne i ReadyStep og treffer
          denne form-en via formAction-prop. */}
      <FormDataInputs
        state={state}
        tournamentId={initialValues?.tournament_id}
        tournamentMatchLabel={initialValues?.tournament_match_label}
      />

      {/* Wizard-footer: «Forrige»/«Neste» på steg 1-4, kun «Forrige» på
          steg 5 (publish/draft-knappene lever inne i ReadyStep). */}
      <WizardFooter
        step={step}
        canAdvance={canAdvance()}
        disabledHint={nextDisabledHint()}
        onPrev={goPrev}
        onNext={goNext}
        showNext={step < TOTAL_STEPS}
      />
    </form>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Hidden inputs som bærer FormData-payloaden. Wizard-en er én form (alle
// stegene + ReadyStep ligger inne i samme <form>), så hidden inputs lever
// på alle steg — admin kan publisere fra steg 4 uten å miste tidligere
// valg. Skjemaet speiler GameForm.tsx (linje 197–241).
// ──────────────────────────────────────────────────────────────────────

function FormDataInputs({
  state,
  tournamentId,
  tournamentMatchLabel,
}: {
  state: ReturnType<typeof useGameFormState>;
  tournamentId?: string;
  tournamentMatchLabel?: string;
}) {
  const {
    name,
    gameMode,
    teamSize,
    isTexas,
    isShamble,
    isWolf,
    isNassau,
    isSkins,
    isNines,
    texasHandicapPct,
    fourballAllowancePct,
    foursomesAllowancePct,
    wolfScoring,
    nassauScoring,
    skinsScoring,
    ninesVariant,
    ninesScoring,
    shambleVariant,
    shambleCount,
    shambleScoring,
    orderedPayload,
    courseId,
    teeBoxId,
    scheduledTeeOffAt,
    hcpAllowance,
    requirePeerApproval,
    playerGenders,
    selectedPlayerIds,
    registrationMode,
    registrationType,
  } = state;

  // Alle controlled state-verdier serialiseres som hidden inputs UANSETT
  // hvilket steg som er montert. Når en seksjons-komponent (f.eks.
  // BasicsSection) også rendrer et felt med samme `name`, gir det to
  // inputs i form-en — men siden begge speiler samme controlled state,
  // er verdiene identiske og FormData.get returnerer riktig svar uansett
  // rekkefølge. Dette gir et enkelt mental-modell: server-action mottar
  // FULL state uavhengig av hvilket steg admin publiserer fra.
  //
  // Uncontrolled-felter (score_visibility-radios, side_ld_count/ctp_count,
  // side_disabled_categories) håndteres ikke her — de er kun synlige inne
  // i ReadyStep sin advanced-disclosure. Hvis admin ikke åpner den, treffer
  // server-action sin default-fallback (score_visibility=live, etc.).
  return (
    <>
      <input type="hidden" name="game_mode" value={gameMode} />
      <input type="hidden" name="team_size" value={teamSize} />
      <input type="hidden" name="registration_mode" value={registrationMode} />
      <input type="hidden" name="registration_type" value={registrationType} />
      {isStablefordFamily(gameMode) && (
        <input type="hidden" name="stableford_team_size" value={teamSize} />
      )}
      {isTexas && (
        <>
          <input type="hidden" name="texas_team_size" value={teamSize} />
          <input
            type="hidden"
            name="texas_team_handicap_pct"
            value={String(texasHandicapPct)}
          />
        </>
      )}
      {gameMode === 'fourball_matchplay' && (
        <input
          type="hidden"
          name="fourball_allowance_pct"
          value={String(fourballAllowancePct)}
        />
      )}
      {gameMode === 'foursomes_matchplay' && (
        <input
          type="hidden"
          name="foursomes_allowance_pct"
          value={String(foursomesAllowancePct)}
        />
      )}
      {isWolf && (
        <input type="hidden" name="wolf_scoring" value={wolfScoring} />
      )}
      {isNassau && (
        <input type="hidden" name="nassau_scoring" value={nassauScoring} />
      )}
      {isSkins && (
        <input type="hidden" name="skins_scoring" value={skinsScoring} />
      )}
      {isNines && (
        <>
          <input type="hidden" name="nines_variant" value={ninesVariant} />
          <input type="hidden" name="nines_scoring" value={ninesScoring} />
        </>
      )}
      {isShamble && (
        <>
          <input type="hidden" name="shamble_variant" value={shambleVariant} />
          <input type="hidden" name="shamble_count" value={String(shambleCount)} />
          <input type="hidden" name="shamble_scoring" value={shambleScoring} />
          <input type="hidden" name="shamble_team_size" value={String(teamSize)} />
        </>
      )}

      <input type="hidden" name="course_id" value={courseId} />
      <input type="hidden" name="tee_box_id" value={teeBoxId} />
      <input
        type="hidden"
        name="scheduled_tee_off_at"
        value={scheduledTeeOffAt}
      />

      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="hcp_allowance_pct" value={String(hcpAllowance)} />
      {requirePeerApproval && (
        <input type="hidden" name="require_peer_approval" value="on" />
      )}

      {selectedPlayerIds.map((pid) => (
        <input
          key={pid}
          type="hidden"
          name={`player_${pid}_gender`}
          value={playerGenders[pid] ?? 'M'}
        />
      ))}

      {tournamentId && (
        <>
          <input type="hidden" name="tournament_id" value={tournamentId} />
          {tournamentMatchLabel && (
            <input
              type="hidden"
              name="tournament_match_label"
              value={tournamentMatchLabel}
            />
          )}
        </>
      )}

      {orderedPayload.map((row, i) => (
        <div key={row.user_id} className="hidden">
          <input type="hidden" name={`player_${i}_id`} value={row.user_id} />
          <input
            type="hidden"
            name={`player_${i}_team`}
            value={row.team_number ?? ''}
          />
          <input
            type="hidden"
            name={`player_${i}_flight`}
            value={row.flight_number ?? ''}
          />
        </div>
      ))}
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Subtil tekst-stepper med en tynn progress-bar under. Forest-and-
// champagne-paletten via `--color-primary`. Reduced-motion-respekt på
// transition-en.
// ──────────────────────────────────────────────────────────────────────

function StepperHeader({
  step,
  title,
  subText,
  totalSteps,
}: {
  step: Step;
  title: string;
  subText: string | null;
  totalSteps: number;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted tabular-nums">
          Steg {step} av {totalSteps}
        </span>
        <span className="font-serif text-lg text-text">{title}</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full bg-primary transition-[width] duration-200 motion-reduce:transition-none"
          style={{ width: `${(step / totalSteps) * 100}%` }}
        />
      </div>
      {subText && <p className="text-xs text-muted">{subText}</p>}
    </div>
  );
}

function WizardFooter({
  step,
  canAdvance,
  disabledHint,
  onPrev,
  onNext,
  showNext,
}: {
  step: Step;
  canAdvance: boolean;
  disabledHint: string | null;
  onPrev: () => void;
  onNext: () => void;
  /** Skjul «Neste»-knappen på steg 4 (ReadyStep har publish-knappen). */
  showNext: boolean;
}) {
  return (
    <div className="space-y-2 pt-2">
      <div className="flex gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={onPrev}
          disabled={step === 1}
          className="flex-1"
        >
          Forrige
        </Button>
        {showNext && (
          <Button
            type="button"
            onClick={onNext}
            disabled={!canAdvance}
            className="flex-1"
          >
            Neste
          </Button>
        )}
      </div>
      {showNext && !canAdvance && disabledHint && (
        <p className="text-xs text-muted text-center">{disabledHint}</p>
      )}
    </div>
  );
}
