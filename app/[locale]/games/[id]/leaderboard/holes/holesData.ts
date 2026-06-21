import { cache } from 'react';
import { notFound } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { COURSE_HOLES_SELECT, SCORES_SELECT } from '@/lib/supabase/queryFragments';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import {
  getGameWithPlayers,
  type GameForHole,
} from '@/lib/games/getGameWithPlayers';
import { localizeGameName } from '@/lib/games/autoGameName';
import type { AppLocale } from '@/i18n/routing';

export type CourseHoleRow = {
  hole_number: number;
  par_mens: number;
  par_ladies: number;
  par_juniors: number;
  stroke_index: number;
};

export type ScoreRow = {
  user_id: string;
  hole_number: number;
  strokes: number | null;
};

export const getDrilldownContext = cache(async () => {
  const supabase = await getServerClient();
  const userId = await getProxyVerifiedUserId();
  return { supabase, userId };
});

type DrilldownSupabase = Awaited<
  ReturnType<typeof getDrilldownContext>
>['supabase'];

/**
 * #624 — re-lokaliser det frosne, auto-genererte spillnavnet ved visning.
 * Banenavnet hentes slankt (den cachede `getGameWithPlayers` joiner bevisst
 * ikke courses). `getDrilldownContext` er `cache()`-wrappet, så context-kallet
 * er gratis innen requesten; kun én bane-PK-oppslag legges til, og bare den
 * ene modus-grenen som faktisk rendres kjører den. Norsk visning er byte-
 * identisk (helperen returnerer tidlig for 'no').
 */
export async function localizeHolesGameName(game: GameForHole): Promise<string> {
  const [{ supabase }, locale] = await Promise.all([
    getDrilldownContext(),
    getLocale(),
  ]);
  const courseRes = game.course_id
    ? await supabase
        .from('courses')
        .select('name')
        .eq('id', game.course_id)
        .maybeSingle<{ name: string }>()
    : { data: null as { name: string } | null };
  return localizeGameName(
    game.name,
    courseRes.data?.name ?? null,
    locale as AppLocale,
  );
}

/**
 * Delt rå-datahenting for «Hull for hull»-format-modulene (#714). Tidligere
 * gjentok hver `XHolesBody` denne `course_holes` + `scores`-fetchen inline
 * (×10 identiske blokker). Konsolidert til ett kall-sted — samme rekkefølge,
 * samme feilhåndtering, samme `notFound()`-på-manglende-gwp som før. Formater
 * som trenger ekstra data (Wolf → wolf_hole_choices, BBB → bbb_holes) henter
 * det parallelt i sin egen modul. Spillere kommer fra den tag-cachede
 * `getGameWithPlayers` (cache-hit — ytre side varmet den allerede); holes +
 * scores er direkte-fetcher.
 */
export async function fetchHolesAndScores(
  supabase: DrilldownSupabase,
  gameId: string,
  courseId: string,
): Promise<{
  gwp: NonNullable<Awaited<ReturnType<typeof getGameWithPlayers>>>;
  rawHoles: CourseHoleRow[];
  rawScores: ScoreRow[];
}> {
  const [gwp, rawHolesRes, rawScoresRes] = await Promise.all([
    getGameWithPlayers(gameId),
    supabase
      .from('course_holes')
      .select(COURSE_HOLES_SELECT)
      .eq('course_id', courseId)
      .order('hole_number', { ascending: true })
      .returns<CourseHoleRow[]>(),
    supabase
      .from('scores')
      .select(SCORES_SELECT)
      .eq('game_id', gameId)
      .returns<ScoreRow[]>(),
  ]);

  if (!gwp) notFound();
  if (rawHolesRes.error) throw rawHolesRes.error;
  if (rawScoresRes.error) throw rawScoresRes.error;

  return {
    gwp,
    rawHoles: rawHolesRes.data ?? [],
    rawScores: rawScoresRes.data ?? [],
  };
}
