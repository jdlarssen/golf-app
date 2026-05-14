import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScoreShape } from './ScoreShape';

describe('ScoreShape', () => {
  it('renders just the children when shape is none', () => {
    const { container } = render(
      <ScoreShape shape="none" tone="par">5</ScoreShape>,
    );
    expect(screen.getByText('5')).toBeDefined();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders an SVG ring for circle (birdie)', () => {
    const { container } = render(
      <ScoreShape shape="circle" tone="under">3</ScoreShape>,
    );
    expect(screen.getByText('3')).toBeDefined();
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.querySelectorAll('circle').length).toBe(1);
  });

  it('renders two SVG rings for double-circle (eagle)', () => {
    const { container } = render(
      <ScoreShape shape="double-circle" tone="under">2</ScoreShape>,
    );
    const svg = container.querySelector('svg');
    expect(svg?.querySelectorAll('circle').length).toBe(2);
  });

  it('renders one SVG rect for square (bogey)', () => {
    const { container } = render(
      <ScoreShape shape="square" tone="over1">5</ScoreShape>,
    );
    const svg = container.querySelector('svg');
    expect(svg?.querySelectorAll('rect').length).toBe(1);
  });

  it('renders two SVG rects for double-square (double bogey+)', () => {
    const { container } = render(
      <ScoreShape shape="double-square" tone="over2">6</ScoreShape>,
    );
    const svg = container.querySelector('svg');
    expect(svg?.querySelectorAll('rect').length).toBe(2);
  });

  it('respects size prop (sm vs lg differ in pixel width)', () => {
    const { container, rerender } = render(
      <ScoreShape shape="circle" tone="under" size="sm">3</ScoreShape>,
    );
    const smSvg = container.querySelector('svg');
    const smSize = smSvg?.getAttribute('width');
    rerender(
      <ScoreShape shape="circle" tone="under" size="lg">3</ScoreShape>,
    );
    const lgSvg = container.querySelector('svg');
    const lgSize = lgSvg?.getAttribute('width');
    expect(Number(lgSize)).toBeGreaterThan(Number(smSize));
  });
});
