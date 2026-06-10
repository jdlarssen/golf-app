// Pure derive-helpers for /admin/courses-listen. Holdt isolert fra
// `page.tsx` slik at vitest kan importere uten å dra med server-deps
// (`getServerClient`, react cache, etc.).

export type CourseGameRow = {
  status: 'draft' | 'scheduled' | 'active' | 'finished';
  scheduled_tee_off_at: string | null;
  ended_at: string | null;
};

export type CourseTeeRow = {
  slope_ladies: number | null;
  course_rating_ladies: number | null;
  slope_juniors: number | null;
  course_rating_juniors: number | null;
  archived_at: string | null;
};

export type CourseRow = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  tee_boxes: CourseTeeRow[];
  games: CourseGameRow[];
};

// «Sist spilt» = MAX(dato) over:
//   - finished spill: ended_at (fallback til scheduled_tee_off_at hvis null)
//   - active spill: scheduled_tee_off_at
//   - draft + scheduled: ignoreres (ikke historisk spilt)
// Returnerer null hvis ingen spill kvalifiserer.
export function deriveLastPlayedAt(games: CourseGameRow[]): string | null {
  const candidates: string[] = [];
  for (const g of games) {
    if (g.status === 'finished') {
      const d = g.ended_at ?? g.scheduled_tee_off_at;
      if (d !== null) candidates.push(d);
    } else if (g.status === 'active') {
      if (g.scheduled_tee_off_at !== null) candidates.push(g.scheduled_tee_off_at);
    }
  }
  if (candidates.length === 0) return null;
  return candidates.reduce((max, d) => (d > max ? d : max));
}

export function deriveCourseItem(c: CourseRow) {
  const activeTees = c.tee_boxes.filter((t) => t.archived_at === null);
  return {
    id: c.id,
    name: c.name,
    created_at: c.created_at,
    updated_at: c.updated_at,
    tee_count: activeTees.length,
    has_ladies_tee: activeTees.some(
      (t) => t.slope_ladies !== null && t.course_rating_ladies !== null,
    ),
    has_juniors_tee: activeTees.some(
      (t) => t.slope_juniors !== null && t.course_rating_juniors !== null,
    ),
    active_game_count: c.games.filter(
      (g) => g.status === 'active' || g.status === 'scheduled',
    ).length,
    last_played_at: deriveLastPlayedAt(c.games),
  };
}
