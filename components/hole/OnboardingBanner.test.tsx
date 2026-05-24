import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OnboardingBanner } from './OnboardingBanner';

describe('OnboardingBanner', () => {
  it('returns null when visible=false', () => {
    const { container } = render(
      <OnboardingBanner visible={false} onDismiss={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders banner content when visible=true', () => {
    render(<OnboardingBanner visible={true} onDismiss={() => {}} />);
    expect(screen.getByText('Prøv dette:')).toBeInTheDocument();
    expect(
      screen.getByText(/Trykk på det øverste kortet for å sette par/),
    ).toBeInTheDocument();
  });

  it('close button has aria-label="Lukk"', () => {
    render(<OnboardingBanner visible={true} onDismiss={() => {}} />);
    expect(screen.getByLabelText('Lukk')).toBeInTheDocument();
  });

  it('clicking close calls onDismiss', () => {
    const onDismiss = vi.fn();
    render(<OnboardingBanner visible={true} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByLabelText('Lukk'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
