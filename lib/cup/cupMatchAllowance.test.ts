import { describe, expect, it } from 'vitest';
import {
  ALL_CUP_MATCH_FORMATS,
  cupMatchAllowance,
  type CupAllowancePcts,
} from './cupMatchAllowance';

// Type A (ren logikk). Denne fila er hjemmet for «allowancen bor ett sted»-
// invarianten (#1539/#1551): den eneste regelen som hindrer at et cup-format
// igjen får allowance både ved frysing og ved beregning.
//
// Mønster lånt fra lib/courses/teeRatingDbCheck.test.ts: en test som
// sammenligner to lag som ellers kan drive fra hverandre.

const PCTS: CupAllowancePcts = {
  fourball: 85,
  foursomes: 50,
  greensome: 100,
  chapman: 100,
  gruesome: 50,
  bestBall: 85,
};

describe('cupMatchAllowance', () => {
  describe('best_ball — allowancen bor i games.hcp_allowance_pct', () => {
    it('legger allowancen på spill-raden, ikke i mode_config', () => {
      expect(cupMatchAllowance('best_ball', PCTS)).toEqual({
        hcpAllowancePct: 85,
        modeConfigAllowancePct: null,
      });
    });

    it('følger arrangørens verdi når den avviker fra WHS-defaulten', () => {
      expect(cupMatchAllowance('best_ball', { ...PCTS, bestBall: 90 })).toEqual({
        hcpAllowancePct: 90,
        modeConfigAllowancePct: null,
      });
    });

    it('bevarer brutto (0 %) uten å falle tilbake til 100', () => {
      expect(cupMatchAllowance('best_ball', { ...PCTS, bestBall: 0 })).toEqual({
        hcpAllowancePct: 0,
        modeConfigAllowancePct: null,
      });
    });
  });

  describe('matchplay-familien — allowancen bor i mode_config', () => {
    it.each([
      ['fourball_matchplay', 85],
      ['foursomes_matchplay', 50],
      ['greensome_matchplay', 100],
      ['chapman_matchplay', 100],
      ['gruesome_matchplay', 50],
    ] as const)('%s får %i %% i mode_config og 100 på spill-raden', (format, pct) => {
      expect(cupMatchAllowance(format, PCTS)).toEqual({
        hcpAllowancePct: 100,
        modeConfigAllowancePct: pct,
      });
    });
  });

  describe('singles', () => {
    it('spilles på fullt banehandicap — ingen allowance noe sted', () => {
      expect(cupMatchAllowance('singles_matchplay', PCTS)).toEqual({
        hcpAllowancePct: 100,
        modeConfigAllowancePct: null,
      });
    });
  });

  describe('invariant: allowancen har ett hjem', () => {
    it('dekker alle sju cup-formatene', () => {
      expect(ALL_CUP_MATCH_FORMATS).toHaveLength(7);
    });

    // Kjernen i #1539/#1551. Bærer BEGGE lagene en verdi ≠ 100, anvendes
    // allowancen to ganger: én gang ved frysing av course_handicap og én gang
    // i beregningen. Det var nøyaktig feilen i Ryder Cup 2026 (85 % → ~72 %).
    it.each(ALL_CUP_MATCH_FORMATS)(
      '%s: høyst ett lag bærer en verdi ≠ 100',
      (format) => {
        const { hcpAllowancePct, modeConfigAllowancePct } = cupMatchAllowance(
          format,
          PCTS,
        );
        const layersCarryingAllowance = [
          hcpAllowancePct !== 100,
          modeConfigAllowancePct !== null && modeConfigAllowancePct !== 100,
        ].filter(Boolean).length;
        expect(layersCarryingAllowance).toBeLessThanOrEqual(1);
      },
    );

    // Samme invariant, men med arrangør-verdier der HVERT format avviker fra
    // 100 — ellers ville testen over passert på formater som tilfeldigvis har
    // 100 som WHS-default (greensome, chapman).
    it.each(ALL_CUP_MATCH_FORMATS)(
      '%s: holder invarianten også når arrangøren har satt en egen prosent',
      (format) => {
        const skewed: CupAllowancePcts = {
          fourball: 75,
          foursomes: 40,
          greensome: 90,
          chapman: 90,
          gruesome: 40,
          bestBall: 75,
        };
        const { hcpAllowancePct, modeConfigAllowancePct } = cupMatchAllowance(
          format,
          skewed,
        );
        const layersCarryingAllowance = [
          hcpAllowancePct !== 100,
          modeConfigAllowancePct !== null && modeConfigAllowancePct !== 100,
        ].filter(Boolean).length;
        expect(layersCarryingAllowance).toBeLessThanOrEqual(1);
      },
    );
  });
});
