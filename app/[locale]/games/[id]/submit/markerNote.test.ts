import { describe, expect, it } from 'vitest';
import { markerNote, type MarkerNoteKey } from './markerNote';

// Type A (#2814): which marker line the delivery page shows in a simulator league.
const t = (key: MarkerNoteKey, values: Record<string, string>) => `${key}(${Object.values(values).join(',')})`;
const base = { fixed: null, unknownPlayer: 'Ukjent', handOver: null };

describe('markerNote', () => {
  it('is no line when nobody kept my card and I hand nothing over', () => {
    expect(markerNote(t, base)).toBeUndefined();
  });

  it('names my marker when a flightmate kept my card', () => {
    expect(markerNote(t, { ...base, fixed: { reason: 'handedOver', name: 'Ola' } })).toBe('markedBy(Ola)');
  });

  it('falls back to the unknown player for a marker without a name', () => {
    expect(markerNote(t, { ...base, fixed: { reason: 'handedOver', name: null } })).toBe('markedBy(Ukjent)');
  });

  it('names the marker who sent my card back (#2814, the owner 11.11)', () => {
    expect(markerNote(t, { ...base, fixed: { reason: 'returned', name: 'Per' } })).toBe('returnedBy(Per)');
  });

  it('says who gets a reopened card, without promising an approval', () => {
    expect(markerNote(t, { ...base, fixed: { reason: 'assigned', name: 'Per' } })).toBe('assignedTo(Per)');
  });

  it('names the one flightmate I hand a card to', () => {
    expect(markerNote(t, { ...base, handOver: { names: 'Per', count: 1 } })).toBe('handOver(Per)');
  });

  it('uses the plural for two or more', () => {
    expect(markerNote(t, { ...base, handOver: { names: 'Per og Kari', count: 2 } })).toBe('handOverMany(Per og Kari)');
  });

  it('shows both in a flight of three where both hold', () => {
    expect(markerNote(t, { ...base, fixed: { reason: 'handedOver', name: 'Ola' }, handOver: { names: 'Kari', count: 1 } })).toBe(
      'markedBy(Ola) handOver(Kari)',
    );
  });
});
