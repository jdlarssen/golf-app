import { renderHook } from '@testing-library/react-native';
import { useLatestLoad } from './useLatestLoad';

describe('useLatestLoad', () => {
  it('bare det sist startede kallet er gjeldende, og objektet er stabilt', async () => {
    const { result, rerender } = await renderHook(() => useLatestLoad());
    const first = result.current;
    const a = first.begin();
    const b = first.begin();
    expect(first.isCurrent(a)).toBe(false);
    expect(first.isCurrent(b)).toBe(true);
    await rerender({});
    expect(result.current).toBe(first);
  });
});
