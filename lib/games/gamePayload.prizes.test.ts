/**
 * #1051 premiebord — form → GamePrize[] parsing + pruning (Type A).
 *
 * parsePrizesFromFormData leser wizardens faste hidden inputs, dropper tomme
 * premie-felt, klamper lengder, og beskjærer til gyldige slott for modusen +
 * side-counts. Bygget på ekte FormData — ingen mocks.
 */

import { describe, it, expect } from 'vitest';

import { parsePrizesFromFormData } from './gamePayload';
import {
  prizeFieldName,
  PRIZE_DESCRIPTION_MAX,
  PRIZE_SPONSOR_MAX,
  type PrizeSlotKey,
} from './prizes';

function form(
  cells: Partial<Record<PrizeSlotKey, { description?: string; sponsor?: string }>>,
): FormData {
  const fd = new FormData();
  for (const [key, cell] of Object.entries(cells)) {
    if (cell?.description != null) {
      fd.set(prizeFieldName(key as PrizeSlotKey, 'desc'), cell.description);
    }
    if (cell?.sponsor != null) {
      fd.set(prizeFieldName(key as PrizeSlotKey, 'sponsor'), cell.sponsor);
    }
  }
  return fd;
}

const FULL_SHAPE = { hasPodium: true, ldCount: 2, ctpCount: 2 };

describe('parsePrizesFromFormData', () => {
  it('builds prizes from filled slots and drops empty description slots', () => {
    const fd = form({
      placement_1: { description: 'Middag for to', sponsor: 'Klubbshoppen' },
      placement_2: { description: '', sponsor: 'Ignorert' }, // tomt premie = droppes
      ld_1: { description: 'Ny driver' },
    });
    const prizes = parsePrizesFromFormData(fd, FULL_SHAPE);
    expect(prizes).toEqual([
      { category: 'placement', position: 1, description: 'Middag for to', sponsor: 'Klubbshoppen' },
      { category: 'longest_drive', position: 1, description: 'Ny driver', sponsor: null },
    ]);
  });

  it('converts an empty sponsor to null and trims whitespace', () => {
    const fd = form({
      placement_1: { description: '  Gavekort  ', sponsor: '   ' },
    });
    expect(parsePrizesFromFormData(fd, FULL_SHAPE)[0]).toEqual({
      category: 'placement',
      position: 1,
      description: 'Gavekort',
      sponsor: null,
    });
  });

  it('clamps over-long description and sponsor to their max lengths', () => {
    const fd = form({
      placement_1: {
        description: 'x'.repeat(PRIZE_DESCRIPTION_MAX + 50),
        sponsor: 'y'.repeat(PRIZE_SPONSOR_MAX + 50),
      },
    });
    const prize = parsePrizesFromFormData(fd, FULL_SHAPE)[0];
    expect(prize.description).toHaveLength(PRIZE_DESCRIPTION_MAX);
    expect(prize.sponsor).toHaveLength(PRIZE_SPONSOR_MAX);
  });

  it('drops placement prizes when the mode has no podium (matchplay)', () => {
    const fd = form({
      placement_1: { description: 'Skal droppes' },
      ld_1: { description: 'Beholdes' },
    });
    const prizes = parsePrizesFromFormData(fd, {
      hasPodium: false,
      ldCount: 2,
      ctpCount: 2,
    });
    expect(prizes).toHaveLength(1);
    expect(prizes[0].category).toBe('longest_drive');
  });

  it('drops LD/CTP slots above the active side-counts', () => {
    const fd = form({
      ld_1: { description: 'LD1' },
      ld_2: { description: 'LD2 — over count' },
      ctp_1: { description: 'CTP1 — count 0' },
    });
    const prizes = parsePrizesFromFormData(fd, {
      hasPodium: true,
      ldCount: 1,
      ctpCount: 0,
    });
    expect(prizes.map((p) => `${p.category}:${p.position}`)).toEqual(['longest_drive:1']);
  });

  it('returns an empty list when no slots are filled', () => {
    expect(parsePrizesFromFormData(new FormData(), FULL_SHAPE)).toEqual([]);
  });
});
