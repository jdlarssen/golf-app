import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { FormatGuideSheet } from './FormatGuideSheet';
import type { FormatGuideEntry } from './FormatGuideList';

// Type C: én render-test for «?»-arket, og den handler om fokus — det er den
// eneste kontrakten som ikke er ren presentasjon. Skrevet FØR migreringen til
// `useModalFocus` (#1590) nettopp for å låse oppførselen på tvers av bytte av
// implementasjon: tastaturbrukeren skal lande INNE i arket, komme ut med
// Escape, og få fokus tilbake på knappen som åpnet det.

const ENTRIES: FormatGuideEntry[] = [
  {
    key: 'stableford',
    mode: 'stableford',
    label: 'Stableford',
    summary: 'Poeng per hull.',
    points: ['Flest poeng vinner.'],
  },
];

function Harness({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      <button type="button" data-testid="guide-trigger">
        ?
      </button>
      <FormatGuideSheet open={open} entries={ENTRIES} onClose={onClose} />
    </>
  );
}

describe('FormatGuideSheet — fokus', () => {
  it('flytter fokus inn i arket, lukker på Escape og gir fokus tilbake til utløseren', () => {
    const onClose = vi.fn();
    const { rerender } = render(<Harness open={false} onClose={onClose} />);
    const trigger = screen.getByTestId('guide-trigger');
    act(() => trigger.focus());

    rerender(<Harness open={true} onClose={onClose} />);

    // Fokus lander inne i dialogen, ikke på utløseren bak den.
    const sheet = screen.getByRole('dialog');
    expect(sheet.contains(document.activeElement)).toBe(true);

    // Escape ber forelderen lukke (arket eier ikke sin egen open-state).
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    // Når forelderen faktisk lukker, går fokus tilbake dit brukeren var.
    rerender(<Harness open={false} onClose={onClose} />);
    expect(trigger).toHaveFocus();
  });
});
