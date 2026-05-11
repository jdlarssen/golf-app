import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SyncStatusLine } from './SyncStatusLine';

describe('SyncStatusLine', () => {
  it('syncing=true renders Sender… and amber dot', () => {
    render(<SyncStatusLine syncing={true} savedAt="" />);
    expect(screen.getByText('Sender…')).toBeInTheDocument();
    const dot = screen.getByTestId('sync-dot');
    expect(dot.style.background).toBe('rgb(216, 155, 58)');
  });

  it('syncing=false with savedAt="14:32" renders Lagret · 14:32 and green dot', () => {
    render(<SyncStatusLine syncing={false} savedAt="14:32" />);
    expect(screen.getByText('Lagret · 14:32')).toBeInTheDocument();
    const dot = screen.getByTestId('sync-dot');
    expect(dot.style.background).toBe('rgb(74, 124, 89)');
  });

  it('syncing=false with empty savedAt renders Lagret nylig fallback', () => {
    render(<SyncStatusLine syncing={false} savedAt="" />);
    expect(screen.getByText('Lagret nylig')).toBeInTheDocument();
  });
});
