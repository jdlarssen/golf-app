// #2283: sidekonkurransen på hullet — det flighten melder inn om nærmest pinnen,
// lengste drive og GIR.
//
// Innmeldingene bor bare på serveren, som wolf- og BBB-valgene (`choices.ts`):
// ingen SQLite, ingen sync-kø. De meldes inn stående på hullet, med nett. Uten
// nett er knappene sperret, og arrangøren kårer uansett vinneren til slutt.
//
// Tre valg bærer fila:
//
//  1. **Lesingen går under RLS.** Begge tabellene har én SELECT-policy: raden
//     står i din flight (`side_claim_flight_key`, 0237). Appen sender ingen
//     flightnøkkel selv, og kan derfor ikke se en annen flights svar.
//  2. **Skrivingen går bare gjennom rpc-ene.** `record_side_claim` og
//     `record_gir_claims` er eneste skrivevei; tabellene har ingen skrivepolicy.
//     Rpc-en svarer `ok` bare når den skrev radene den ble bedt om, ellers en
//     kode. Alt annet enn `ok` er en feil (trap 2: stille suksess finnes ikke).
//  3. **Henting KASTER ved feil.** Tom liste betyr «ingen har meldt inn»; et
//     kast betyr «vi vet ikke», og da sier raden «Fikk ikke hentet» i stedet for
//     «Meld inn».
//
// Nettets hullside leser de samme tabellene uten cache, så appen trenger ingen
// `refreshWebCache` etter en skriving.
import type { SideContestCategory } from '../../../../lib/games/sideContest';
import { currentDeviceUserId, supabase } from '../supabase';

// -----------------------------------------------------------------------------
// Henting
// -----------------------------------------------------------------------------

const SIDE_CLAIM_SELECT = 'category, hole_number, winner_user_id, distance_m, entered_by, updated_at';
const GIR_CLAIM_SELECT = 'hole_number, user_id, hit, entered_by, updated_at';

/** Rå PostgREST-fasong. `distance_m` er `numeric(3,1)`. */
interface SideClaimRow {
  category: string;
  hole_number: number;
  winner_user_id: string | null;
  distance_m: number | string | null;
  entered_by: string;
  updated_at: string;
}

interface GirClaimRow {
  hole_number: number;
  user_id: string;
  hit: boolean;
  entered_by: string;
  updated_at: string;
}

/** Flightens svar for én kategori på ett hull. `winnerUserId: null` = «Ingen på …». */
export interface SideClaim {
  category: SideContestCategory;
  holeNumber: number;
  winnerUserId: string | null;
  distanceM: number | null;
  enteredBy: string;
  updatedAt: string;
}

/** Én spillers GIR på ett hull. Ingen rad = ikke meldt inn; `hit: false` = bommet. */
export interface GirClaim {
  holeNumber: number;
  userId: string;
  hit: boolean;
  enteredBy: string;
  updatedAt: string;
}

function isSideCategory(category: string): category is SideContestCategory {
  return category === 'closest_to_pin' || category === 'longest_drive';
}

/**
 * Flightens svar om nærmest pinnen og lengste drive på hullet.
 *
 * @throws {Error} når spørringen feiler. Tom liste er et gyldig svar.
 */
export async function fetchSideClaims(gameId: string, holeNumber: number): Promise<SideClaim[]> {
  const { data, error } = await supabase
    .from('game_side_claims')
    .select(SIDE_CLAIM_SELECT)
    .eq('game_id', gameId)
    .eq('hole_number', holeNumber)
    .returns<SideClaimRow[]>();

  if (error) throw new Error(`fetchSideClaims: ${error.message}`);

  return (data ?? []).flatMap((row) => {
    // CHECK-en holder kategorien innenfor de to; en ukjent hoppes over.
    if (!isSideCategory(row.category)) return [];
    const distance = row.distance_m == null ? null : Number(row.distance_m);
    return [
      {
        category: row.category,
        holeNumber: row.hole_number,
        winnerUserId: row.winner_user_id,
        distanceM: distance != null && Number.isFinite(distance) ? distance : null,
        enteredBy: row.entered_by,
        updatedAt: row.updated_at,
      },
    ];
  });
}

/**
 * Flightens GIR på hullet, én rad per spiller som er meldt inn.
 *
 * @throws {Error} når spørringen feiler. Tom liste er et gyldig svar.
 */
