// #2256: det bag-taggen trenger utover profilraden — klubben, sesongen og
// handicap-kurven.
//
// De tre hentes side om side med `Promise.allSettled`, og hver kan feile for
// seg: uten klubb står «Tørny» som kicker, uten sesong vises ikke flisene, og
// uten kurve står «Oppdatert …» under handicapet.
// Kortet selv (navn og handicap) kommer fra `fetchOwnProfile` og venter aldri
// på dette.
//
// **Klubben** er den første klubben spilleren ble med i (`joined_at`), samme
// rekkefølge som webbens `getMyClubs`. Medlemmet ser sine egne
// `group_members`-rader og klubbene de peker på (RLS, 0074), så anon-klienten
// leser selv.
//
// **Sesongen** regnes fra runde-lista (`data/roundHistory.ts`) med
// `computeProfileSeason`, samme regel som webbens sesongoppsummering. Året er
// enhetens lokaltid.
//
// **Kurven** leses fra `handicap_history` (0195), der spilleren bare ser sine
// egne rader (RLS). Tabellen har én rad per endring, så lista er kort.
// `seasonHandicapTrend` gir `null` under to punkter; da står «Oppdatert …»
// som før. Før migrasjonen er i basen feiler lesingen, med samme utfall.
//
// Ingen cache: uten nett står profilens feillinje, som før.
import {
  seasonHandicapTrend,
  type HandicapTrend,
} from '../../../../lib/stats/handicapTrend';
import {
  computeProfileSeason,
  type ProfileSeason,
} from '../../../../lib/stats/profileSeason';
import { supabase } from '../supabase';
import { fetchRoundHistory } from './roundHistory';

export interface BagTagExtras {
  /** Sesongåret flisene gjelder (enhetens lokaltid). */
  year: number;
  /** Den første klubben, eller `null` (ingen klubb, eller oppslaget feilet). */
  club: string | null;
  /** `null` når runde-lista ikke kunne leses — da vises ikke flisene. */
  season: ProfileSeason | null;
  /** Sesongens handicap-kurve, eller `null` (under to punkter, eller feil). */
  trend: HandicapTrend | null;
}

type GroupEmbed = { name: string | null } | { name: string | null }[] | null;

async function fetchFirstClubName(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('group_members')
    .select('joined_at, groups(name)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: true })
    .limit(1)
    .returns<{ joined_at: string; groups: GroupEmbed }[]>();
  if (error) throw new Error(error.message);
  // PostgREST typer en fremmednøkkel-join som liste selv når den er én til én
  // (samme normalisering som `getMyClubs`).
  const embed = data?.[0]?.groups ?? null;
  const group = Array.isArray(embed) ? (embed[0] ?? null) : embed;
  return group?.name?.trim() || null;
}

async function fetchSeason(userId: string, year: number): Promise<ProfileSeason> {
  const rounds = await fetchRoundHistory(userId, { year });
  return computeProfileSeason(
    rounds.map((round) => ({
      year: round.year,
      completeBrutto: round.completeBrutto,
      resultSummary: round.resultSummary,
    })),
    year,
  );
}

async function fetchHandicapTrend(userId: string, year: number): Promise<HandicapTrend | null> {
  const { data, error } = await supabase
    .from('handicap_history')
    .select('hcp_index, recorded_at')
    .eq('user_id', userId)
    .order('recorded_at', { ascending: true })
    .returns<{ hcp_index: number | string; recorded_at: string }[]>();
  if (error) throw new Error(error.message);
  return seasonHandicapTrend(
    (data ?? []).map((row) => ({ hcpIndex: Number(row.hcp_index), recordedAt: row.recorded_at })),
    year,
  );
}

export async function fetchBagTagExtras(userId: string, now: Date): Promise<BagTagExtras> {
  const year = now.getFullYear();
  const [club, season, trend] = await Promise.allSettled([
    fetchFirstClubName(userId),
    fetchSeason(userId, year),
    fetchHandicapTrend(userId, year),
  ]);
  if (club.status === 'rejected') console.error('[bagTag] klubboppslag feilet', club.reason);
  if (season.status === 'rejected') console.error('[bagTag] sesongen feilet', season.reason);
  if (trend.status === 'rejected') console.error('[bagTag] handicap-kurven feilet', trend.reason);
  return {
    year,
    club: club.status === 'fulfilled' ? club.value : null,
    season: season.status === 'fulfilled' ? season.value : null,
    trend: trend.status === 'fulfilled' ? trend.value : null,
  };
}
