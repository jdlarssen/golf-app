'use client';

import { useRef, type KeyboardEvent } from 'react';

/**
 * Next focus target for the WAI-ARIA radiogroup/tablist keyboard pattern:
 * ←/↑ previous, →/↓ next (both wrap), Home first, End last. Indices that
 * `isSkipped` flags (disabled options) are passed over.
 *
 * Returns null for any other key (let the browser handle it), and `index`
 * itself when no other option can take focus.
 */
export function nextRovingIndex(
  key: string,
  index: number,
  count: number,
  isSkipped: (index: number) => boolean = () => false,
): number | null {
  let start: number;
  let step: 1 | -1;
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      start = index + 1;
      step = 1;
      break;
    case 'ArrowLeft':
    case 'ArrowUp':
      start = index - 1;
      step = -1;
      break;
    case 'Home':
      start = 0;
      step = 1;
      break;
    case 'End':
      start = count - 1;
      step = -1;
      break;
    default:
      return null;
  }
  for (let i = 0; i < count; i++) {
    const candidate = (((start + i * step) % count) + count) % count;
    if (!isSkipped(candidate)) return candidate;
  }
  return index;
}

/**
 * Roving tabindex for a button-based radiogroup or tablist (#2240) — the
 * pattern SegmentedField introduced, shared so every group behaves the same:
 * only the selected option (or the first enabled one when nothing is
 * selected) sits in the tab order, and the arrow keys, Home and End select
 * the next option and move focus to it.
 *
 * Returns a function that gives the `ref`, `tabIndex` and `onKeyDown` props
 * for the option at `index` — spread them onto the option's element.
 */
export function useRovingFocus<T>(
  values: readonly T[],
  selected: T | null | undefined,
  onSelect: (value: T) => void,
  isDisabled?: (value: T) => boolean,
) {
  const refs = useRef<Array<HTMLElement | null>>([]);
  const isSkipped = (i: number) => isDisabled?.(values[i]) ?? false;
  const selectedIndex = selected == null ? -1 : values.indexOf(selected);
  const tabStop =
    selectedIndex !== -1 && !isSkipped(selectedIndex)
      ? selectedIndex
      : values.findIndex((_, i) => !isSkipped(i));

  return function rovingProps(index: number) {
    return {
      ref: (el: HTMLElement | null) => {
        refs.current[index] = el;
      },
      tabIndex: index === tabStop ? 0 : -1,
      onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
        const next = nextRovingIndex(e.key, index, values.length, isSkipped);
        if (next === null) return;
        e.preventDefault();
        if (next === index) return;
        onSelect(values[next]);
        refs.current[next]?.focus();
      },
    };
  };
}

/** The props `useRovingFocus` hands out for one option. */
export type RovingProps = ReturnType<ReturnType<typeof useRovingFocus>>;
