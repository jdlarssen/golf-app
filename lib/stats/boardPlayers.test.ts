import { describe, it, expect } from 'vitest';
import { leftOffTheBoards } from './boardPlayers';

/** Type A (#1009, #2894): who stands on the boards. */
describe('leftOffTheBoards', () => {
  it('keeps a live, registered player', () => {
    expect(leftOffTheBoards({ is_guest: false, deleted_at: null })).toBe(false);
  });
  it('leaves out a guest', () => {
    expect(leftOffTheBoards({ is_guest: true, deleted_at: null })).toBe(true);
  });
  it('leaves out a deleted account («Slettet bruker»)', () => {
    expect(leftOffTheBoards({ is_guest: false, deleted_at: '2026-10-01T00:00:00Z' })).toBe(true);
  });
  it('keeps a row whose user join came back empty, as before', () => {
    expect(leftOffTheBoards(null)).toBe(false);
  });
});
