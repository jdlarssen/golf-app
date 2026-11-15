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
import {
  GIR_CLAIM_SELECT,
  readRpcAnswer,
  SIDE_CLAIM_SELECT,
  toGirClaims,
  toSideClaims,
  type GirClaim,
  type GirClaimRow,
  type SideClaim,
  type SideClaimRow,
  type SideClaimWriteResult,
} from '../../../../lib/games/sideClaims';
import type { SideContestCategory } from '../../../../lib/games/sideContest';
import { currentDeviceUserId, supabase } from '../supabase';

// Typene, radmappingen og rpc-svaret bor i `lib/games/sideClaims.ts`, de samme
// nettets hullside bruker.
export type {
  GirClaim,
  SideClaim,
  SideClaimCode,
  SideClaimFailure,
  SideClaimWriteResult,
} from '../../../../lib/games/sideClaims';

// -----------------------------------------------------------------------------
// Henting
// -----------------------------------------------------------------------------

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
  return toSideClaims(data ?? []);
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
  return toGirClaims(data ?? []);
}

// -----------------------------------------------------------------------------
// Skriving
// -----------------------------------------------------------------------------

// Kodene rpc-ene svarer med når de ikke skrev noe (0237, `SideClaimCode`):
//
//  - `not_player`   — du er trukket, ikke med, eller uten flight i et større spill.
//  - `not_active`   — runden pågår ikke (avsluttet mens du sto på hullet).
//  - `no_slot`      — hullet er ikke et konkurransehull.
//  - `wrong_flight` — spilleren er ikke i flighten din.
//  - `bad_distance` — avstanden er utenfor 0,1–99,9 m, eller gjelder ikke kategorien.

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
