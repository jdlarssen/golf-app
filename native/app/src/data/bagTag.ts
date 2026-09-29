// #2256: det bag-taggen trenger utover profilraden — klubben og sesongen.
//
// De to hentes side om side med `Promise.allSettled`, og hver kan feile for
// seg: uten klubb står «Tørny» som kicker, og uten sesong vises ikke flisene.
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
// Ingen cache: uten nett står profilens feillinje, som før.
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

export async function fetchBagTagExtras(userId: string, now: Date): Promise<BagTagExtras> {
  const year = now.getFullYear();
  const [club, season] = await Promise.allSettled([
    fetchFirstClubName(userId),
    fetchSeason(userId, year),
  ]);
  if (club.status === 'rejected') console.error('[bagTag] klubboppslag feilet', club.reason);
  if (season.status === 'rejected') console.error('[bagTag] sesongen feilet', season.reason);
  return {
    year,
    club: club.status === 'fulfilled' ? club.value : null,
    season: season.status === 'fulfilled' ? season.value : null,
  };
}
