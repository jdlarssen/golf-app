'use client';

/**
 * GameWizard — 4-stegs hurtig-oppsett av nye spill, med escape-hatch til
 * full-form for power-users.
 *
 * Orchestrert som:
 *   Steg 1 (Format)   → ModeSelector + TeamSizeSelector
 *   Steg 2 (Bane)     → BasicsSection minus spillnavn + advanced
 *   Steg 3 (Spillere) → PlayersSection + TeamsAssignmentSection inline
 *   Steg 4 (Klar)     → ReadyStep (summary + avanserte + publish/draft)
 *
 * URL-state: `?step=2..4` og `?view=full`. Browser back fra steg N tilbake
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
import { ModeSelector } from './ModeSelector';
import { TeamSizeSelector } from './TeamSizeSelector';
import { useGameFormState } from './useGameFormState';
import { BasicsSection } from './sections/BasicsSection';
import { PlayersSection } from './sections/PlayersSection';
import { TeamsAssignmentSection } from './sections/TeamsAssignmentSection';
import { ReadyStep } from './sections/ReadyStep';
import { RegistrationSection } from './sections/RegistrationSection';
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

type Step = 1 | 2 | 3 | 4;

type Props = {
  courses: CourseOption[];
  players: PlayerOption[];
  mode: GameFormMode;
  initialValues?: InitialValues;
};

const STEP_TITLES: Record<Step, string> = {
  1: 'Format',
  2: 'Bane og tidspunkt',
  3: 'Spillere',
  4: 'Klar?',
};

function parseStepFromSearch(sp: URLSearchParams): Step {
  const raw = sp.get('step');
  if (raw === '2') return 2;
  if (raw === '3') return 3;
  if (raw === '4') return 4;
  return 1;
}

function parseViewFromSearch(sp: URLSearchParams): 'wizard' | 'full' {
  return sp.get('view') === 'full' ? 'full' : 'wizard';
}

export function GameWizard({ courses, players, mode, initialValues }: Props) {
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

  const state = useGameFormState({ initialValues, players, courses });

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

  // Steg-spesifikk sub-tekst under stepper-headeren. Mode-aware for steg 3
  // siden lag/sider/flighter varierer per modus.
  const subText = useMemo<string | null>(() => {
    if (step === 1) return 'Hva skal dere spille i dag?';
    if (step === 2) return 'Hvor og når?';
    if (step === 3) {
      if (state.isSolo) return 'Hvem skal spille?';
      if (state.isBestBall)
        return 'Velg 8 spillere, så fordeler du lag og flights';
      if (state.isMatchplay)
        return 'Velg 2 spillere og sett én på hver side';
      if (state.isParStableford)
        return 'Velg minst 2 spillere fordelt to og to på lag';
      if (state.isTexas)
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
    state.teamSize,
  ]);

  // Neste-knappen gates per steg. Mangel-tekst under knappen henter første
  // element fra missingForPublish (mode-aware).
  function canAdvance(): boolean {
    if (step === 1) return true;
    if (step === 2) return state.courseId !== '' && state.teeBoxId !== '';
    // Steg 3: vanligvis krever vi en gyldig spiller-fordeling per modus.
    // #199: når selv-påmelding er på (open / manual_approval) er spiller-
    // listen valgfri — admin kan publisere et tomt spill og la spillerne
    // melde seg på via lenken.
    if (step === 3) return state.playersStepOptional || state.playersValidForMode;
    return false; // steg 4 har ikke neste-knapp
  }

  function nextDisabledHint(): string | null {
    if (step === 2) {
      if (state.courseId === '') return 'Velg bane først';
      if (state.teeBoxId === '') return 'Velg tee-boks';
    }
    if (step === 3) {
      // playersValidForMode false → ta første mangel fra liste-en. Filtrer
      // bort bane/tee-off-mangler siden de håndteres i steg 2.
      const relevant = state.missingForPublish.filter(
        (m) => m !== 'bane' && m !== 'tee-boks' && m !== 'tee-off-tid',
      );
      if (relevant.length > 0) return `Mangler: ${relevant[0]}`;
    }
    return null;
  }

  function goNext() {
    setStep((s) => (Math.min(4, s + 1) as Step));
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
  // View === 'wizard': stepper-header + steg-spesifikk content + footer.
  // Wrappet i <form> så ReadyStep sine publish/draft-knapper (som er
  // `type="submit"` med `formAction`) finner en form å sende til.
  // ────────────────────────────────────────────────────────────────────
  return (
    <form className="space-y-6">
      <StepperHeader step={step} title={STEP_TITLES[step]} subText={subText} />

      {step === 1 && (
        <section className="space-y-6">
          <div className="space-y-4">
            <ModeSelector
              value={state.gameMode}
              onChange={state.handleModeChange}
              disabled={state.lockGameMode}
            />
            {!state.isMatchplay && (
              <TeamSizeSelector
                mode={state.gameMode}
                value={state.teamSize}
                onChange={state.handleTeamSizeChange}
                disabled={state.lockGameMode}
              />
            )}
            {state.lockGameMode && (
              <p className="text-xs text-muted">
                <strong>Kan ikke endres etter spill-start.</strong>
              </p>
            )}
            {/* Fourball matchplay (#217): netto/brutto-toggle med pre-fyll fra
                cup-radens fourball_allowance_pct hvis admin lander via cup-link.
                Controlled-modus — verdien lever i `useGameFormState` så den
                persisterer når admin navigerer mellom wizard-steg. Selve
                hidden input-en rendres sentralt i `FormDataInputs` slik at
                payload-en når server-action uansett hvilket steg admin
                publiserer fra. Andre modi skjuler toggle-en helt — andre
                modi-validatorer leser ikke feltet. */}
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
            {/* Non-fourball / non-texas allowance-toggle (#266). Skriver til
                games.hcp_allowance_pct. Default 100 (fullt course handicap).
                Hidden input rendres sentralt i `FormDataInputs` (linje
                ~469) — toggle-en eier kun UI + state. */}
            {(state.gameMode === 'best_ball' ||
              state.gameMode === 'stableford' ||
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
            {/* Texas scramble (#266): toggle på lag-handicap (mode_config.
                team_handicap_pct). Default per team-size; key={teamSize} for
                remount så toggle-state re-initialiseres ved team-size-bytte.
                Sentral hidden input texas_team_handicap_pct + hidden
                hcp_allowance_pct=100 rendres i `FormDataInputs`. */}
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
          </div>
          <RegistrationSection state={state} hideHeading />
        </section>
      )}

      {step === 2 && (
        <BasicsSection
          state={state}
          courses={courses}
          showName={false}
          showAdvancedInline={false}
        />
      )}

      {step === 3 && (
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

      {step === 4 && (
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

      {/* Wizard-footer: «Forrige»/«Neste» på steg 1-3, kun «Forrige» på
          steg 4 (publish/draft-knappene lever inne i ReadyStep). */}
      <WizardFooter
        step={step}
        canAdvance={canAdvance()}
        disabledHint={nextDisabledHint()}
        onPrev={goPrev}
        onNext={goNext}
        showNext={step < 4}
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
    texasHandicapPct,
    fourballAllowancePct,
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
      {gameMode === 'stableford' && (
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
}: {
  step: Step;
  title: string;
  subText: string | null;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted tabular-nums">Steg {step} av 4</span>
        <span className="font-serif text-lg text-text">{title}</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full bg-primary transition-[width] duration-200 motion-reduce:transition-none"
          style={{ width: `${(step / 4) * 100}%` }}
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
