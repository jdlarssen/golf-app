import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { CupAwards } from './CupAwards';

// Type C render-test per docs/test-discipline.md — ÉN test for den strukturelle
// visningen: begge kåringene rendres, delte kåringer joines til norsk liste, og
// en kåring uten datagrunnlag (null) rendres ikke. Hvem som VINNER og med
// hvilken verdi er dekket av lib/cup/computeCupAwards.test.ts og re-asserteres
// IKKE her.

describe('CupAwards', () => {
  it('rendrer begge kåringene med joinede navn, og skjuler den som mangler datagrunnlag', () => {
    const view = render(
      <CupAwards
        mvp={{ names: ['Per', 'Pål'], points: 3 }}
        underperformer={{ names: ['Knut'], overPar: 12 }}
      />,
    );

    expect(screen.getByTestId('cup-awards')).toBeInTheDocument();

    // Delt MVP: navnene joines med norsk konjunksjon, ikke komma.
    const mvp = screen.getByTestId('cup-award-mvp');
    expect(within(mvp).getByText('Per og Pål')).toBeInTheDocument();
    expect(within(mvp).getByText('3 poeng · flest i cupen')).toBeInTheDocument();

    const under = screen.getByTestId('cup-award-underperformer');
    expect(within(under).getByText('Knut')).toBeInTheDocument();
    expect(within(under).getByText('12 slag over eget handicap')).toBeInTheDocument();

    // Uten datagrunnlag for «dro ned mest» (ren greensome-cup, eller ingen som
    // har ført nok hull) står MVP alene — ingen tom flate.
    view.unmount();
    const mvpOnly = render(
      <CupAwards mvp={{ names: ['Per'], points: 3 }} underperformer={null} />,
    );
    expect(screen.getByTestId('cup-award-mvp')).toBeInTheDocument();
    expect(screen.queryByTestId('cup-award-underperformer')).not.toBeInTheDocument();

    // Og uten noen av delene forsvinner hele seksjonen.
    mvpOnly.unmount();
    render(<CupAwards mvp={null} underperformer={null} />);
    expect(screen.queryByTestId('cup-awards')).not.toBeInTheDocument();
  });
});
