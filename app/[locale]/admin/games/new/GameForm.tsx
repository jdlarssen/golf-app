'use client';

import { Button } from '@/components/ui/Button';
import type { SideCategoryId } from '@/lib/scoring/sideTournamentConfig';
import { isStablefordFamily, type GameMode } from '@/lib/scoring/modes/types';
import type {
  RegistrationMode,
  RegistrationType,
} from '@/lib/games/registration';
import { ModeSelector } from './ModeSelector';
import { TeamSizeSelector, type TeamSize } from './TeamSizeSelector';
import { useGameFormState } from './useGameFormState';
import { BasicsSection } from './sections/BasicsSection';
import { PlayersSection } from './sections/PlayersSection';
import { TeamsAssignmentSection } from './sections/TeamsAssignmentSection';
import { AdvancedSettingsSection } from './sections/AdvancedSettingsSection';
import { RegistrationSection } from './sections/RegistrationSection';
import { useTranslations } from 'next-intl';
import { AllowanceField } from '@/components/admin/AllowanceField';
import { bruttoHelperKeyFor } from '@/lib/games/allowanceCopy';
import { WolfSetup } from './sections/WolfSetup';
import { NassauSetup } from './sections/NassauSetup';
import { SkinsSetup } from './sections/SkinsSetup';
import { NinesSetup } from './sections/NinesSetup';
import { ShambleSetup } from './sections/ShambleSetup';

export type CourseOption = {
  id: string;
  name: string;
  tee_boxes: {
    id: string;
    name: string;
    has_mens: boolean;
    has_ladies: boolean;
    has_juniors: boolean;
  }[];
};

export type PlayerOption = {
  id: string;
  name: string | null;       // null while invitee hasn't completed profile
  nickname: string | null;
  hcp_index: number;
  // Optional: the e-post-fri roster variant for non-admin create/edit flows
  // omits this so co-players' e-postadresser never reach the page payload
  // (#435). Picker fallbacks use PENDING_PLAYER_LABEL when it's absent.
  email?: string;
  pending: boolean;          // derived from profile_completed_at IS NULL
  gender: 'mens' | 'ladies' | null;  // null = not answered yet → soft-prompt on /profile
  level: 'junior' | 'normal' | 'senior';
};

