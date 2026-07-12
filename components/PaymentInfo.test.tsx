import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PaymentInfo } from './PaymentInfo';

// #1175 — one render test for the pot-anchor gating in PaymentInfo. The pot
// SUM is proven in paidPot.test.ts (Type A); here we only assert the
// presentation threshold: when does the anchor line render at all. We assert on
// a stable data-testid + the formatted amount, never the raw copy.

describe('PaymentInfo pott-anker (#1175)', () => {
  it('renders the pot anchor when potKr is at/above the fee (≥ 1 payer)', () => {
    render(
      <PaymentInfo entryFeeKr={100} paymentLink="123456" potKr={800} />,
    );
    const anchor = screen.getByTestId('payment-pot-anchor');
    expect(anchor).toHaveTextContent('800 kr');
  });

  it('hides the anchor when the pot is below the fee (pott = 0, no payers)', () => {
    render(
      <PaymentInfo entryFeeKr={100} paymentLink="123456" potKr={0} />,
    );
    expect(screen.queryByTestId('payment-pot-anchor')).not.toBeInTheDocument();
  });

  it('hides the anchor when potKr is undefined (no pot passed)', () => {
    render(<PaymentInfo entryFeeKr={100} paymentLink="123456" />);
    expect(screen.queryByTestId('payment-pot-anchor')).not.toBeInTheDocument();
  });
});
