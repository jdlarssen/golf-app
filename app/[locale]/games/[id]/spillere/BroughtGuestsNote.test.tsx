import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BroughtGuestsNote } from './BroughtGuestsNote';

// Type B (#2607 hole 3, owner's answer 2): the dimmed line under a player who
// brought guests says the guests leave when the organiser removes the player.
// Every other row passes no names and gets no line.

async function note(guestNames: string[] | undefined) {
  const { container } = render(
    <>{await BroughtGuestsNote({ guestNames, playerName: 'Kari Kaptein' })}</>,
  );
  return container.textContent;
}

describe('BroughtGuestsNote', () => {
  it('under the host: the guests by name, and that they go too', async () => {
    expect(await note(['Gunn Gjest'])).toMatchInlineSnapshot(`"Meldte på Gunn Gjest. Fjerner du Kari Kaptein, går gjesten også."`);
    expect(await note(['Gunn Gjest', 'Geir Gjest'])).toMatchInlineSnapshot(`"Meldte på Gunn Gjest og Geir Gjest. Fjerner du Kari Kaptein, går gjestene også."`);
  });

  it('under everyone else: nothing', async () => {
    expect(await note(undefined)).toBe('');
    expect(await note([])).toBe('');
  });
});
