import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createTranslator } from 'next-intl';
import messages from '@/messages/no.json';
import { FormatHelper, type FormatHelperLabels } from './FormatHelper';
import { DEFAULT_ANSWERS, buildFormatHelperViews } from '@/lib/formats/formatHelperViews';

// #2328, Type C: the format helper renders the server-built suggestion for the
// answers it has. The views come from the real Norwegian catalog, so a missing
// key or broken ICU string fails here and not first on the page.

type T = (key: string, values?: Record<string, string | number>) => string;
const scoped = (namespace: string): T =>
  createTranslator({ locale: 'no', messages, namespace: namespace as never }) as unknown as T;

const views = buildFormatHelperViews({
  helper: scoped('formatGuide.helper'),
  modes: scoped('modes'),
  lineup: scoped('wizard.formatGrid.lineup'),
});

const helper = scoped('formatGuide.helper');
const labels: FormatHelperLabels = {
  countLegend: helper('countLegend'),
  levelLegend: helper('levelLegend'),
  levelEven: helper('levelEven'),
  levelUneven: helper('levelUneven'),
  goalLegend: helper('goalLegend'),
  goalCompete: helper('goalCompete'),
  goalTeam: helper('goalTeam'),
  goalStakes: helper('goalStakes'),
  resultKicker: helper('resultKicker'),
  create: helper('create'),
  rules: helper('rules'),
  seeAll: helper('seeAll', { count: 23 }),
  versus: 'mot',
};

function renderHelper() {
  return render(
    <FormatHelper
      views={views}
      labels={labels}
      initialAnswers={DEFAULT_ANSWERS}
      allFormatsHref="#alle-spillformer"
    />,
  );
}

describe('FormatHelper', () => {
  it('shows the suggestion for the default answers, 5–12 · Veldig ulike · Lagfølelse', () => {
    renderHelper();
    const result = screen.getByTestId('format-helper-result');
    expect(result).toHaveTextContent('Texas scramble');
    expect(result).toHaveTextContent('Lag · 2–4 per lag');
    expect(screen.getByRole('radio', { name: '5–12' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Veldig ulike' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Lagfølelse' })).toBeChecked();
    expect(screen.getByTestId('format-helper-create')).toHaveAttribute(
      'href',
      '/opprett-spill?format=texas_scramble&step=2',
    );
    expect(screen.getByTestId('format-helper-rules')).toHaveAttribute(
      'href',
      '/spillformater/texas_scramble',
    );
    expect(screen.getByRole('link', { name: 'Eller se alle 23 spillformer →' })).toHaveAttribute(
      'href',
      '#alle-spillformer',
    );
  });

  it('a new answer gives a new suggestion, and an exact count goes into the link', () => {
    renderHelper();
    fireEvent.click(screen.getByRole('radio', { name: '4' }));
    expect(screen.getByTestId('format-helper-result')).toHaveTextContent('Texas scramble');
    expect(screen.getByTestId('format-helper-result')).toHaveTextContent('Lag · 2 mot 2');
    expect(screen.getByTestId('format-helper-create')).toHaveAttribute(
      'href',
      '/opprett-spill?format=texas_scramble&step=2&antall=4',
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Ganske like' }));
    expect(screen.getByTestId('format-helper-result')).toHaveTextContent('Fourball');
    expect(screen.getByTestId('format-helper-rules')).toHaveAttribute(
      'href',
      '/spillformater/fourball_matchplay',
    );
  });

  it('says so when no team format fits 3, or the format does not fit every count', () => {
    renderHelper();
    expect(screen.queryByTestId('format-helper-note')).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: '3' }));
    expect(screen.getByTestId('format-helper-result')).toHaveTextContent('Stableford');
    expect(screen.getByTestId('format-helper-note')).toHaveTextContent(
      'Ingen lagformat går opp med 3 spillere.',
    );

    fireEvent.click(screen.getByRole('radio', { name: '13+' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Ganske like' }));
    expect(screen.getByTestId('format-helper-result')).toHaveTextContent('Best ball');
    expect(screen.getByTestId('format-helper-note')).toHaveTextContent(
      'Går ikke opp med alle antall.',
    );
  });
});
