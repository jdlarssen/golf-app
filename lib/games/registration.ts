// Registreringsmodus-helpers for self-påmelding (#199).
//
// To akser:
//   - registration_mode: hvem kan melde seg på (invite_only / manual_approval / open)
//   - registration_type: hva man melder på (solo / team / both)
//
// Speilar DB-enumene fra migrasjon 0040. Holdt utenfor scoring-modulene fordi
// dette er en form-/admin-konsept som ikke berører scoring-pipeline.

import {
  formatPlayStyle,
  isMatchplayFamily,
  type GameMode,
} from '@/lib/scoring/modes/types';

export type RegistrationMode = 'invite_only' | 'manual_approval' | 'open';
export type RegistrationType = 'solo' | 'team' | 'both';

export const REGISTRATION_MODES: readonly RegistrationMode[] = [
  'invite_only',
  'manual_approval',
  'open',
] as const;

export const REGISTRATION_TYPES: readonly RegistrationType[] = [
  'solo',
  'team',
  'both',
] as const;

/**
 * Hvorvidt en gitt scoring-modus tar generisk lag-påmelding (registration_type
 * 'team' eller 'both' gir mening). Avledet av den kanoniske spillestil-
 * klassifiseringen i stedet for en hardkodet liste (#640 item 5): et format
 * som er `formatPlayStyle === 'team'` har et lag-grid hvor admin fordeler lag
 * i steg 4 — best ball, hele scramble-familien (Texas/Ambrose/Florida),
 * shamble og patsome — og alle disse kan ta lag-påmelding.
 *
 * Matchplay-familien er også `'team'` (2v2-variantene), men holdes UTE her:
 * der gjøres lag-påmelding via sider (`matchplaySides`, #544), ikke den
 * generiske team-registreringen. `isMatchplayFamily`-ekskluderingen sikrer
 * at vi ikke regresserer den flyten.
 *
 * Solo-/individuell-formater (solo slagspill, Wolf, Nassau, Skins, singles-
 * matchplay) og stableford-familien (`flexible` — par-stableford krever at vi
 * vet team-strukturen ved registrering, så lag-påmelding er ikke åpnet der)
 * faller utenfor `'team'` og returnerer dermed false.
 */
export function gameModeSupportsTeams(mode: GameMode): boolean {
  return formatPlayStyle(mode) === 'team' && !isMatchplayFamily(mode);
}

export function isRegistrationMode(v: unknown): v is RegistrationMode {
  return v === 'invite_only' || v === 'manual_approval' || v === 'open';
}

/**
 * Hvorvidt et spill med denne påmeldingsmåten dukker opp i «Finn turneringer»
 * (#357): `open` + `manual_approval` er oppdagbare, `invite_only` er privat.
 * Påmeldingsmåten ER synligheten (flyt 2) — ingen egen synlighets-bryter.
 *
 * MÅ speile filteret i `getDiscoverableGames` (`.in('registration_mode',
 * ['open','manual_approval'])`). Endrer du det ene, endre det andre — denne
 * helperen er kilden wizard-en bruker for å vise «Oppdagbar»/«Privat».
 */
export function isDiscoverableRegistrationMode(mode: RegistrationMode): boolean {
  return mode === 'open' || mode === 'manual_approval';
}

export function isRegistrationType(v: unknown): v is RegistrationType {
  return v === 'solo' || v === 'team' || v === 'both';
}

// Tekstgrensene i påmeldingen (#2222): ett hjem for skjemaet, server-actionen
// og DB-sperrene på `game_registration_requests` (0042: `team_captain_has_name`,
// `message_length`, `rejection_reason_length`). `registrationDbCheck.test.ts`
// holder dem like, også tallene i feilmeldingene. Eksporteres herfra og ikke
// fra en fil med 'use client' eller 'use server': der blir en eksport en
// referanse, ikke et tall.

/** Lagnavnet til en lagkaptein: minst så mange tegn. */
export const TEAM_NAME_MIN = 3;
/** Lagnavnet til en lagkaptein: maks så mange tegn. */
export const TEAM_NAME_MAX = 40;
/** Hilsenen en søker kan legge ved påmeldingen. */
export const REGISTRATION_MESSAGE_MAX = 200;
/** Grunnen arrangøren kan gi når en påmelding avslås. */
export const REJECTION_REASON_MAX = 200;
