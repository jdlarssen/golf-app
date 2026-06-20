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

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter, usePathname, Link } from '@/i18n/navigation';
import { useLocale } from 'next-intl';
import { Button } from '@/components/ui/Button';
import type { Intent } from '@/lib/wizard/intent';
import { selectablePlayers } from '@/lib/wizard/selectablePlayers';
import type {
  FormatForIntent,
  CupEligibleFormat,
} from '@/lib/formats/getFormatsForIntent';
import { isStablefordFamily, type GameMode } from '@/lib/scoring/modes/types';
import { IntentSelector } from './IntentSelector';
import { FormatGrid } from './FormatGrid';
import { FormatGuideSheet } from '@/components/FormatGuideSheet';
import type { FormatGuideEntry } from '@/components/FormatGuideList';
import { CupSetup } from './CupSetup';
import { MAX_PERSONAL_CUP_MATCHES } from '@/lib/cup/limits';
import { SideTournamentsBanner } from './SideTournamentsBanner';
import { TeamSizeSelector } from './TeamSizeSelector';
import { useGameFormState, PLAYER_COUNT_DEFAULT } from './useGameFormState';
import { BasicsSection } from './sections/BasicsSection';
import { PlayersSection } from './sections/PlayersSection';
import { TeamsAssignmentSection } from './sections/TeamsAssignmentSection';
import { ReadyStep } from './sections/ReadyStep';
import { RegistrationSection } from './sections/RegistrationSection';
import { WolfSetup } from './sections/WolfSetup';
import { NassauSetup } from './sections/NassauSetup';
import { SkinsSetup } from './sections/SkinsSetup';
import { NinesSetup } from './sections/NinesSetup';
import { RoundRobinSetup } from './sections/RoundRobinSetup';
import { AceyDeuceySetup } from './sections/AceyDeuceySetup';
import { ShambleSetup } from './sections/ShambleSetup';
import { PatsomeSetup } from './sections/PatsomeSetup';
import { useTranslations } from 'next-intl';
import { AllowanceField } from '@/components/admin/AllowanceField';
import { bruttoHelperKeyFor } from '@/lib/games/allowanceCopy';
import {
  GameForm,
  type CourseOption,
  type PlayerOption,
  type GameFormMode,
  type InitialValues,
} from './GameForm';
import type { ClubOption } from '@/lib/games/newGameFormData';
import { suggestGameName } from '@/lib/games/autoGameName';
import { fitsPlayerCount } from '@/lib/wizard/fitsPlayerCount';

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
  // #442: klubber brukeren er medlem av — for «Hvem er dette for?»-velgeren.
  // Tom liste = velgeren vises ikke. Alltid trygt å sende tom liste.
  clubs?: ClubOption[];
  // #442: forhåndsvalgt klubb-id (fra ?klubb= search-param). Sendes videre
  // til useGameFormState som defaultGroupId.
  defaultGroupId?: string;
  /**
   * #464: ids til spillere som er venner av arrangøren. Picker-kilden for
   * kompis/cup-intent (og klubb uten valgt klubb) filtreres ned til disse +
   * deg selv. Tom liste = bare deg selv kan legges til (tom-tilstand viser
   * «Legg til venner»-lenke).
   */
  friendPlayerIds?: string[];
  /**
   * #464: clubId → medlemmenes user-ids. Picker-kilden for klubb-intent m/ valgt
   * klubb filtreres ned til den klubbens medlemmer. Tom = ingen klubbdata.
   */
  clubMemberIdsByClub?: Record<string, string[]>;
  /**
   * #464: innlogget brukers id. Alltid valgbar i ikke-solo-kontekster slik at
   * arrangøren kan legge til seg selv (du er ikke din egen venn/klubbmedlem).
   */
  currentUserId?: string;
  /**
   * #477: styrer om «Solo / Test»-arrangementet vises i IntentSelector. Kun
   * admin. Admin-flyten (`/admin/games/new`) sender true; den åpne `/opprett-
   * spill`-flyten sender brukerens faktiske admin-status.
   */
  isAdmin?: boolean;
  /**
   * #525: styrer om «Klubb-turnering» vises i IntentSelector for en ikke-admin.
   * True når brukeren er owner/admin i ≥1 klubb. `/opprett-spill` beregner det
   * via `isClubAdminAnywhere`; admin-flyten trenger det ikke (isAdmin dekker).
   */
  isClubAdmin?: boolean;
  /**
   * #498: format-oppslagsverket (server-bygget i page.tsx) som mater «?»-arket
   * på steg 2, så det kan rendre klient-side uten ekstra fetch. Tom = «?»-arket
   * viser ingenting (defensivt; arket åpnes likevel uten å feile).
   */
  formatGuide?: FormatGuideEntry[];
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
  clubs = [],
  defaultGroupId,
  friendPlayerIds = [],
  clubMemberIdsByClub = {},
  currentUserId = '',
  isAdmin = false,
  isClubAdmin = false,
  formatGuide = [],
}: Props) {
  const t = useTranslations('wizard');
  const tAllowance = useTranslations('allowance');
  const tModes = useTranslations('modes');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // #498: «?»-format-ark-state. focusKey = valgt format-slug når arket åpnes
  // fra «Slik funker det →»; undefined når det åpnes fra «?»-knappen (toppen).
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideFocusKey, setGuideFocusKey] = useState<string | undefined>(
    undefined,
  );
  const openGuide = (slug?: string) => {
    setGuideFocusKey(slug);
    setGuideOpen(true);
  };

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

  const state = useGameFormState({ initialValues, players, courses, initialIntent, defaultGroupId });

  // #464: picker-kilden følger konteksten (kompis/cup → venner, klubb m/ valgt
  // klubb → klubbmedlemmer, ellers venner, solo → uendret). Filtrerer innenfor
  // `players`-supersettet så intent kan byttes klient-side uten re-fetch.
  // TeamsAssignmentSection beholder full `players` (må slå opp allerede-valgte).
  const pickList = useMemo(
    () =>
      selectablePlayers({
        intent: state.intent,
        groupId: state.groupId,
        selfId: currentUserId,
        players,
        friendIds: new Set(friendPlayerIds),
        clubMemberIdsByClub: Object.fromEntries(
          Object.entries(clubMemberIdsByClub).map(([id, ids]) => [id, new Set(ids)]),
        ),
      }),
    [state.intent, state.groupId, currentUserId, players, friendPlayerIds, clubMemberIdsByClub],
  );
  // Id-settet brukes til å skjære ned PlayersSection sin valgbare liste; full
  // `players` beholdes der (chips/lag-oppslag på allerede-valgte).
  const pickIds = useMemo(() => new Set(pickList.map((p) => p.id)), [pickList]);
  const pickListOthers = pickList.filter((p) => p.id !== currentUserId).length;

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
      locale: locale as import('@/i18n/routing').AppLocale,
    });
    if (suggested && suggested !== state.name) {
      state.setName(suggested);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.selectedCourse?.name, state.scheduledTeeOffAt, nameTouched]);

  // Steg-spesifikk sub-tekst under stepper-headeren. Mode-aware for steg 4
  // siden lag/sider/flighter varierer per modus.
  const subText = useMemo<string | null>(() => {
    if (step === 1) return t('stepSubText.step1');
    if (step === 2) return t('stepSubText.step2');
    if (step === 3) return t('stepSubText.step3');
    if (step === 4) {
      if (state.isSolo) return t('stepSubText.step4Solo');
      if (state.isBestBall) return t('stepSubText.step4BestBall');
      if (state.isMatchplay) return t('stepSubText.step4Matchplay');
      if (state.isParStableford) return t('stepSubText.step4ParStableford');
      if (state.isTexas)
        return t('stepSubText.step4TeamSize', { teamSize: state.teamSize });
      if (state.isAmbrose)
        return t('stepSubText.step4TeamSize', { teamSize: state.teamSize });
      if (state.isShamble)
        return t('stepSubText.step4TeamSize', { teamSize: state.teamSize });
      if (state.isPatsome) return t('stepSubText.step4Patsome');
      return null;
    }
    return null;
  }, [
    t,
    step,
    state.isSolo,
    state.isBestBall,
    state.isMatchplay,
    state.isParStableford,
    state.isTexas,
    state.isAmbrose,
    state.isShamble,
    state.isPatsome,
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
      return t('disabledHint.step1NoIntent');
    }
    if (step === 2 && !isNewCupFlow && !state.formatChosen) {
      return t('disabledHint.step2NoFormat');
    }
    if (step === 3) {
      if (state.courseId === '') return t('disabledHint.step3NoCourse');
      if (state.teeBoxId === '') return t('disabledHint.step3NoTee');
    }
    if (step === 4) {
      // playersValidForMode false → ta første mangel fra liste-en. Filtrer
      // bort bane/tee-off-mangler siden de håndteres i steg 3.
      const relevant = state.missingForPublish.filter(
        (m) => m !== 'bane' && m !== 'tee-boks' && m !== 'tee-off-tid',
      );
      if (relevant.length > 0) return t('disabledHint.step4Prefix', { item: relevant[0] });
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
      ambrose_team_handicap_pct: String(state.ambroseHandicapPct),
      florida_team_handicap_pct: String(state.floridaHandicapPct),
      fourball_allowance_pct: state.fourballAllowancePct,
      foursomes_allowance_pct: state.foursomesAllowancePct,
      greensome_allowance_pct: state.greensomeAllowancePct,
      chapman_allowance_pct: state.chapmanAllowancePct,
      gruesome_allowance_pct: state.gruesomeAllowancePct,
      round_robin_allowance_pct: state.roundRobinAllowancePct,
      wolf_scoring: state.wolfScoring,
      nassau_scoring: state.nassauScoring,
      skins_scoring: state.skinsScoring,
      nines_variant: state.ninesVariant,
      nines_scoring: state.ninesScoring,
      acey_deucey_scoring: state.aceyDeuceyScoring,
      shamble_variant: state.shambleVariant,
      shamble_count: state.shambleCount,
      shamble_scoring: state.shambleScoring,
      patsome_scoring: state.patsomeScoring,
      tournament_id: initialValues?.tournament_id,
      tournament_match_label: initialValues?.tournament_match_label,
      registration_mode: state.registrationMode,
      registration_type: state.registrationType,
      let_friends_skip_gate: state.letFriendsSkipGate,
      group_id: state.groupId,
    };
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setView('wizard')}
          className="block text-sm text-muted underline underline-offset-2 hover:text-text"
        >
          {t('backToQuickSetup')}
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
          title={t(`steps.${step}` as Parameters<typeof t>[0])}
          subText={subText}
          totalSteps={2}
        />

        {step === 1 && (
          <IntentSelector
            value={state.intent}
            onChange={state.setIntent}
            disabled={state.lockGameMode}
            isAdmin={isAdmin}
            isClubAdmin={isClubAdmin}
          />
        )}

        {step === 2 && (
          <section className="space-y-6">
            <CupSetup
              cupEligibleFormats={cupEligibleFormats}
              matchCap={isAdmin ? undefined : MAX_PERSONAL_CUP_MATCHES}
            />
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
        title={t(`steps.${step}` as Parameters<typeof t>[0])}
        subText={subText}
        totalSteps={TOTAL_STEPS}
        action={
          step === 2 && state.intent !== 'cup' && !state.lockGameMode ? (
            <button
              type="button"
              onClick={() => openGuide()}
              aria-label={t('formatGuideAriaLabel')}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-sm font-semibold text-muted hover:bg-primary-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              ?
            </button>
          ) : undefined
        }
      />

      {step === 1 && (
        <IntentSelector
          value={state.intent}
          onChange={state.setIntent}
          disabled={state.lockGameMode}
          isAdmin={isAdmin}
          isClubAdmin={isClubAdmin}
        />
      )}

      {step === 2 && (
        <section className="space-y-6">
          {/* Format-velger. Locked-flow (cup-link + lockGameMode) hopper
              over selve grid-en og viser en banner med valgt format. */}
          {state.lockGameMode ? (
            <div className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
              <p>
                <strong>{t('formatLock.prefix')}</strong>{' '}
                {tModes(state.gameMode as Parameters<typeof tModes>[0])}.{' '}
                {t('formatLock.lockedNote')}
              </p>
            </div>
          ) : state.intent === 'cup' ? null : (
            <>
              {/* #373: teller for antall spillere — kun for Kompis-intent */}
              {state.intent === 'kompis' && (
                <PlayerCountPicker
                  value={state.expectedPlayerCount}
                  onChange={state.setExpectedPlayerCount}
                />
              )}
              <FormatGrid
                formats={
                  state.intent
                    ? (() => {
                        const all = formatsByIntent[state.intent] ?? [];
                        // #373: filtrer på antall spillere for Kompis
                        if (
                          state.intent === 'kompis' &&
                          state.expectedPlayerCount !== undefined
                        ) {
                          return all.filter((f) =>
                            fitsPlayerCount(
                              f.slug as GameMode,
                              state.expectedPlayerCount as number,
                            ),
                          );
                        }
                        return all;
                      })()
                    : []
                }
                value={state.formatChosen ? state.gameMode : undefined}
                onChange={(slug) => state.handleModeChange(slug as GameMode)}
                onShowGuide={(slug) => openGuide(slug)}
                disabled={state.lockGameMode}
              />
            </>
          )}

          {state.formatChosen && (
            <div className="space-y-4">
              {!state.isMatchplay && !state.isTeamMatchplay && !state.isWolf && !state.isNassau && !state.isSkins && !state.isBingoBangoBongo && !state.isNines && !state.isRoundRobin && !state.isAceyDeucey && !state.isShamble && !state.isPatsome && (
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
              {state.isRoundRobin && (
                <RoundRobinSetup
                  roundRobinOrder={state.roundRobinOrder
                    .map((pid) => players.find((p) => p.id === pid))
                    .filter((p): p is NonNullable<typeof p> => p !== undefined)}
                  disabled={state.lockGameMode}
                />
              )}
              {state.isAceyDeucey && (
                <AceyDeuceySetup
                  scoring={state.aceyDeuceyScoring}
                  onScoringChange={state.setAceyDeuceyScoring}
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
              {state.isPatsome && (
                <PatsomeSetup
                  scoring={state.patsomeScoring}
                  onScoringChange={state.setPatsomeScoring}
                  disabled={state.lockGameMode}
                />
              )}
              {state.gameMode === 'fourball_matchplay' && (
                <AllowanceField
                  fieldName="fourball_allowance_pct"
                  defaultPct={85}
                  legend={t('allowanceProps.fourball.legend')}
                  description={t('allowanceProps.fourball.description')}
                  nettoHelperText={t('allowanceProps.fourball.nettoHelper')}
                  bruttoHelperText={t('allowanceProps.fourball.bruttoHelper')}
                  value={state.fourballAllowancePct}
                  onChange={state.setFourballAllowancePct}
                  hideHiddenInput
                />
              )}
              {state.gameMode === 'foursomes_matchplay' && (
                <AllowanceField
                  fieldName="foursomes_allowance_pct"
                  defaultPct={50}
                  legend={t('allowanceProps.foursomes.legend')}
                  description={t('allowanceProps.foursomes.description')}
                  nettoHelperText={t('allowanceProps.foursomes.nettoHelper')}
                  bruttoHelperText={t('allowanceProps.foursomes.bruttoHelper')}
                  value={state.foursomesAllowancePct}
                  onChange={state.setFoursomesAllowancePct}
                  hideHiddenInput
                />
              )}
              {state.gameMode === 'greensome_matchplay' && (
                <AllowanceField
                  fieldName="greensome_allowance_pct"
                  defaultPct={100}
                  legend={t('allowanceProps.greensome.legend')}
                  description={t('allowanceProps.greensome.description')}
                  nettoHelperText={t('allowanceProps.greensome.nettoHelper')}
                  bruttoHelperText={t('allowanceProps.greensome.bruttoHelper')}
                  value={state.greensomeAllowancePct}
                  onChange={state.setGreensomeAllowancePct}
                  hideHiddenInput
                />
              )}
              {state.gameMode === 'chapman_matchplay' && (
                <AllowanceField
                  fieldName="chapman_allowance_pct"
                  defaultPct={100}
                  legend={t('allowanceProps.chapman.legend')}
                  description={t('allowanceProps.chapman.description')}
                  nettoHelperText={t('allowanceProps.chapman.nettoHelper')}
                  bruttoHelperText={t('allowanceProps.chapman.bruttoHelper')}
                  value={state.chapmanAllowancePct}
                  onChange={state.setChapmanAllowancePct}
                  hideHiddenInput
                />
              )}
              {state.gameMode === 'gruesome_matchplay' && (
                <AllowanceField
                  fieldName="gruesome_allowance_pct"
                  defaultPct={50}
                  legend={t('allowanceProps.gruesome.legend')}
                  description={t('allowanceProps.gruesome.description')}
                  nettoHelperText={t('allowanceProps.gruesome.nettoHelper')}
                  bruttoHelperText={t('allowanceProps.gruesome.bruttoHelper')}
                  value={state.gruesomeAllowancePct}
                  onChange={state.setGruesomeAllowancePct}
                  hideHiddenInput
                />
              )}
              {state.isRoundRobin && (
                <AllowanceField
                  fieldName="round_robin_allowance_pct"
                  defaultPct={85}
                  legend={t('allowanceProps.roundRobin.legend')}
                  description={t('allowanceProps.roundRobin.description')}
                  nettoHelperText={t('allowanceProps.roundRobin.nettoHelper')}
                  bruttoHelperText={t('allowanceProps.roundRobin.bruttoHelper')}
                  value={state.roundRobinAllowancePct}
                  onChange={state.setRoundRobinAllowancePct}
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
                  legend={t('allowanceProps.scoring.legend')}
                  description={t('allowanceProps.scoring.description')}
                  nettoHelperText={t('allowanceProps.scoring.nettoHelper')}
                  bruttoHelperText={tAllowance(bruttoHelperKeyFor(state.gameMode) as Parameters<typeof tAllowance>[0])}
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
                  legend={t('allowanceProps.texas.legend')}
                  description={t('allowanceProps.texas.description')}
                  nettoHelperText={
                    state.teamSize === 2
                      ? t('allowanceProps.texas.nettoHelper2')
                      : t('allowanceProps.texas.nettoHelper4')
                  }
                  bruttoHelperText={t('allowanceProps.texas.bruttoHelper')}
                  inputLabel={t('allowanceProps.texas.inputLabel')}
                  value={state.texasHandicapPct}
                  onChange={state.setTexasHandicapPct}
                  hideHiddenInput
                />
              )}
              {/* Ambrose (#284): lag-handicap per standard Ambrose-formel.
                  `key={teamSize}` forser remount ved lagstørrelse-bytte. */}
              {state.isAmbrose && (
                <AllowanceField
                  key={state.teamSize}
                  fieldName="ambrose_team_handicap_pct"
                  defaultPct={state.ambroseHandicapPct}
                  legend={t('allowanceProps.ambrose.legend')}
                  description={t('allowanceProps.ambrose.description')}
                  nettoHelperText={
                    state.teamSize === 2
                      ? t('allowanceProps.ambrose.nettoHelper2')
                      : t('allowanceProps.ambrose.nettoHelper4')
                  }
                  bruttoHelperText={t('allowanceProps.ambrose.bruttoHelper')}
                  inputLabel={t('allowanceProps.ambrose.inputLabel')}
                  value={state.ambroseHandicapPct}
                  onChange={state.setAmbroseHandicapPct}
                  hideHiddenInput
                />
              )}
              {/* Florida Scramble (#283): lag-handicap per NGF-fasttabell.
                  `key={teamSize}` forser remount ved lagstørrelse-bytte. */}
              {state.isFlorida && (
                <AllowanceField
                  key={state.teamSize}
                  fieldName="florida_team_handicap_pct"
                  defaultPct={state.floridaHandicapPct}
                  legend={t('allowanceProps.florida.legend')}
                  description={t('allowanceProps.florida.description')}
                  nettoHelperText={
                    state.teamSize === 3
                      ? t('allowanceProps.florida.nettoHelper3')
                      : t('allowanceProps.florida.nettoHelper4')
                  }
                  bruttoHelperText={t('allowanceProps.florida.bruttoHelper')}
                  inputLabel={t('allowanceProps.florida.inputLabel')}
                  value={state.floridaHandicapPct}
                  onChange={state.setFloridaHandicapPct}
                  hideHiddenInput
                />
              )}
              <RegistrationSection
                state={state}
                hideHeading
                hideModeChoice={state.isClubScoped}
              />
              {/* «For hvilken klubb?» hører kun til klubb-arrangement (#50-fix):
                  en kompis-/solo-runde scopes ikke til en klubb. */}
              {state.intent === 'klubb' && clubs.length > 0 && (
                <ClubPicker
                  clubs={clubs}
                  value={state.groupId}
                  onChange={state.setGroupId}
                />
              )}
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
              {t('step4.selfSignupHint')}
            </p>
          )}
          {/* #373: hint om antall spillere valgt i steg 2 */}
          {!state.playersStepOptional &&
            state.intent === 'kompis' &&
            state.expectedPlayerCount !== undefined && (
              <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
                {t('step4.expectedCountHint', { count: state.expectedPlayerCount })}
              </p>
            )}
          {/* #464: tom-tilstand når picker-kilden ikke har andre enn deg selv
              (ingen venner, eller en klubb uten andre medlemmer). Solo viser
              hele rosteren, så hintet gjelder ikke der. */}
          {state.intent !== 'solo' && pickListOthers === 0 && (
            <PickerSourceEmptyHint intent={state.intent} groupId={state.groupId} />
          )}
          <PlayersSection
            state={state}
            players={players}
            selectableIds={pickIds}
            heading={t('sections.players.headingWizard')}
          />
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

      {/* #498: format-oppslagsverket som bunn-ark — over veiviseren, lukk
          legger deg tilbake nøyaktig der du var. */}
      <FormatGuideSheet
        open={guideOpen}
        entries={formatGuide}
        focusKey={guideFocusKey}
        onClose={() => setGuideOpen(false)}
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
    isAmbrose,
    isFlorida,
    isShamble,
    isWolf,
    isNassau,
    isSkins,
    isNines,
    isRoundRobin,
    isAceyDeucey,
    isPatsome,
    texasHandicapPct,
    ambroseHandicapPct,
    floridaHandicapPct,
    fourballAllowancePct,
    foursomesAllowancePct,
    greensomeAllowancePct,
    chapmanAllowancePct,
    gruesomeAllowancePct,
    roundRobinAllowancePct,
    wolfScoring,
    nassauScoring,
    skinsScoring,
    ninesVariant,
    ninesScoring,
    aceyDeuceyScoring,
    shambleVariant,
    shambleCount,
    shambleScoring,
    patsomeScoring,
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
    letFriendsSkipGate,
    groupId,
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
      <input type="hidden" name="let_friends_skip_gate" value={letFriendsSkipGate ? '1' : ''} />
      <input type="hidden" name="group_id" value={groupId} />
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
      {isAmbrose && (
        <>
          <input type="hidden" name="ambrose_team_size" value={teamSize} />
          <input
            type="hidden"
            name="ambrose_team_handicap_pct"
            value={String(ambroseHandicapPct)}
          />
        </>
      )}
      {isFlorida && (
        <>
          <input type="hidden" name="florida_team_size" value={teamSize} />
          <input
            type="hidden"
            name="florida_team_handicap_pct"
            value={String(floridaHandicapPct)}
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
      {gameMode === 'greensome_matchplay' && (
        <input
          type="hidden"
          name="greensome_allowance_pct"
          value={String(greensomeAllowancePct)}
        />
      )}
      {gameMode === 'chapman_matchplay' && (
        <input
          type="hidden"
          name="chapman_allowance_pct"
          value={String(chapmanAllowancePct)}
        />
      )}
      {gameMode === 'gruesome_matchplay' && (
        <input
          type="hidden"
          name="gruesome_allowance_pct"
          value={String(gruesomeAllowancePct)}
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
      {isRoundRobin && (
        <input
          type="hidden"
          name="round_robin_allowance_pct"
          value={String(roundRobinAllowancePct)}
        />
      )}
      {isAceyDeucey && (
        <input type="hidden" name="acey_deucey_scoring" value={aceyDeuceyScoring} />
      )}
      {isShamble && (
        <>
          <input type="hidden" name="shamble_variant" value={shambleVariant} />
          <input type="hidden" name="shamble_count" value={String(shambleCount)} />
          <input type="hidden" name="shamble_scoring" value={shambleScoring} />
          <input type="hidden" name="shamble_team_size" value={String(teamSize)} />
        </>
      )}
      {isPatsome && (
        <input type="hidden" name="patsome_scoring" value={patsomeScoring} />
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
// #464: tom-tilstand for picker-kilden i steg 4. Vises når det ikke finnes
// andre kandidater enn deg selv — enten fordi du ikke har venner ennå
// (kompis/cup, eller klubb uten valgt klubb), eller fordi en valgt klubb
// ikke har andre medlemmer. Speiler «Legg til venner»-lenken fra liga-opprett
// (CreateLigaForm) så det er én vei til vennegrafen.
// ──────────────────────────────────────────────────────────────────────

function PickerSourceEmptyHint({
  intent,
  groupId,
}: {
  intent: Intent | undefined;
  groupId: string;
}) {
  const t = useTranslations('wizard');
  const noClubMembers = intent === 'klubb' && groupId !== '';
  return (
    <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
      {noClubMembers ? (
        t('pickerSource.noClubMembers')
      ) : (
        <>
          {t('pickerSource.noFriendsPrefix')}{' '}
          <Link href="/profile/venner" className="text-primary underline">
            {t('pickerSource.addFriendsLink')}
          </Link>{' '}
          {t('pickerSource.noFriendsSuffix')}
        </>
      )}
    </p>
  );
}

// ──────────────────────────────────────────────────────────────────────
// #373: Antall-spiller-velger for Kompis-intent i steg 2. Vises over
// FormatGrid slik at admin velger antall FØR format. +/−-knapper med
// ≥44px tap-target. Forest-and-champagne-palett via CSS-variabler.
// Min 1, maks 24 (#525: hevet fra 16 — den offentlige kompis-runden er nå
// også veien for en større ad-hoc-turnering; over 24 hører klubb-skala til).
// ──────────────────────────────────────────────────────────────────────

const PLAYER_COUNT_MIN = 1;
const PLAYER_COUNT_MAX = 24;
// PLAYER_COUNT_DEFAULT importeres fra useGameFormState (state-eieren) så initial
// state og picker-fallback aldri kommer ut av sync.

function PlayerCountPicker({
  value,
  onChange,
}: {
  value: number | undefined;
  onChange: (next: number | undefined) => void;
}) {
  const t = useTranslations('wizard');
  const count = value ?? PLAYER_COUNT_DEFAULT;

  function decrement() {
    const next = Math.max(PLAYER_COUNT_MIN, count - 1);
    onChange(next);
  }

  function increment() {
    const next = Math.min(PLAYER_COUNT_MAX, count + 1);
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
        {t('playerCount.legend')}
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={t('playerCount.lessAriaLabel')}
          onClick={decrement}
          disabled={count <= PLAYER_COUNT_MIN}
          className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-surface text-text transition-colors hover:bg-primary-soft/60 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <span className="text-xl leading-none select-none">−</span>
        </button>
        <span
          aria-live="polite"
          aria-label={
            value !== undefined
              ? t('playerCount.countAriaLabel', { count })
              : t('playerCount.showAllAriaLabel')
          }
          className="min-w-[3ch] text-center font-serif text-2xl tabular-nums text-text"
        >
          {value !== undefined ? count : '?'}
        </span>
        <button
          type="button"
          aria-label={t('playerCount.moreAriaLabel')}
          onClick={increment}
          disabled={count >= PLAYER_COUNT_MAX}
          className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-surface text-text transition-colors hover:bg-primary-soft/60 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <span className="text-xl leading-none select-none">+</span>
        </button>
        {value !== undefined && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="ml-1 font-sans text-xs text-muted underline underline-offset-2 hover:text-text"
          >
            {t('playerCount.showAll')}
          </button>
        )}
      </div>
      <p aria-live="polite" className="font-sans text-xs text-muted">
        {value !== undefined
          ? t('playerCount.hint', { count })
          : t('playerCount.showAllHint')}
      </p>
    </div>
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
  action,
}: {
  step: Step;
  title: string;
  subText: string | null;
  totalSteps: number;
  /** Valgfri handling til høyre for tittelen (#498: «?»-knapp på steg 2). */
  action?: ReactNode;
}) {
  const t = useTranslations('wizard');
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted tabular-nums">
          {t('stepCounter', { step, total: totalSteps })}
        </span>
        <div className="flex items-center gap-2">
          <span className="font-serif text-lg text-text">{title}</span>
          {action}
        </div>
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

/**
 * ClubPicker — «Hvem er dette for?»-velger i steg 2 (#442).
 *
 * Vises kun når brukeren er med i ≥1 klubb. Lar admin knytte spillet til
 * en klubb — noe som gjør turneringen synlig for alle klubbens medlemmer
 * (også invite_only-turneringer). Default er «Ingen klubb» (tom streng).
 */
function ClubPicker({
  clubs,
  value,
  onChange,
}: {
  clubs: ClubOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const t = useTranslations('wizard');
  return (
    <fieldset className="space-y-2">
      <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
        {t('club.legend')}
      </legend>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-h-[44px] rounded-lg border border-border bg-surface px-3 py-2 font-sans text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <option value="">{t('club.noClub')}</option>
        {clubs.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <p className="text-xs text-muted">
        {t('club.hint')}
      </p>
    </fieldset>
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
  const t = useTranslations('wizard');
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
          {t('footer.prev')}
        </Button>
        {showNext && (
          <Button
            type="button"
            onClick={onNext}
            disabled={!canAdvance}
            className="flex-1"
          >
            {t('footer.next')}
          </Button>
        )}
      </div>
      {showNext && !canAdvance && disabledHint && (
        <p className="text-xs text-muted text-center">{disabledHint}</p>
      )}
    </div>
  );
}
