import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Banner } from './Banner';

describe('Banner', () => {
  it('annonserer feil som alert og de andre tonene som status', () => {
    render(
      <>
        <Banner tone="error" testId="error">x</Banner>
        <Banner tone="success" testId="success">x</Banner>
        <Banner tone="info" testId="info">x</Banner>
        <Banner tone="warning" testId="warning">x</Banner>
      </>,
    );
    expect(screen.getByTestId('error')).toHaveAttribute('role', 'alert');
    for (const tone of ['success', 'info', 'warning']) {
      expect(screen.getByTestId(tone)).toHaveAttribute('role', 'status');
    }
  });
});
