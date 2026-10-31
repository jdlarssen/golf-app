import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BottomSheet } from './BottomSheet';

// Type B (docs/test-discipline.md): what the sheet renders and what closes it.
// Focus return is covered with the rows that open it (GameWizard.test.tsx, #2457).

function renderSheet(props: { open?: boolean; onClose?: () => void; onSubmit?: () => void } = {}) {
  const onClose = props.onClose ?? vi.fn();
  const onSubmit = props.onSubmit ?? vi.fn();
  render(
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <BottomSheet
        open={props.open ?? true}
        title="Handicap"
        onClose={onClose}
        doneLabel="Ferdig"
        closeLabel="Lukk"
      >
        <p>Innhold</p>
      </BottomSheet>
    </form>,
  );
  return { onClose, onSubmit };
}

describe('BottomSheet', () => {
  it('is a modal dialog named by its title', () => {
    renderSheet();
    const dialog = screen.getByRole('dialog', { name: 'Handicap' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Innhold')).toBeInTheDocument();
  });

  it('is not mounted while closed', () => {
    renderSheet({ open: false });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('Innhold')).toBeNull();
  });

  it('closes on ✕', () => {
    const { onClose } = renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Lukk' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on a tap on the backdrop, but not on a tap inside the sheet', () => {
    const { onClose } = renderSheet();
    fireEvent.click(screen.getByText('Innhold'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('bottom-sheet-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Esc', () => {
    const { onClose } = renderSheet();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on «Ferdig» without submitting the form around it', () => {
    const { onClose, onSubmit } = renderSheet();
    const done = screen.getByRole('button', { name: 'Ferdig' });
    expect(done).toHaveAttribute('type', 'button');
    fireEvent.click(done);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
