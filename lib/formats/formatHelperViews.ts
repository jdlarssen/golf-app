/**
 * What the format helper on /spillformater shows for each of its 30 answers
 * (#2328), built on the server so the page needs none of the wizard's or the
 * guide's messages in the browser (#2227). The client only looks up the
 * answer it has.
 *
 * The line-up comes from the same helpers as the wizard's format cards:
 * `formatLineup` and `formatLineupText` for an exact count. For a count range
 * (5–12, 13+) there is no single line-up, so a scramble shows one team at its
 * largest size with the sizes it takes («2–4 per lag», `teamFormatLimits`),
 * a pair format one pair, and everything else four players on their own.
 *
 * Pure logic: the translators are passed in.
 */

import { formatPlayStyle, type GameMode } from '@/lib/scoring/modes/types';
import { teamSizesForMode } from '@/lib/games/teamFormatLimits';
import {
  formatLineup,
  formatLineupText,
  type FormatLineup,
  type LineupTranslator,
} from '@/lib/wizard/formatLineup';
import {
  GOALS,
  LEVELS,
  PLAYER_COUNT_BUCKETS,
  recommendFormat,
  type FormatAnswers,
} from '@/lib/formats/recommendFormat';

export type FormatHelperView = {
  mode: GameMode;
  name: string;
  /** «Lag · 2 lag à 2», «Solo · 3 spillere», or the play style alone. */
  meta: string;
  why: string;
  /** «Går ikke opp med alle antall …» or «Ingen lagformat …», else null. */
  note: string | null;
  lineup: FormatLineup;
  createHref: string;
  rulesHref: string;
  rulesAriaLabel: string;
};

export type FormatHelperTranslators = {
  /** Scoped to `formatGuide.helper`. */
  helper: (key: string, values?: Record<string, string | number>) => string;
  /** Scoped to `modes`. */
  modes: (key: string) => string;
  /** Scoped to `wizard.formatGrid.lineup`. */
  lineup: LineupTranslator;
};

export const DEFAULT_ANSWERS: FormatAnswers = { bucket: '5-12', level: 'uneven', goal: 'team' };

export function answerKey({ bucket, level, goal }: FormatAnswers): string {
  return `${bucket}|${level}|${goal}`;
}

function rangeLineup(
  mode: GameMode,
  t: FormatHelperTranslators,
): { lineup: FormatLineup; text: string | null } {
  const sizes = teamSizesForMode(mode);
  if (sizes.length > 0) {
    return {
      lineup: { kind: 'teams', teams: 1, size: Math.max(...sizes) },
      text: formatLineupText(t.lineup, { kind: 'teamSizes', sizes: [...sizes] }),
    };
  }
  const pair = formatLineup(mode, 2);
  if (pair.kind === 'teams') {
    return { lineup: pair, text: t.helper('perTeam', { size: pair.size }) };
  }
  return { lineup: { kind: 'solo', players: 4 }, text: null };
}

function buildView(answers: FormatAnswers, t: FormatHelperTranslators): FormatHelperView {
  const { mode, exactCount, fitsEveryCount, isFallback } = recommendFormat(answers);
  const { lineup, text } =
    exactCount === null
      ? rangeLineup(mode, t)
      : (() => {
          const exact = formatLineup(mode, exactCount);
          return { lineup: exact, text: formatLineupText(t.lineup, exact) };
        })();
  const style = formatPlayStyle(mode);
  const styleLabel = style === 'unknown' ? null : t.modes(`playStyle.${style}`);
  const meta = [styleLabel, text].filter((part): part is string => part !== null).join(' · ');
  const name = t.modes(mode);
  const note = isFallback ? t.helper('noTeamFormat') : fitsEveryCount ? null : t.helper('notEveryCount');
  const countParam = exactCount === null ? '' : `&antall=${exactCount}`;
  return {
    mode,
    name,
    meta,
    why: t.helper(`why.${mode}`),
    note,
    lineup,
    createHref: `/opprett-spill?format=${mode}&step=2${countParam}`,
    rulesHref: `/spillformater/${mode}`,
    rulesAriaLabel: t.helper('rulesAriaLabel', { name }),
  };
}

/** One view per answer, keyed by `answerKey`. */
export function buildFormatHelperViews(t: FormatHelperTranslators): Record<string, FormatHelperView> {
  const views: Record<string, FormatHelperView> = {};
  for (const bucket of PLAYER_COUNT_BUCKETS) {
    for (const level of LEVELS) {
      for (const goal of GOALS) {
        const answers = { bucket, level, goal };
        views[answerKey(answers)] = buildView(answers, t);
      }
    }
  }
  return views;
}
