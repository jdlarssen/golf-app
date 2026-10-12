import { describe, it, expect } from 'vitest';
import { readVar, ROOT, DARK_MEDIA, DARK_ATTR } from './cssTokens';

/**
 * Type A (#2287) — the 404 page's hole scene draws with seven `--ob-*` tokens.
 * By day they are the artboard's hex values («Forslag: out of bounds» on the
 * design canvas), so the scene is identical to the drawing. The canvas has no
 * night drawing, so the night values come from the existing palette. `--ob-ink`
 * cannot keep its day value at night: the pin tops stand against the sky
 * (`--bg` #14201a), where #1a2e1f measures 1,16:1 and the tops disappear.
 *
 * The rule has one home (AGENTS.md trap 4): globals.css. This test locks it
 * there, in all three blocks.
 */
const TOKENS = [
  ['ob-rough', '#dfe8df', '#1c2a22'],
  ['ob-rough-edge', '#cfdccf', '#243429'],
  ['ob-fairway', '#b9ccb9', '#2f4734'],
  ['ob-white', '#ffffff', '#ffffff'],
  ['ob-ink', '#1a2e1f', '#9a9180'],
  ['ob-ball-line', '#9a8f7c', '#9a9180'],
  ['ob-dimple', '#cfc7b3', '#cfc7b3'],
] as const;

describe('--ob-* tokens for the hole scene (#2287)', () => {
  it.each(TOKENS)('--%s is %s by day and %s at night', (token, day, night) => {
    expect(readVar(ROOT, token)).toBe(day);
    expect(readVar(DARK_MEDIA, token)).toBe(night);
    expect(readVar(DARK_ATTR, token)).toBe(night);
  });
});
