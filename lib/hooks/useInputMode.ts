import { useEffect, useState } from 'react';

export type InputMode = 'swipe' | 'buttons';

const STORAGE_KEY = 'torny-input-mode';
const DEFAULT_MODE: InputMode = 'swipe';

function isInputMode(value: unknown): value is InputMode {
  return value === 'swipe' || value === 'buttons';
}

export function useInputMode(): [InputMode, (m: InputMode) => void] {
  const [mode, setModeState] = useState<InputMode>(DEFAULT_MODE);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isInputMode(stored)) {
        setModeState(stored);
      }
    } catch {
      // localStorage unavailable — keep default.
    }
  }, []);

  const setMode = (next: InputMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Safari private mode etc. — state still updated.
    }
  };

  return [mode, setMode];
}