export type InitialValues = {
  name?: string;
  course_id?: string;
  tee_box_id?: string;
  /** Format: 'YYYY-MM-DDTHH:mm' in Europe/Oslo local time (matches datetime-local input). */
  scheduled_tee_off_at?: string;
  hcp_allowance_pct?: string;
  require_peer_approval?: boolean;
  /** 'live' (default) shows netto immediately; 'reveal' hides it until the game finishes. */
  score_visibility?: 'live' | 'reveal';
  /**
   * When true, the score_visibility radios are disabled (status === 'active' |
   * 'finished'). The edit page already redirects away from those states, so in
   * practice this is always false today — but threading the flag through
   * matches the task spec and future-proofs against a status-based edit page
   * variant that might allow reading the form while locked.
   */
  lock_score_visibility?: boolean;
  /** Whether the side-tournament module is enabled for this game. Default false. */
  side_tournament_enabled?: boolean;
  /** Antall LD-vinnere (0/1/2). Krever side_tournament_enabled=true. */
  side_ld_count?: number;
  /** Antall CTP-vinnere (0/1/2). Krever side_tournament_enabled=true. */
  side_ctp_count?: number;
  /**
   * v1.2.0 — kategorier som er slått av for dette spillet. Tomt array = Full
   * pakke (alle på). For NYE spill defaultes denne til `CLASSIC_DISABLED_CATEGORIES`
   * av GameForm hvis ikke satt — dvs. spill-opprett-flyten starter på Klassisk
   * (matcher v1.1.x-oppførsel for spill opprettet før v1.2.0).
   */
  side_disabled_categories?: readonly SideCategoryId[];
  /** Lås feltene (når status er active/finished). */
  lock_side_tournament?: boolean;
  /** Per-player tee selection. Missing key defaults to 'M' in the form state. */
  player_genders?: Record<string, 'M' | 'D' | 'J'>;
  players?: Array<{
    user_id: string;
    // Widened to `number | null` ved prop-grensen siden 0030 gjorde
    // team/flight nullable for solo-modus (stableford). deriveAssignmentsFromInitial
    // validerer/narrower bare når feltet er satt (1..4) — null-rader hopper
    // over team/flight-state og lar lag-tilordnings-grid stå tom.
    team_number: number | null;
    flight_number: number | null;
  }>;
  /**
   * Valgt spillmodus. Innført med epic #41 fase 4. Defaulter til
   * `'best_ball'` så eksisterende edit-flyt for pre-multi-mode-spill
   * fungerer uten endring.
   */
  game_mode?: GameMode;
  /**
   * Lagstørrelse. Defaulter til 2 (matcher dagens best-ball-flyt) hvis
   * mode = best_ball, eller 1 hvis mode = stableford. Initialiserings-
   * logikken i GameForm-state-en sikrer at verdien alltid matcher modus.
   */
  team_size?: TeamSize;
  /**
   * Lås modus + lagstørrelse (når status er scheduled/active/finished).
   * Backend mode-lock-guard har siste ord, men UI-en skal vise låste
   * felter for å unngå at admin trigger en validation error utilsiktet.
   */
  lock_game_mode?: boolean;
  /**
   * Texas scramble: lag-handicap-prosent (NGF-aggregat). Strengt 0..100,
   * persisterer som heltall til mode_config. Default settes av GameForm
   * når lagstørrelse endres (25 for 2-mannslag, 10 for 4-mannslag).
   */
  texas_team_handicap_pct?: string;
  /**
   * Ambrose (#284): lag-handicap-prosent (standard Ambrose-formel). 0..100,
   * kan være fraksjonell (12,5 for 4-mannslag). Default settes av GameForm
   * via `ambroseDefaultPct(teamSize)` når lagstørrelse endres.
   */
  ambrose_team_handicap_pct?: string;
  /**
   * Florida Scramble (#283): lag-handicap-prosent (NGF-fasttabell). 0..100,
   * heltall default (15 for 3-mannslag, 10 for 4-mannslag). Default settes av
   * GameForm via `defaultFloridaHandicapPct(teamSize)` når lagstørrelse endres.
   */
  florida_team_handicap_pct?: string;
  /**
   * Cup-link (#47): kobler spillet til en parent tournament-rad. Settes når
   * admin lander på `/admin/games/new?tournament_id=...` fra cup-detalj-
   * siden. Rendres som hidden inputs på form-en og leses i actions.ts.
   */
  tournament_id?: string;
  tournament_match_label?: string;
  /**
   * Fourball matchplay (#217): allowance-prosent (0..100) som pre-fylles inn
   * i netto/brutto-toggle-en i wizarden. Settes når admin lander via cup-link
   * med `?game_mode=fourball_matchplay`, slik at match-en arver cup-radens
   * `tournaments.fourball_allowance_pct`. Brukes IKKE for andre modi.
   */
  fourball_allowance_pct?: number;
  /**
   * Foursomes matchplay (#218): allowance-prosent (0..100) som pre-fylles inn
   * i netto/brutto-toggle-en i wizarden. Settes når admin lander via cup-link
   * med `?game_mode=foursomes_matchplay`, slik at match-en arver cup-radens
   * `tournaments.foursomes_allowance_pct`. Brukes IKKE for andre modi.
   */
  foursomes_allowance_pct?: number;
  /**
   * Greensome matchplay (#289): allowance-prosent (0..100) som pre-fylles inn
   * i netto/brutto-toggle-en i wizarden. Settes når admin lander via cup-link
   * med `?game_mode=greensome_matchplay`, slik at match-en arver cup-radens
   * `tournaments.greensome_allowance_pct`. Brukes IKKE for andre modi.
   */
  greensome_allowance_pct?: number;
  /**
   * Chapman matchplay (#290): allowance-prosent (0..100) som pre-fylles inn i
   * netto/brutto-toggle-en. Settes når admin lander via cup-link med
   * `?game_mode=chapman_matchplay`, arver cup-radens `chapman_allowance_pct`.
   * Brukes IKKE for andre modi.
   */
  chapman_allowance_pct?: number;
  /**
   * Gruesome matchplay (#291): allowance-prosent (0..100) som pre-fylles inn i
   * netto/brutto-toggle-en. Settes når admin lander via cup-link med
   * `?game_mode=gruesome_matchplay`, arver cup-radens `gruesome_allowance_pct`.
   * Brukes IKKE for andre modi.
   */
  gruesome_allowance_pct?: number;
  /**
   * Round Robin (#280): allowance-prosent (0..100) for matchplay-scoring.
   * Pre-fylles fra DB i edit-flyt; nye spill defaulter til 85 (WHS-standard
   * for matchplay) i useGameFormState.
   */
  round_robin_allowance_pct?: number;
  /**
   * Wolf (#274): scoring-modus ('gross' eller 'net'). Pre-fylles fra DB i
   * edit-flyt; nye spill defaulter til 'net' i useGameFormState.
   */
  wolf_scoring?: 'gross' | 'net';
  /**
   * Nassau (#276): scoring-modus ('gross' eller 'net'). Pre-fylles fra DB i
   * edit-flyt; nye spill defaulter til 'net' i useGameFormState.
   */
  nassau_scoring?: 'gross' | 'net';
  /**
   * Skins (#275): scoring-modus ('gross' eller 'net'). Pre-fylles fra DB i
   * edit-flyt; nye spill defaulter til 'net' i useGameFormState.
   */
  skins_scoring?: 'gross' | 'net';
  /**
   * Nines / Split Sixes (#278): variant ('nines' eller 'split_sixes'). Pre-fylles
   * fra DB i edit-flyt; nye spill defaulter til 'nines' i useGameFormState.
   */
  nines_variant?: 'nines' | 'split_sixes';
  /**
   * Nines / Split Sixes (#278): scoring-modus ('gross' eller 'net'). Pre-fylles
   * fra DB i edit-flyt; nye spill defaulter til 'net' i useGameFormState.
   */
  nines_scoring?: 'gross' | 'net';
  /**
   * Acey Deucey (#279): scoring-modus ('gross' eller 'net'). Pre-fylles fra DB
   * i edit-flyt; nye spill defaulter til 'net' i useGameFormState.
   */
  acey_deucey_scoring?: 'gross' | 'net';
  /**
   * Shamble / Champagne Scramble (#285): variant ('shamble' eller 'champagne').
   * Pre-fylles fra DB i edit-flyt; nye spill defaulter til 'shamble' i useGameFormState.
   */
  shamble_variant?: 'shamble' | 'champagne';
  /**
   * Shamble / Champagne Scramble (#285): antall score som teller per hull (1/2/3).
   * Shamble-preset låser til 2 server-side; Champagne lar arrangør velge 1/2/3.
   */
  shamble_count?: 1 | 2 | 3;
  /**
   * Shamble / Champagne Scramble (#285): scoring-modus ('gross' eller 'net').
   * Pre-fylles fra DB i edit-flyt; nye spill defaulter til 'net' i useGameFormState.
   */
  shamble_scoring?: 'gross' | 'net';
  /**
   * Patsome (#286): scoring-modus ('gross' eller 'net'). Pre-fylles fra DB i
   * edit-flyt; nye spill defaulter til 'net' i useGameFormState.
   */
  patsome_scoring?: 'gross' | 'net';
  /**
   * Self-påmelding (#199). Defaultes til 'invite_only' + 'solo' for å
   * bevare dagens flyt. Edit-flyten leverer eksisterende valg fra DB.
   */
  registration_mode?: RegistrationMode;
  registration_type?: RegistrationType;
  /**
   * #369: «Slipp venner direkte inn» for manual_approval-spill. Kun
   * relevant + gyldig når registration_mode = 'manual_approval'. Edit-flyten
   * pre-fyller fra DB; nye spill defaulter til false.
   */
  let_friends_skip_gate?: boolean;
  /**
   * Klubb-tilknytning (#442). Valgfritt — kun satt i create-flyten når
   * admin velger en klubb i veiviseren. Edit-flyten berøres ikke.
   */
  group_id?: string;
};

