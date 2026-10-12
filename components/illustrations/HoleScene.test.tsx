import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { OutOfBoundsScene, TreeScene } from './HoleScene';

describe('HoleScene', () => {
  it.each([
    ['OutOfBoundsScene', OutOfBoundsScene, { pins: 3, obLine: 1, ellipses: 0 }],
    ['TreeScene', TreeScene, { pins: 0, obLine: 0, ellipses: 1 }],
  ] as const)('%s is decorative and draws only with --ob-* tokens', (_name, Scene, expected) => {
    const { container } = render(<Scene />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('aria-hidden')).toBe('true');
    expect(svg!.getAttribute('focusable')).toBe('false');

    const markup = container.innerHTML;
    expect(markup).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(container.querySelector('[id]')).toBeNull();

    for (const el of svg!.querySelectorAll('*')) {
      for (const attr of ['fill', 'stroke']) {
        const value = el.getAttribute(attr);
        if (value !== null) expect(value).toMatch(/^(none|var\(--ob-[a-z-]+\))$/);
      }
    }

    // A pin is the 10 px post; its 16 px top shares the x.
    expect(svg!.querySelectorAll('rect[width="10"][height="92"]')).toHaveLength(expected.pins);
    expect(svg!.querySelectorAll('line')).toHaveLength(expected.obLine);
    expect(svg!.querySelectorAll('ellipse')).toHaveLength(expected.ellipses);
  });
});
