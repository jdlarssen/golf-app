'use client';

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type JSX,
} from 'react';
import { useTranslations } from 'next-intl';
import { PinFlagSm } from '@/components/icons';
import { isAcceptablePinAccuracy } from '@/lib/geo/pinRules';
import { saveGreenPin } from '@/app/[locale]/games/[id]/holes/[holeNumber]/greenPinActions';
import { GEO_GRANTED_KEY } from './DistanceToGreen';

const chipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 14px',
  minHeight: 36,
  borderRadius: 999,
  border: '1px solid color-mix(in srgb, var(--primary) 40%, transparent)',
  background: 'color-mix(in srgb, var(--primary) 10%, transparent)',
  color: 'var(--text)',
  fontFamily: 'var(--font-sans)',
  fontSize: 12.5,
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const statusStyle: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 11.5,
  color: 'var(--text-muted)',
};

const THANKS_MS = 2500;

// Inline online-tracking — repoet har ingen useOnline-hook (verifisert i
// kontraktens research), og dette er eneste forbruker. useSyncExternalStore
// er React-idiomet for navigator.onLine; server-snapshot sier online så
// SSR/hydrering aldri blinker chippen bort.
function subscribeOnline(callback: () => void): () => void {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

/**
 * «Står du ved greenen? Lagre punkt» (#1210) — ett-trykks crowdsourcing-chip
 * ved SyncStatusLine-plassen. Forelderen (HoleClient) gater på tastings-økten
 * (minst ett onSetScore-kall — format-agnostisk, IKKE playerId === myUserId,
 * #1058-fella) og freshPinCount < PIN_GATE_MAX_PINS; denne komponenten eier
 * online-sjekken (offline → ingen chip: et tapt pin koster ingenting) og
 * GPS-flyten.
 *
 * Chippen vises FØR tillatelse er gitt — trykket utløser prompten (contract
 * Key Decisions). Accuracy pre-sjekkes mot samme konstant som server-action-en
 * håndhever autoritativt.
 */
export function GreenPinChip({
  courseId,
  holeNumber,
}: {
  courseId: string;
  holeNumber: number;
}): JSX.Element | null {
  const t = useTranslations('holes.greenPin');
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  const [state, setState] = useState<'idle' | 'busy' | 'thanks' | 'gone'>('idle');
  const [errorKey, setErrorKey] = useState<'weakGps' | 'denied' | 'failed' | null>(null);
  const thanksTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (thanksTimerRef.current) clearTimeout(thanksTimerRef.current);
    };
  }, []);

  if (!online || state === 'gone') return null;

  if (state === 'thanks') {
    return (
      <div data-testid="green-pin-thanks" style={statusStyle}>
        {t('thanks')}
      </div>
    );
  }

  function onPin() {
    if (state === 'busy') return;
    if (!navigator.geolocation) {
      setErrorKey('failed');
      return;
    }
    setErrorKey(null);
    setState('busy');
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        try {
          localStorage.setItem(GEO_GRANTED_KEY, '1');
        } catch {
          // ignore — convenience flag only
        }
        const accuracyM = Number.isFinite(p.coords.accuracy) ? p.coords.accuracy : null;
        // Pre-sjekk med samme konstant som serveren; sparer et rundtrip på
        // svakt signal. Server-action-en er fortsatt autoritativ.
        if (!isAcceptablePinAccuracy(accuracyM)) {
          setState('idle');
          setErrorKey('weakGps');
          return;
        }
        const res = await saveGreenPin({
          courseId,
          holeNumber,
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracyM,
        });
        if (res.ok) {
          setState('thanks');
          thanksTimerRef.current = setTimeout(() => setState('gone'), THANKS_MS);
        } else {
          setState('idle');
          setErrorKey(res.error === 'weak_gps' ? 'weakGps' : 'failed');
        }
      },
      (err) => {
        setState('idle');
        setErrorKey(err.code === err.PERMISSION_DENIED ? 'denied' : 'failed');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
      <button
        type="button"
        data-testid="green-pin-chip"
        onClick={onPin}
        disabled={state === 'busy'}
        style={{ ...chipStyle, opacity: state === 'busy' ? 0.6 : 1 }}
      >
        <PinFlagSm size={13} />
        <span>{state === 'busy' ? t('saving') : t('prompt')}</span>
      </button>
      {errorKey && (
        <span data-testid="green-pin-error" style={statusStyle}>
          {t(errorKey)}
        </span>
      )}
    </div>
  );
}
