/**
 * wizardStatePersistence — veiviser-utkast i sessionStorage (#1380).
 *
 * Problemet: all veiviser-state er ren `useState` i `useGameFormState`. En
 * reload, en tilbake-gest ut av veiviseren, eller mobil-OS-et som kaster
 * PWA-en ut av minnet mens arrangøren svitsjer til meldingsappen, tok med seg
 * hele utfyllingen.
 *
 * Løsningen: et DEFINERT subset av state speiles til `sessionStorage` og
 * seedes tilbake ved neste mount. Subsettet er formet som `InitialValues` —
 * den formen `useGameFormState` allerede seeder ALL sin state fra i
 * useState-initializere. Det gir gjenoppretting uten å eksponere 40 settere,
 * og det er samtidig kompilator-sjekket: `Pick<InitialValues, …>` under gjør
 * at et feltnavn som drifter i InitialValues blir en tsc-feil her.
 *
 * Bevisste valg:
 * - `sessionStorage`, ikke localStorage: overlever reload + eviction i samme
 *   fane, men blør ikke mellom økter eller enheter. Utkast på tvers av økter
 *   har sin egen flyt («Lagre utkast» → ekte draft-rad i databasen).
 * - Ingen `beforeunload`-dialog: persistensen gjør vakten overflødig, og en
 *   «vil du virkelig forlate siden?»-boks er ren støy.
 * - TTL på 60 minutter: et oppsett du forlot i går skal ikke spøke igjen.
 * - Korrupt/ukjent payload forkastes stille — aldri en krasj, aldri et
 *   halv-gjenopprettet skjema.
 */

import type { Intent } from '@/lib/wizard/intent';
import { prizeListFromDraft } from '@/lib/games/prizes';
import type { CourseOption, InitialValues, PlayerOption } from './GameForm';
import type { GameFormState } from './useGameFormState';

/** Utkast eldre enn dette forkastes ved lesing. */
export const WIZARD_DRAFT_TTL_MS = 60 * 60 * 1000;

/**
 * Payload-versjon. Bumpes når feltsettet endres på en måte eldre payloads
 * ikke kan tolkes trygt under — en payload med annen versjon forkastes stille.
 */
export const WIZARD_DRAFT_VERSION = 1;

/**
 * Feltene fra `InitialValues` som speiles. Alt her er JSON-trygt (strenger,
 * tall, booleans, rene objekter/arrayer) — aldri funksjoner eller derivater.
 * Utelatt med vilje:
 * - `tournament_id` / `tournament_match_label` / `lock_*`: eies av ruta
 *   (cup-lenke, edit-lås), ikke av arrangørens utfylling. De inngår i
 *   kontekst-fingeravtrykket under i stedet, så et utkast fra et vanlig besøk
 *   aldri overstyrer et låst format fra en cup-lenke.
 * - `score_visibility`: uncontrolled radio i AdvancedSettingsSection, ikke
 *   state — default 'live' er alltid et gyldig utfall.
 */
export type PersistedInitialValues = Pick<
  InitialValues,
  | 'name'
  | 'course_id'
  | 'tee_box_id'
  | 'scheduled_tee_off_at'
  | 'hcp_allowance_pct'
  | 'require_peer_approval'
  | 'side_tournament_enabled'
  | 'side_ld_count'
  | 'side_ctp_count'
  | 'player_genders'
  | 'extra_players'
  | 'players'
  | 'game_mode'
  | 'team_size'
  | 'texas_team_handicap_pct'
  | 'ambrose_team_handicap_pct'
  | 'florida_team_handicap_pct'
  | 'fourball_allowance_pct'
  | 'foursomes_allowance_pct'
  | 'greensome_allowance_pct'
  | 'chapman_allowance_pct'
  | 'gruesome_allowance_pct'
  | 'round_robin_allowance_pct'
  | 'wolf_scoring'
  | 'nassau_scoring'
  | 'skins_scoring'
  | 'nines_variant'
  | 'nines_scoring'
  | 'acey_deucey_scoring'
  | 'shamble_variant'
  | 'shamble_count'
  | 'shamble_scoring'
  | 'patsome_scoring'
  | 'kr_per_unit'
  | 'entry_fee_kr'
  | 'payment_link'
  | 'prizes'
  | 'registration_mode'
  | 'registration_type'
  | 'let_friends_skip_gate'
  | 'group_id'
>;

/**
 * Hele utkastet. `values` seedes rett inn som `initialValues`; de tre andre
 * feltene har ingen plass i `InitialValues` og tres inn som egne props.
 */