/**
 * Discriminated union describing which flow the form is wired for. Each `kind`
 * carries exactly the actions it needs — TypeScript narrows per call site so
 * we no longer need runtime guards to police missing/extra action props.
 */
export type GameFormMode =
  | {
      kind: 'create';
      createDraftAction: (formData: FormData) => Promise<void>;
      createAndPublishAction: (formData: FormData) => Promise<void>;
    }
  | {
      kind: 'edit-draft';
      gameId: string;
      saveDraftAction: (gameId: string, formData: FormData) => Promise<void>;
      publishAction: (gameId: string, formData: FormData) => Promise<void>;
    }
  | {
      kind: 'edit-scheduled';
      gameId: string;
      updateAction: (gameId: string, formData: FormData) => Promise<void>;
    };

type Props = {
  courses: CourseOption[];
  players: PlayerOption[];
  mode: GameFormMode;
  initialValues?: InitialValues;
};

/**
 * GameForm — stacked presentation av alle seksjoner for opprett- og edit-
 * flytene. Selve form-state og validerings-logikken lever i `useGameFormState`-
 * hooken; denne komponenten orkestrerer kun rendering + submit-knapper.
 *
 * Wizard-flyten (`GameWizard`) konsumerer samme hook men rendrer seksjonene
 * per steg istedenfor i én stacked layout. Edit-flyten bruker GameForm
 * uendret.
 */
