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

  it('renders three SVG rings for triple-circle (albatross)', () => {
    const { container } = render(
      <ScoreShape shape="triple-circle" tone="under">2</ScoreShape>,
    );
    const svg = container.querySelector('svg');
    expect(svg?.querySelectorAll('circle').length).toBe(3);
  });

  it('renders one SVG rect for square (bogey)', () => {
    const { container } = render(
      <ScoreShape shape="square" tone="over1">5</ScoreShape>,
    );
    const svg = container.querySelector('svg');
    expect(svg?.querySelectorAll('rect').length).toBe(1);
  });

  it('renders two SVG rects for double-square (double bogey)', () => {
    const { container } = render(
      <ScoreShape shape="double-square" tone="over2">6</ScoreShape>,
    );
    const svg = container.querySelector('svg');
    expect(svg?.querySelectorAll('rect').length).toBe(2);
  });

  it('renders three SVG rects for triple-square (triple bogey)', () => {
    const { container } = render(
      <ScoreShape shape="triple-square" tone="over2">7</ScoreShape>,
    );
    const svg = container.querySelector('svg');
    expect(svg?.querySelectorAll('rect').length).toBe(3);
  });

  it('renders four SVG rects for quadruple-square (quad bogey+)', () => {
    const { container } = render(
      <ScoreShape shape="quadruple-square" tone="over2">8</ScoreShape>,
    );
    const svg = container.querySelector('svg');
    expect(svg?.querySelectorAll('rect').length).toBe(4);
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

  it('row (#2281): a shaped score is 32 px with a 1 px ring on its edge, a plain one 30 px', () => {
    // The demo's artboard draws a CSS ring outside a 30 px box (content-box),
    // which renders 32 px with a 1 px stroke; a birdie uses --score-under-ring.
    const { container, rerender } = render(
      <ScoreShape shape="circle" tone="under" size="row">2</ScoreShape>,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('32');
    const circle = svg?.querySelector('circle');
    expect(circle?.getAttribute('r')).toBe('15.5');
    expect(circle?.getAttribute('stroke-width')).toBe('1');
    expect(circle?.getAttribute('stroke')).toBe('var(--score-under-ring)');

    rerender(
      <ScoreShape shape="none" tone="par" size="row">3</ScoreShape>,
    );
    const plain = container.firstElementChild as HTMLElement;
    expect(plain.style.width).toBe('30px');
  });

  it('centers the number using lineHeight equal to shape height', () => {
    const { container } = render(
      <ScoreShape shape="circle" tone="under" size="lg">3</ScoreShape>,
    );
    // The number span is the last span — sibling of the SVG.
    const spans = container.querySelectorAll('span > span');
    const numberSpan = Array.from(spans).find(
      (el) => el.textContent === '3',
    ) as HTMLElement | undefined;
    expect(numberSpan).toBeDefined();
    expect(numberSpan?.style.lineHeight).toBe('52px');
    expect(numberSpan?.style.textAlign).toBe('center');
  });
});

describe('ScoreShape size="follow" (#2286) — the artboard\'s CSS borders', () => {
  it.each([
    ['none', 'par', 0, false, null],
    ['circle', 'under', 1, true, 'border-score-under-ring'],
    ['double-circle', 'under', 2, true, 'border-score-under-ring'],
    ['triple-circle', 'under', 3, true, 'border-score-under-ring'],
    ['square', 'over1', 1, false, 'border-score-over1-ring'],
    ['double-square', 'over2', 2, false, 'border-score-over2-fg'],
    ['triple-square', 'over2', 3, false, 'border-score-over2-fg'],
    ['quadruple-square', 'over2', 4, false, 'border-score-over2-fg'],
  ] as const)('%s: %s borders', (shape, tone, borders, round, colour) => {
    const { container } = render(
      <ScoreShape shape={shape} tone={tone} size="follow">4</ScoreShape>,
    );
    const box = container.firstElementChild as HTMLElement;
    expect(container.querySelector('svg')).toBeNull();
    expect(box).toHaveClass('box-border', 'h-[34px]', 'w-[34px]', 'leading-[normal]');
    expect(box).not.toHaveClass('tabular-nums');
    const bordered = [box, ...box.querySelectorAll('span')].filter((el) => el.className.includes('border-[1.5px]'));
    expect(bordered).toHaveLength(borders);
    for (const el of bordered) {
      expect(el.classList.contains('rounded-full')).toBe(round);
      if (colour) expect(el).toHaveClass(colour);
    }
    // Each border after the first sits 3 px further in.
    const insets = ['inset-[1.5px]', 'inset-[4.5px]', 'inset-[7.5px]'].slice(0, Math.max(0, borders - 1));
    insets.forEach((inset, i) => expect(bordered[i + 1]).toHaveClass('absolute', inset));
    expect(screen.getByText('4')).toBeInTheDocument();
  });
});