export type WizardDraft = {
  /** Arrangement-valget fra steg 1. */
  intent?: Intent;
  /**
   * #373-telleren på steg 2. `null` = arrangøren trykket «Vis alle»;
   * `undefined` finnes ikke her — det ville ikke kunne skilles fra «ikke
   * lagret», og telleren har en annen default (4).
   */
  expectedPlayerCount: number | null;
  /**
   * Om arrangøren har skrevet spillnavnet selv. Uten dette ville
   * auto-navn-effekten overskrive et håndskrevet navn ved neste mount.
   */
  nameTouched: boolean;
  values: PersistedInitialValues;
};

type StoredEnvelope = {
  v: number;
  savedAt: number;
  context: string;
  draft: WizardDraft;
};

/** Nøkkel per veiviser-flate. `/admin/games/new` og `/opprett-spill` er to. */
export function wizardDraftStorageKey(pathname: string): string {
  return `wizard:${pathname}`;
}

/**
 * Fingeravtrykk av mount-konteksten. Et utkast gjenopprettes KUN når
 * konteksten er den samme.
 *
 * Hvorfor: samme sti kan mountes med helt ulike forutsetninger — en cup-lenke
 * (`?tournament_id=…`) låser formatet, en revansje-lenke (`?fra=…`) pre-fyller
 * modus og bane, en klubb-dyplenke (`?klubb=…`) scoper spillet. Uten denne
 * sjekken ville et utkast fra et vanlig besøk overstyre nettopp det låste
 * formatet cup-lenken kom for å sette.
 */
export function wizardDraftContext(input: {
  initialIntent?: Intent;
  initialValues?: Pick<
    InitialValues,
    'tournament_id' | 'game_mode' | 'lock_game_mode' | 'group_id'
  >;
  defaultGroupId?: string;
}): string {
  const iv = input.initialValues;
  return [
    input.initialIntent ?? '',
    iv?.tournament_id ?? '',
    iv?.game_mode ?? '',
    iv?.lock_game_mode ? '1' : '',
    iv?.group_id ?? input.defaultGroupId ?? '',
  ].join('|');
}

/**
 * Bygg utkastet fra live state. Ren funksjon — leser bare verdier, aldri
 * settere eller derivater.
 */
export function wizardDraftFromState({
  state,
  nameTouched,
}: {
  state: GameFormState;
  nameTouched: boolean;
}): WizardDraft {
  return {
    intent: state.intent,
    expectedPlayerCount: state.expectedPlayerCount ?? null,
    nameTouched,
    values: {
      name: state.name,
      course_id: state.courseId,
      tee_box_id: state.teeBoxId,
      scheduled_tee_off_at: state.scheduledTeeOffAt,
      hcp_allowance_pct: String(state.hcpAllowance),
      require_peer_approval: state.requirePeerApproval,
      side_tournament_enabled: state.sideEnabled,
      side_ld_count: state.sideLdCount,
      side_ctp_count: state.sideCtpCount,
      player_genders: state.playerGenders,
      extra_players: state.extraPlayers,
      players: state.selectedPlayerIds.map((pid) => ({
        user_id: pid,
        team_number: state.teamByPlayer[pid] ?? null,
        flight_number: state.flightByPlayer[pid] ?? null,
      })),
      // Kun når arrangøren FAKTISK har valgt et format: hooken utleder
      // `formatChosen` av at `game_mode` er satt, så et default-`best_ball`
      // her ville fått veiviseren til å tro at steg 2 var ferdig.
      game_mode: state.formatChosen ? state.gameMode : undefined,
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
      kr_per_unit: numericOrUndefined(state.krPerUnit),
      // Hooken leser bare beløp > 0 (tomt/0 = ingen kontingent), så vi
      // speiler samme grense i stedet for å lagre en 0-er som ikke overlever.
      entry_fee_kr: positiveOrUndefined(state.entryFeeKr),
      payment_link: state.paymentLink,
      prizes: prizeListFromDraft(state.prizeDraft),
      // Den EFFEKTIVE påmeldings-modusen (klubb-scope tvinger 'invite_only').
      // Et klubb-spill som senere løsrives mister dermed det rå valget ved
      // gjenoppretting — en akseptert forenkling: retningen er alltid mot
      // strengere tilgang, aldri løsere.
      registration_mode: state.registrationMode,
      registration_type: state.registrationType,
      let_friends_skip_gate: state.letFriendsSkipGate,
      group_id: state.groupId,
    },
  };
}