export function GameForm({ courses, players, mode, initialValues }: Props) {
  const t = useTranslations('wizard.form');
  const tAllowance = useTranslations('allowance');
  const state = useGameFormState({ initialValues, players, courses });
  const {
    name,
    gameMode,
    teamSize,
    isTexas,
    isAmbrose,
    isFlorida,
    isMatchplay,
    texasHandicapPct,
    setTexasHandicapPct,
    ambroseHandicapPct,
    setAmbroseHandicapPct,
    floridaHandicapPct,
    setFloridaHandicapPct,
    hcpAllowance,
    setHcpAllowance,
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
    handleModeChange,
    handleTeamSizeChange,
    lockGameMode,
    orderedPayload,
    canPublish,
    missingForPublish,
  } = state;

  // Resolve the draft + publish server actions for the two modes that share a
  // draft/publish split (create + edit-draft). Returning `null` for
  // edit-scheduled lets the JSX collapse to one branch without runtime guards.
  function getDraftAndPublishActions():
    | {
        publish: (formData: FormData) => void | Promise<void>;
        draft: (formData: FormData) => void | Promise<void>;
      }
    | null {
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
  const draftPublishActions = getDraftAndPublishActions();

  return (
    <form className="space-y-6">
      {/* Modus + lagstørrelse — hidden inputs slik at server-action mottar
          eksakt det admin valgte i tile-en. `team_size` er teknisk redundant
          (modus + ENABLED_COMBOS gir det back-end), men sender den med
          eksplisitt så form-laget er selv-dokumenterende.

          `stableford_team_size` er det stableford-validatoren faktisk leser
          for å skille solo (1) fra par-stableford (2). Sendes kun når
          modus = stableford så vi ikke smyger irrelevant felt inn i andre
          modus-payloads. */}
      <input type="hidden" name="game_mode" value={gameMode} />
      <input type="hidden" name="team_size" value={teamSize} />
      <input
        type="hidden"
        name="registration_mode"
        value={state.registrationMode}
      />
      <input
        type="hidden"
        name="registration_type"
        value={state.registrationType}
      />
      <input
        type="hidden"
        name="let_friends_skip_gate"
        value={state.letFriendsSkipGate ? '1' : ''}
      />
      {initialValues?.tournament_id && (
        <>
          <input
            type="hidden"
            name="tournament_id"
            value={initialValues.tournament_id}
          />
          {initialValues.tournament_match_label && (
            <input
              type="hidden"
              name="tournament_match_label"
              value={initialValues.tournament_match_label}
            />
          )}
        </>
      )}
      {isStablefordFamily(gameMode) && (
        <input
          type="hidden"
          name="stableford_team_size"
          value={teamSize}
        />
      )}
      {isTexas && (
        <>
          <input
            type="hidden"
            name="texas_team_size"
            value={teamSize}
          />
          <input
            type="hidden"
            name="texas_team_handicap_pct"
            value={texasHandicapPct}
          />
        </>
      )}
      {isAmbrose && (
        <>
          <input
            type="hidden"
            name="ambrose_team_size"
            value={teamSize}
          />
          <input
            type="hidden"
            name="ambrose_team_handicap_pct"
            value={String(ambroseHandicapPct)}
          />
        </>
      )}
      {isFlorida && (
        <>
          <input
            type="hidden"
            name="florida_team_size"
            value={teamSize}
          />
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
      {gameMode === 'greensome_matchplay' && (
        <input
          type="hidden"
          name="greensome_allowance_pct"
          value={String(greensomeAllowancePct)}
        />
      )}

      {/* Hidden inputs that carry the structured assignment payload. The server
          action only ever sees the FormData; keeping the names server-known
          means we don't need an alternate JSON wire format. For solo-modus
          (stableford eller solo_strokeplay) sender vi tomme team/
          flight-strenger — gamePayload-validatoren oppdager modusen og
          persisterer team_number/flight_number som null uansett. */}
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

      {/* Section 1: Basics */}
      <BasicsSection state={state} courses={courses} showName showAdvancedInline />

      {/* Section 2: Players */}
      <PlayersSection state={state} players={players} />

      {/* Section 2.5: Modus + lagstørrelse — fyrer mellom spiller-listen og
          lag-tilordnings-grid-en så admin må eksplisitt velge hvordan
          spillet skal scoreres FØR det blir aktuelt å fordele lag.
          Lock-flagget gjelder edit-flyten for publiserte spill (backend
          mode-lock-guard har siste ord).

          TeamSizeSelector skjules for matchplay siden det kun finnes én
          gyldig lagstørrelse (1 spiller per side) — å vise Solo/Par/4-mann
          ville gitt misvisende valg. team_size = 1 sendes uansett via det
          skjulte hidden-input ved bunnen av form. */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-text">
          {t('formatHeading')}
        </h2>
        <ModeSelector
          value={gameMode}
          onChange={handleModeChange}
          disabled={lockGameMode}
        />
        {!isMatchplay && (
          <TeamSizeSelector
            mode={gameMode}
            value={teamSize}
            onChange={handleTeamSizeChange}
            disabled={lockGameMode}
          />
        )}
        {gameMode === 'fourball_matchplay' && (
          <AllowanceField
            fieldName="fourball_allowance_pct"
            defaultPct={85}
            legend={t('fourball.legend')}
            description={t('fourball.description')}
            nettoHelperText={t('fourball.nettoHelper')}
            bruttoHelperText={t('fourball.bruttoHelper')}
            value={fourballAllowancePct}
            onChange={setFourballAllowancePct}
            hideHiddenInput
          />
        )}
        {gameMode === 'foursomes_matchplay' && (
          <AllowanceField
            fieldName="foursomes_allowance_pct"
            defaultPct={50}
            legend={t('foursomes.legend')}
            description={t('foursomes.description')}
            nettoHelperText={t('foursomes.nettoHelper')}
            bruttoHelperText={t('foursomes.bruttoHelper')}
            value={foursomesAllowancePct}
            onChange={setFoursomesAllowancePct}
            hideHiddenInput
          />
        )}
        {gameMode === 'greensome_matchplay' && (
          <AllowanceField
            fieldName="greensome_allowance_pct"
            defaultPct={100}
            legend={t('greensome.legend')}
            description={t('greensome.description')}
            nettoHelperText={t('greensome.nettoHelper')}
            bruttoHelperText={t('greensome.bruttoHelper')}
            value={greensomeAllowancePct}
            onChange={setGreensomeAllowancePct}
            hideHiddenInput
          />
        )}
        {gameMode === 'chapman_matchplay' && (
          <AllowanceField
            fieldName="chapman_allowance_pct"
            defaultPct={100}
            legend={t('chapman.legend')}
            description={t('chapman.description')}
            nettoHelperText={t('chapman.nettoHelper')}
            bruttoHelperText={t('chapman.bruttoHelper')}
            value={chapmanAllowancePct}
            onChange={setChapmanAllowancePct}
            hideHiddenInput
          />
        )}
        {gameMode === 'gruesome_matchplay' && (
          <AllowanceField
            fieldName="gruesome_allowance_pct"
            defaultPct={50}
            legend={t('gruesome.legend')}
            description={t('gruesome.description')}
            nettoHelperText={t('gruesome.nettoHelper')}
            bruttoHelperText={t('gruesome.bruttoHelper')}
            value={gruesomeAllowancePct}
            onChange={setGruesomeAllowancePct}
            hideHiddenInput
          />
        )}
        {/* Non-fourball / non-texas allowance-toggle (#266). GameForm-pathen
            har ingen sentral hidden input for hcp_allowance_pct — toggle-en
            emitter sin egen (ingen hideHiddenInput). State persisterer i
            useGameFormState via controlled-modus. */}
        {(gameMode === 'best_ball' ||
          isStablefordFamily(gameMode) ||
          gameMode === 'singles_matchplay' ||
          gameMode === 'solo_strokeplay') && (
          <AllowanceField
            fieldName="hcp_allowance_pct"
            defaultPct={100}
            legend={t('scoring.legend')}
            description={t('scoring.description')}
            nettoHelperText={t('scoring.nettoHelper')}
            bruttoHelperText={tAllowance(bruttoHelperKeyFor(gameMode))}
            value={hcpAllowance}
            onChange={setHcpAllowance}
          />
        )}
        {/* Texas scramble (#266): toggle skriver til mode_config.team_handicap_pct
            (via hidden input `texas_team_handicap_pct`). Default per team-size:
            25 % for 2-mann, 10 % for 4-mann (NGF-konvensjon). `key={teamSize}`
            forser remount når admin bytter team-size — sikrer at toggle-state
            re-initialiseres til ny default. Tex trenger fortsatt hidden
            hcp_allowance_pct=100 for DB NOT NULL (mode_config holder den
            reelle prosenten). */}
        {isTexas && (
          <>
            <AllowanceField
              key={teamSize}
              fieldName="texas_team_handicap_pct"
              defaultPct={texasHandicapPct}
              legend={t('teamHandicap.legend')}
              description={t('teamHandicap.description')}
              nettoHelperText={
                teamSize === 2
                  ? t('teamHandicap.texasNetto2')
                  : t('teamHandicap.texasNetto4')
              }
              bruttoHelperText={t('teamHandicap.bruttoHelper')}
              inputLabel={t('teamHandicap.inputLabel')}
              value={texasHandicapPct}
              onChange={setTexasHandicapPct}
            />
            <input type="hidden" name="hcp_allowance_pct" value="100" />
          </>
        )}
        {/* Ambrose (#284): lag-handicap per standard Ambrose-formel (25 % for
            2-mannslag, 12,5 % for 4-mannslag). `key={teamSize}` forser remount
            ved lagstørrelse-bytte. `hcp_allowance_pct=100` er no-op for DB
            NOT NULL (reell prosent ligger i mode_config). */}
        {isAmbrose && (
          <>
            <AllowanceField
              key={teamSize}
              fieldName="ambrose_team_handicap_pct"
              defaultPct={ambroseHandicapPct}
              legend={t('teamHandicap.legend')}
              description={t('teamHandicap.description')}
              nettoHelperText={
                teamSize === 2
                  ? t('teamHandicap.ambroseNetto2')
                  : t('teamHandicap.ambroseNetto4')
              }
              bruttoHelperText={t('teamHandicap.bruttoHelper')}
              inputLabel={t('teamHandicap.inputLabel')}
              value={ambroseHandicapPct}
              onChange={setAmbroseHandicapPct}
            />
            <input type="hidden" name="hcp_allowance_pct" value="100" />
          </>
        )}
        {/* Florida Scramble (#283): lag-handicap per NGF-fasttabell (15 % for
            3-mannslag, 10 % for 4-mannslag). `key={teamSize}` forser remount
            ved lagstørrelse-bytte. `hcp_allowance_pct=100` er no-op for DB
            NOT NULL (reell prosent ligger i mode_config). */}
        {isFlorida && (
          <>
            <AllowanceField
              key={teamSize}
              fieldName="florida_team_handicap_pct"
              defaultPct={floridaHandicapPct}
              legend={t('teamHandicap.legend')}
              description={t('teamHandicap.description')}
              nettoHelperText={
                teamSize === 3
                  ? t('teamHandicap.floridaNetto3')
                  : t('teamHandicap.floridaNetto4')
              }
              bruttoHelperText={t('teamHandicap.bruttoHelper')}
              inputLabel={t('teamHandicap.inputLabel')}
              value={floridaHandicapPct}
              onChange={setFloridaHandicapPct}
            />
            <input type="hidden" name="hcp_allowance_pct" value="100" />
          </>
        )}
        {/* Round Robin (#280): 4-spiller roterende-partner four-ball matchplay.
            Mirrored from GameWizard step 2. AllowanceField emitter
            round_robin_allowance_pct selv (ingen hideHiddenInput her, til
            forskjell fra wizarden som har egen FormDataInputs-mirror). Trenger
            hcp_allowance_pct=100 no-op for DB NOT NULL (reell prosent ligger i
            mode_config.allowance_pct). Refs #337. */}
        {state.isRoundRobin && (
          <>
            <AllowanceField
              fieldName="round_robin_allowance_pct"
              defaultPct={85}
              legend={t('roundRobin.legend')}
              description={t('roundRobin.description')}
              nettoHelperText={t('roundRobin.nettoHelper')}
              bruttoHelperText={t('roundRobin.bruttoHelper')}
              value={state.roundRobinAllowancePct}
              onChange={state.setRoundRobinAllowancePct}
            />
            <input type="hidden" name="hcp_allowance_pct" value="100" />
          </>
        )}
        {/* Setup-step sections: Wolf, Nassau, Skins, Nines, Shamble.
            Mirrored from GameWizard step 2 (same props from state).
            Each section emits radio inputs directly into FormData — no
            extra hidden inputs needed. Disabled follows lockGameMode so
            mode-lock after publish prevents edits here too.
            Refs: #322 */}
        {state.isWolf && (
          <WolfSetup
            scoring={state.wolfScoring}
            onScoringChange={state.setWolfScoring}
            wolfOrder={state.wolfOrder
              .map((pid) => players.find((p) => p.id === pid))
              .filter((p): p is PlayerOption => p !== undefined)}
            onShuffle={state.shuffleWolfOrder}
            disabled={lockGameMode}
          />
        )}
        {state.isNassau && (
          <NassauSetup
            scoring={state.nassauScoring}
            onScoringChange={state.setNassauScoring}
            disabled={lockGameMode}
          />
        )}
        {state.isSkins && (
          <SkinsSetup
            scoring={state.skinsScoring}
            onScoringChange={state.setSkinsScoring}
            disabled={lockGameMode}
          />
        )}
        {state.isNines && (
          <NinesSetup
            variant={state.ninesVariant}
            onVariantChange={state.setNinesVariant}
            scoring={state.ninesScoring}
            onScoringChange={state.setNinesScoring}
            disabled={lockGameMode}
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
            teamSize={teamSize as 3 | 4}
            onTeamSizeChange={handleTeamSizeChange as (next: 3 | 4) => void}
            disabled={lockGameMode}
          />
        )}
        {lockGameMode && (
          <p className="text-xs text-muted">
            <strong>{t('modeLockedNote')}</strong>
          </p>
        )}
      </section>

      {/* Section 3b: Påmelding (#199) — to akser: hvem kan melde seg på, og
          hva man melder på. Defaultes til invite_only + solo så dagens flyt
          er uendret når admin ikke aktivt velger noe annet. */}
      <RegistrationSection state={state} />

      {/* Section 4/5: Matchplay sides / team grid / flights / per-spiller-tee */}
      <TeamsAssignmentSection state={state} players={players} />

      {/* Section 6: Settings */}
      <AdvancedSettingsSection state={state} />

      {/* Section 6: Submit */}
      <section className="space-y-3 pt-2">
        {mode.kind === 'edit-scheduled' && (
          // The game is already 'scheduled', so there's no draft/publish
          // split — just a single save button. Tee-off is required (same
          // gate as publish) since you can't un-set a tee-off on a scheduled
          // game.
          <Button
            type="submit"
            formAction={mode.updateAction.bind(null, mode.gameId)}
            className="w-full"
            disabled={!canPublish}
          >
            {t('saveChangesButton')}
          </Button>
        )}

        {draftPublishActions && (
          // Both 'create' and 'edit-draft' share the same publish/draft
          // contract. The helper above resolves the right pair of server
          // actions per mode; the JSX below stays mode-agnostic.
          <>
            <Button
              type="submit"
              formAction={draftPublishActions.publish}
              className="w-full"
              disabled={!canPublish}
              aria-describedby={
                !canPublish && missingForPublish.length > 0
                  ? 'publish-missing'
                  : undefined
              }
            >
              {t('publishButton')}
            </Button>
            {!canPublish && missingForPublish.length > 0 && (
              <p
                id="publish-missing"
                className="text-xs text-muted text-center"
              >
                {t('missingPrefix', { items: missingForPublish.join(', ') })}
              </p>
            )}
            <Button
              type="submit"
              variant="secondary"
              formAction={draftPublishActions.draft}
              formNoValidate
              className="w-full"
              disabled={name.trim() === ''}
            >
              {t('saveDraftButton')}
            </Button>
          </>
        )}
      </section>
    </form>
  );
}
