import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TopBar } from './TopBar';

describe('TopBar', () => {
  it('rendrer back-link med tilbake-label som default', () => {
    render(<TopBar backHref="/" />);
    expect(screen.getByRole('link', { name: /tilbake/i })).toBeInTheDocument();
  });

  it('viser kicker når oppgitt', () => {
    render(<TopBar backHref="/" kicker="SEKRETARIATET" />);
    expect(screen.getByText('SEKRETARIATET')).toBeInTheDocument();
  });
});
