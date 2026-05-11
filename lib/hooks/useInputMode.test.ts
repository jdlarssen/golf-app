import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useInputMode } from './useInputMode';

const KEY = 'torny-input-mode';

describe('useInputMode', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to swipe when localStorage is empty', () => {
    const { result } = renderHook(() => useInputMode());
    expect(result.current[0]).toBe('swipe');
  });

  it('reads existing valid value from localStorage on mount', () => {
    localStorage.setItem(KEY, 'buttons');
    const { result } = renderHook(() => useInputMode());
    expect(result.current[0]).toBe('buttons');
  });

  it('falls back to swipe on invalid localStorage value', () => {
    localStorage.setItem(KEY, 'nonsense');
    const { result } = renderHook(() => useInputMode());
    expect(result.current[0]).toBe('swipe');
  });

  it('setMode updates the returned value', () => {
    const { result } = renderHook(() => useInputMode());
    act(() => {
      result.current[1]('buttons');
    });
    expect(result.current[0]).toBe('buttons');
  });

  it('setMode writes to localStorage', () => {
    const { result } = renderHook(() => useInputMode());
    act(() => {
      result.current[1]('buttons');
    });
    expect(localStorage.getItem(KEY)).toBe('buttons');
  });

  it('does not crash when localStorage.setItem throws', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('QuotaExceeded');
    };
    try {
      const { result } = renderHook(() => useInputMode());
      act(() => {
        result.current[1]('buttons');
      });
      expect(result.current[0]).toBe('buttons');
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