export async function fetchGirClaims(gameId: string, holeNumber: number): Promise<GirClaim[]> {
  const { data, error } = await supabase
    .from('game_gir_claims')
    .select(GIR_CLAIM_SELECT)
    .eq('game_id', gameId)
    .eq('hole_number', holeNumber)
    .returns<GirClaimRow[]>();

  if (error) throw new Error(`fetchGirClaims: ${error.message}`);

  return (data ?? []).map((row) => ({
    holeNumber: row.hole_number,
    userId: row.user_id,
    hit: row.hit,
    enteredBy: row.entered_by,
    updatedAt: row.updated_at,
  }));
}

// -----------------------------------------------------------------------------
// Skriving
// -----------------------------------------------------------------------------

/**
 * Kodene rpc-ene svarer med når de ikke skrev noe (0237):
 *
 *  - `not_player`   — du er trukket, ikke med, eller uten flight i et større spill.
 *  - `not_active`   — runden pågår ikke (avsluttet mens du sto på hullet).
 *  - `no_slot`      — hullet er ikke et konkurransehull.
 *  - `wrong_flight` — spilleren er ikke i flighten din.
 *  - `bad_distance` — avstanden er utenfor 0,1–99,9 m, eller gjelder ikke kategorien.
 */
export type SideClaimCode = 'not_player' | 'not_active' | 'no_slot' | 'wrong_flight' | 'bad_distance';

const CODES: readonly SideClaimCode[] = ['not_player', 'not_active', 'no_slot', 'wrong_flight', 'bad_distance'];

/**
 * Hvorfor en innmelding ikke ble lagret. `db_error` er alt rpc-en ikke svarte
 * på: nettbrudd, serverfeil, et svar vi ikke kjenner. Svaret til spilleren er
 * da «prøv igjen».
 */
export type SideClaimFailure = SideClaimCode | 'not_authenticated' | 'db_error';

export type SideClaimWriteResult = { ok: true } | { ok: false; error: SideClaimFailure };

function readRpcAnswer(result: { data: unknown; error: unknown }): SideClaimWriteResult {
  if (result.error) return { ok: false, error: 'db_error' };
  if (result.data === 'ok') return { ok: true };
  const code = CODES.find((c) => c === result.data);
  return { ok: false, error: code ?? 'db_error' };
}

export interface SideClaimWrite {
  gameId: string;
  category: SideContestCategory;
  holeNumber: number;
  /** `null` = «Ingen på green/fairway». */
  winnerUserId: string | null;
  /** Bare for nærmest pinnen med en vinner. Rundes til én desimal i rpc-en. */
  distanceM: number | null;
}

/** Lagre flightens svar for én kategori på hullet. Siste trykk gjelder. */
export async function recordSideClaim(input: SideClaimWrite): Promise<SideClaimWriteResult> {
  if (!(await currentDeviceUserId())) return { ok: false, error: 'not_authenticated' };
  try {
    return readRpcAnswer(
      await supabase.rpc('record_side_claim', {
        p_game_id: input.gameId,
        p_category: input.category,
        p_hole_number: input.holeNumber,
        // Begge er nullbare i rpc-en; den genererte arg-typen er non-null, derav castene.
        p_winner_user_id: input.winnerUserId as string,
        p_distance_m: input.distanceM as number,
      }),
    );
  } catch {
    return { ok: false, error: 'db_error' };
  }
}

export interface GirClaimWrite {
  gameId: string;
  holeNumber: number;
  /** Spillerne på ballen (én, eller begge på en foursomes-side), eller hele kampen. */
  userIds: readonly string[];
  hit: boolean;
}

/**
 * Lagre GIR for én ball, eller «Ingen traff greenen» for hele kampen. Rpc-en
 * skriver alle radene eller ingen.
 */
export async function recordGirClaims(input: GirClaimWrite): Promise<SideClaimWriteResult> {
  if (!(await currentDeviceUserId())) return { ok: false, error: 'not_authenticated' };
  try {
    return readRpcAnswer(
      await supabase.rpc('record_gir_claims', {
        p_game_id: input.gameId,
        p_hole_number: input.holeNumber,
        p_user_ids: [...input.userIds],
        p_hit: input.hit,
      }),
    );
  } catch {
    return { ok: false, error: 'db_error' };
  }
}
