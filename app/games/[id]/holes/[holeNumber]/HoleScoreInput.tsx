'use client';

import { useState, useEffect, useRef } from 'react';
import { getBrowserClient } from '@/lib/supabase/client';

type Status = 'idle' | 'saving' | 'saved' | 'error';

export function HoleScoreInput({
  gameId,
  userId,
  holeNumber,
  initialStrokes,
  myUserId,
  disabled,
}: {
  gameId: string;
  userId: string; // The player whose score this is
  holeNumber: number;
  initialStrokes: number | null;
  myUserId: string; // Who's entering (auth user)
  disabled?: boolean;
}) {
  const [value, setValue] = useState<string>(
    initialStrokes != null ? String(initialStrokes) : '',
  );
  const [status, setStatus] = useState<Status>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (clearRef.current) clearTimeout(clearRef.current);
    };
  }, []);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setValue(next);
    setStatus('idle');

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (clearRef.current) {
      clearTimeout(clearRef.current);
      clearRef.current = null;
    }
    debounceRef.current = setTimeout(() => save(next), 500);
  }

  async function save(rawValue: string) {
    const trimmed = rawValue.trim();
    const strokes = trimmed === '' ? null : Number(trimmed);
    if (
      trimmed !== '' &&
      (!Number.isInteger(strokes) || strokes! < 1 || strokes! > 20)
    ) {
      setStatus('error');
      return;
    }
    setStatus('saving');
    const supabase = getBrowserClient();
    const { error } = await supabase.from('scores').upsert(
      {
        game_id: gameId,
        user_id: userId,
        hole_number: holeNumber,
        strokes,
        entered_by: myUserId,
        client_updated_at: new Date().toISOString(),
      },
      { onConflict: 'game_id,user_id,hole_number' },
    );
    setStatus(error ? 'error' : 'saved');
    if (!error) {
      // Drop status indicator after a couple seconds.
      clearRef.current = setTimeout(() => setStatus('idle'), 2000);
    }
  }

  const dotColor =
    status === 'saving'
      ? '#f59e0b'
      : status === 'saved'
        ? '#16a34a'
        : status === 'error'
          ? '#dc2626'
          : 'transparent';

  return (
    <div className="flex items-center gap-3">
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={20}
        step={1}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="w-20 min-h-[44px] rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-center text-lg font-medium bg-white dark:bg-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-green-600"
        placeholder="—"
        aria-label="Brutto slag"
      />
      <span
        className="w-3 h-3 rounded-full inline-block"
        aria-label={status}
        style={{ backgroundColor: dotColor }}
      />
    </div>
  );
}
