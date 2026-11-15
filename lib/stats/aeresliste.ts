/**
 * Æreslista (#2894 PR 2): every hole-in-one and albatross in Tørny, all years. Pure, so the
 * shaping is tested without a database; `getRareShotsAllTime.ts` reads the rounds and
 * `/api/aeresliste` is the port.
 *
 * Privacy as on the Toppliste (#1022, #1193): names go out as «Marte L.», and no user id,
 * game id, strokes per hole or tee leaves the server. A player who has turned off «Del
 * sjeldne slag med alle» (`share_rare_shots`, 0238) is not on the list, not even for
 * themselves. Eagle is never on it (the owner's answer 1: hole-in-one and albatross).
 */
import { createHash } from 'node:crypto';
import { nameInitials } from '@/lib/names/initials';
import { formatPublicName } from '@/lib/names/formatPublicName';
import { RARE_MOMENT_ORDER } from '@/lib/stats/achievementMarks';
import type { RareMoment } from '@/lib/stats/rareMoments';

/** The two kinds the list (and the banner) shows. */
export type AereslisteKind = 'hole_in_one' | 'albatross';

/** One shot on the list. WIRE (frozen, the app mirrors it): no ids of any kind. */
export type AereslisteRow = {
  kind: AereslisteKind;
  name: string;
  initials: string;
  isViewer: boolean;
  hole: number;
  courseName: string | null;
  /** The day the round was played, `YYYY-MM-DD` on the Oslo calendar. */
  playedOn: string;
  /**
   * Opaque and stable per shot: the banner remembers a closed shot by it, so a new shot
   * gives a new banner. A one-way hash, so it carries no id the client can use.
   */
  key: string;
};

/** What `/api/aeresliste` sends: newest first, the newest is the list's top card and the banner. */
export type AereslisteView = { rows: AereslisteRow[] };

export function isAereslisteKind(kind: string): kind is AereslisteKind {
  return kind === 'hole_in_one' || kind === 'albatross';
}

export function shotKey(m: Pick<RareMoment, 'userId' | 'playedOn' | 'hole' | 'courseName' | 'kind'>): string {
  return createHash('sha256')
    .update(`${m.userId}|${m.playedOn}|${m.hole}|${m.courseName ?? ''}|${m.kind}`)
    .digest('hex')
    .slice(0, 16);
}

export function buildAeresliste(input: {
  moments: readonly RareMoment[];
  /** Players who said no to «Del sjeldne slag med alle». */
  optOuts: ReadonlySet<string>;
  viewerUserId: string;
  names: ReadonlyMap<string, string>;
  nicknames: ReadonlyMap<string, string>;
}): AereslisteView {
  const rows = input.moments.flatMap((m): AereslisteRow[] => {
    if (!isAereslisteKind(m.kind) || input.optOuts.has(m.userId)) return [];
    const name = formatPublicName({
      name: input.names.get(m.userId) ?? null,
      nickname: input.nicknames.get(m.userId) ?? null,
    });
    if (!name) return [];
    return [
      {
        kind: m.kind,
        name,
        initials: nameInitials(name),
        isViewer: m.userId === input.viewerUserId,
        hole: m.hole,
        courseName: m.courseName,
        playedOn: m.playedOn,
        key: shotKey(m),
      },
    ];
  });
  // Newest first, whatever the kind (the drawing, group 12); ties: the rarer kind, then name, hole.
  rows.sort(
    (a, b) =>
      b.playedOn.localeCompare(a.playedOn) ||
      RARE_MOMENT_ORDER.indexOf(a.kind) - RARE_MOMENT_ORDER.indexOf(b.kind) ||
      a.name.localeCompare(b.name, 'nb') ||
      a.hole - b.hole,
  );
  return { rows };
}