function numericOrUndefined(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function positiveOrUndefined(raw: string): number | undefined {
  const n = numericOrUndefined(raw);
  return n !== undefined && n > 0 ? n : undefined;
}

/**
 * Gjenoppretting er best-effort per felt: en bane kan være slettet, en spiller
 * fjernet fra vennelista, siden utkastet ble skrevet. Ukjente id-er droppes,
 * resten beholdes — arrangøren mister ett felt, ikke hele utfyllingen.
 */
export function reconcileWizardDraft(
  draft: WizardDraft,
  {
    courses,
    players,
  }: { courses: readonly CourseOption[]; players: readonly PlayerOption[] },
): WizardDraft {
  const values = { ...draft.values };

  const course = courses.find((c) => c.id === values.course_id);
  if (values.course_id !== undefined && values.course_id !== '' && !course) {
    // Banen finnes ikke lenger → tee-en hørte til den, så begge må gå.
    values.course_id = '';
    values.tee_box_id = '';
  } else if (
    values.tee_box_id !== undefined &&
    values.tee_box_id !== '' &&
    !course?.tee_boxes.some((t) => t.id === values.tee_box_id)
  ) {
    values.tee_box_id = '';
  }

  // Økt-gjester (#1009) er skygge-brukere opprettet server-side; de ligger
  // ikke i `players`-propen, men er gyldige spillere — derfor unionen.
  const knownIds = new Set<string>(players.map((p) => p.id));
  for (const g of values.extra_players ?? []) knownIds.add(g.id);

  if (values.players) {
    values.players = values.players.filter((row) => knownIds.has(row.user_id));
  }
  if (values.player_genders) {
    values.player_genders = Object.fromEntries(
      Object.entries(values.player_genders).filter(([pid]) => knownIds.has(pid)),
    );
  }

  return { ...draft, values };
}

// ──────────────────────────────────────────────────────────────────────
// sessionStorage-tilgangen. Alt er try/catch-et: Safari i privat modus og
// kvote-fulle lagre kaster, og et veiviser-utkast er aldri verdt en krasj.
// ──────────────────────────────────────────────────────────────────────

function storage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function saveWizardDraft(
  key: string,
  draft: WizardDraft,
  context: string,
  now: number = Date.now(),
): void {
  const store = storage();
  if (!store) return;
  const envelope: StoredEnvelope = {
    v: WIZARD_DRAFT_VERSION,
    savedAt: now,
    context,
    draft,
  };
  try {
    store.setItem(key, JSON.stringify(envelope));
  } catch {
    // Full kvote eller blokkert lagring — utfyllingen står fortsatt på skjermen.
  }
}

/**
 * Les utkastet. Returnerer `null` — og rydder nøkkelen — når payloaden er
 * korrupt, fra en annen versjon, fra en annen mount-kontekst, eller eldre enn
 * TTL-en. Aldri et unntak, aldri et halvt utkast.
 */
export function loadWizardDraft(
  key: string,
  context: string,
  now: number = Date.now(),
): WizardDraft | null {
  const store = storage();
  if (!store) return null;
  let raw: string | null = null;
  try {
    raw = store.getItem(key);
  } catch {
    return null;
  }
  if (raw === null) return null;

  const envelope = parseEnvelope(raw);
  if (!envelope || envelope.context !== context) {
    clearWizardDraft(key);
    return null;
  }
  const age = now - envelope.savedAt;
  if (age < 0 || age > WIZARD_DRAFT_TTL_MS) {
    clearWizardDraft(key);
    return null;
  }
  return envelope.draft;
}

function parseEnvelope(raw: string): StoredEnvelope | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const e = parsed as Partial<StoredEnvelope>;
  if (e.v !== WIZARD_DRAFT_VERSION) return null;
  if (typeof e.savedAt !== 'number' || !Number.isFinite(e.savedAt)) return null;
  if (typeof e.context !== 'string') return null;
  const draft = e.draft;
  if (typeof draft !== 'object' || draft === null) return null;
  if (typeof draft.values !== 'object' || draft.values === null) return null;
  return {
    v: e.v,
    savedAt: e.savedAt,
    context: e.context,
    draft: {
      intent: draft.intent,
      expectedPlayerCount:
        typeof draft.expectedPlayerCount === 'number'
          ? draft.expectedPlayerCount
          : null,
      nameTouched: draft.nameTouched === true,
      values: draft.values,
    },
  };
}

export function clearWizardDraft(key: string): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(key);
  } catch {
    // Ingenting å gjøre — neste lesing forkaster uansett på TTL/kontekst.
  }
}
