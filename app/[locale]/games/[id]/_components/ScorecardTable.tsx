import { getTranslations } from 'next-intl/server';
import { ParAsideInline } from './ParAsideInline';
import { ScoreShape } from '@/components/scoring/ScoreShape';
import { scoreShape } from '@/lib/scoring/scoreShape';
import { scoreTone } from '@/lib/scoring/scoreTone';
import { parForPlayer, type HoleParByGender } from '@/lib/games/parDisplay';
import { isHoleInSegment } from '@/lib/games/holeScope';
import type { HoleSegment } from '@/lib/scoring';
import type { ScoringGender } from '@/lib/scoring/modes/types';

export type ScorecardHole = {
  hole_number: number;
  par_mens: number;
  par_ladies: number;
  par_juniors: number;
  stroke_index: number;
};

/**
 * The per-hole scorecard table shown when reviewing a player's submitted
 * card. Extracted from /games/[id]/approve (#1586) so the Sekretariatet and
 * creator approval lists render the exact same card. Filters holes by the
 * game's segment itself (#1441) — callers may pass the full hole list.
 */
export async function ScorecardTable({
  holes,
  scores,
  teeGender,
  holeSegment,
}: {
  holes: ScorecardHole[];
  scores: ReadonlyMap<number, number | null>;
  teeGender: ScoringGender;
  holeSegment: HoleSegment;
}) {
  const t = await getTranslations('game.approve');
  const segmentHoles = holes.filter((h) =>
    isHoleInSegment(h.hole_number, holeSegment),
  );

  return (
    <div className="overflow-x-auto mt-3 -mx-2">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left">
            <th className="px-2 py-1.5 text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted">
              {t('colHole')}
            </th>
            <th className="px-2 py-1.5 text-right text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted">
              {t('colPar')}
            </th>
            <th className="px-2 py-1.5 text-right text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted">
              {t('colSi')}
            </th>
            <th className="px-2 py-1.5 text-right text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted">
              {t('colStrokes')}
            </th>
          </tr>
        </thead>
        <tbody>
          {segmentHoles.map((h) => {
            const s = scores.get(h.hole_number) ?? null;
            // Eierens (kortets) egen par — ikke seerens. På avvikshull ser
            // admin/flight-mate dermed dame-/junior-par der det gjelder, og
            // slag rendres mot riktig referanse. #252.
            const parByGender: HoleParByGender = {
              mens: h.par_mens,
              ladies: h.par_ladies,
              juniors: h.par_juniors,
            };
            const ownerPar = parForPlayer(parByGender, teeGender);
            return (
              <tr key={h.hole_number} className="border-t border-border">
                <td className="score-num px-2 py-1.5 text-text">
                  {h.hole_number}
                </td>
                <td className="score-num px-2 py-1.5 text-right text-muted">
                  {ownerPar}
                  <ParAsideInline
                    parByGender={parByGender}
                    playerGender={teeGender}
                  />
                </td>
                <td className="score-num px-2 py-1.5 text-right text-muted">
                  {h.stroke_index}
                </td>
                <td className="score-num px-2 py-1.5 text-right text-text">
                  <ScoreShape
                    shape={scoreShape(s, ownerPar)}
                    tone={scoreTone(s, ownerPar)}
                    size="sm"
                  >
                    {s ?? '—'}
                  </ScoreShape>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
