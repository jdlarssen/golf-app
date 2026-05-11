import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsSheet } from './SettingsSheet';

describe('SettingsSheet', () => {
  it('returns null when open=false', () => {
    const { container } = render(
      <SettingsSheet
        open={false}
        mode="swipe"
        onPick={() => {}}
        onClose={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders title and both option cards when open', () => {
    render(
      <SettingsSheet
        open={true}
        mode="swipe"
        onPick={() => {}}
        onClose={() => {}}
      />,
    );
    expect(
      screen.getByText('Hvordan vil du legge inn score?'),
    ).toBeInTheDocument();
    expect(screen.getByText('Klikk og dra')).toBeInTheDocument();
    expect(screen.getByText('+ / − knapper')).toBeInTheDocument();
  });

  it('clicking the unselected option calls onPick then onClose', () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(
      <SettingsSheet
        open={true}
        mode="swipe"
        onPick={onPick}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByText('+ / − knapper'));
    expect(onPick).toHaveBeenCalledWith('buttons');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking the backdrop calls onClose', () => {
    const onClose = vi.fn();
    render(
      <SettingsSheet
        open={true}
        mode="swipe"
        onPick={() => {}}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId('settings-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking inside the sheet body does not call onClose', () => {
    const onClose = vi.fn();
    render(
      <SettingsSheet
        open={true}
        mode="swipe"
        onPick={() => {}}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId('settings-sheet'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('pressing Escape calls onClose', () => {
    const onClose = vi.fn();
    render(
      <SettingsSheet
        open
        mode="swipe"
        onPick={() => {}}
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
