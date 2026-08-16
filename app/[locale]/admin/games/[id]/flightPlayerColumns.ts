import type { Database } from '@/lib/database.types';

/**
 * Kolonne-konstanter for `game_players`-spørringene i `flightActions.ts`.
 *
 * Egen fil, ikke `'use server'`: en fil med det direktivet kan bare eksportere
 * async-funksjoner, så konstantene kan ikke bo sammen med actionene.
 *
 * Hvorfor de finnes: #1669 fant at «Foreslå inndeling» alltid feilet med
 * PostgREST 42703 fordi spørringen sorterte på `created_at` — en kolonne
 * `game_players` ikke har. Strenglitteraler i `.select()`/`.order()` er usynlige
 * for tsc, og test-stubben godtar hva som helst, så feilen kunne bare oppdages i
 * prod. `satisfies readonly GamePlayerColumn[]` gjør kolonnenavnene til en
 * typesjekk mot den genererte `Database`-typen: skriver noen et navn som ikke
 * finnes på tabellen, blir bygget rødt i stedet for kjøringen.
 */
type GamePlayerColumn =
  keyof Database['public']['Tables']['game_players']['Row'];

/** Kolonnene `fetchFlightPlayers` leser (flight-inndeling). */
export const FLIGHT_PLAYER_SELECT = [
  'user_id',
  'flight_number',
  'withdrawn_at',
  'accepted_at',
] as const satisfies readonly GamePlayerColumn[];

/**
 * Kolonnene `fetchTeamPlayers` leser (lag-inndeling). Samme sett pluss
 * `team_number`; `accepted_at` er ikke med — den brukes kun til sortering,
 * og PostgREST tillater `order` på en kolonne som ikke selektes.
 */
export const FLIGHT_TEAM_SELECT = [
  'user_id',
  'team_number',
  'flight_number',
  'withdrawn_at',
] as const satisfies readonly GamePlayerColumn[];

/**
 * Sorteringen begge spørringene bruker: påmeldingsrekkefølge
 * (`accepted_at` ASC, uaksepterte sist), så `user_id` for determinisme.
 */
export const FLIGHT_PLAYER_ORDER = [
  'accepted_at',
  'user_id',
] as const satisfies readonly GamePlayerColumn[];
