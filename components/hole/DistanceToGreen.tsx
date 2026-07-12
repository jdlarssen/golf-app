'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type JSX } from 'react';
import { useTranslations } from 'next-intl';
import { haversineMeters, type LatLng } from '@/lib/geo/distance';
import { shouldShowDistance } from '@/lib/geo/pinRules';

/**
 * localStorage flag set once the user has granted geolocation (either via the
 * «Vis avstand» button here or a successful pin in GreenPinChip). Later holes
 * auto-start the watch instead of showing the button again. iOS PWA can
 * re-prompt or silently stop despite this flag — the error path below falls
 * back to the button, never a silent empty slot (#1210 contract §Design 4).
 */
export const GEO_GRANTED_KEY = 'torny-geo-granted';

const lineStyle: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--primary)',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
};

const buttonStyle: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--primary)',
  background: 'none',
  border: 'none',
  padding: 0,
  textDecoration: 'underline',
  textUnderlineOffset: 2,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const hintStyle: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 10,
  color: 'var(--text-muted)',
  whiteSpace: 'nowrap',
};

/**
 * «~X m til green» (#1210) — rendret i HoleHero sin distanceLine-slot (høyre
 * kolonne, rett under indeks-linja; aldri en egen full-bredde rad, #639-
 * plasskampen). Avstanden regnes lokalt fra `watchPosition` mot det
 * crowdsourcede green-senteret — ingen nettverkskall per posisjon.
 *
 * Tilstander:
 *  - uten senter → null (hull uten pins har ingen avstandslinje)
 *  - første gang → «Vis avstand»-knapp (trykk utløser GPS-prompten)
 *  - granted huskes (localStorage) → senere hull starter watchen automatisk
 *  - avslag/feil → tilbake til knappen, med kort hint ved denied
 *  - avstand > 1 km eller ingen fix ennå → ingenting (shouldShowDistance)
 *
 * Watchen ryddes ved unmount (key={holeNumber} remounter per hull) og pauses
 * ved visibilitychange: hidden (batteri, designdok §Se avstand).
 */
export function DistanceToGreen({ center }: { center: LatLng | null }): JSX.Element | null {
  const t = useTranslations('holes.distance');
  // watching = user intent (auto-start or button tap); the actual watch id
  // lives in the ref so the visibility pause can stop/resume underneath it.
  const [watching, setWatching] = useState(false);
  const [pos, setPos] = useState<LatLng | null>(null);
  const [deniedHint, setDeniedHint] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  const stopWatch = useCallback(() => {
    if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
  }, []);

  const startWatch = useCallback(() => {
    if (!navigator.geolocation || watchIdRef.current != null) return;
    setWatching(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (p) => {
        try {
          localStorage.setItem(GEO_GRANTED_KEY, '1');
        } catch {
          // Private mode etc. — the flag is a convenience, not a requirement.
        }
        setDeniedHint(false);
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude });
      },
      (err) => {
        // Graceful fallback: back to the button, never a silent empty slot.
        stopWatch();
        setPos(null);
        setWatching(false);
        if (err.code === err.PERMISSION_DENIED) {
          try {
            localStorage.removeItem(GEO_GRANTED_KEY);
          } catch {
            // ignore
          }
          setDeniedHint(true);
        }
      },
      { enableHighAccuracy: true },
    );
  }, [stopWatch]);

  // Auto-start when permission was granted on an earlier hole; always clean up
  // the watch on unmount.
  useEffect(() => {
    let granted = false;
    try {
      granted = localStorage.getItem(GEO_GRANTED_KEY) === '1';
    } catch {
      // ignore
    }
    if (granted) startWatch();
    return stopWatch;
  }, [startWatch, stopWatch]);

  // Pause while the tab/app is hidden (battery); resume when visible again.
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'hidden') {
        stopWatch();
      } else if (watching && watchIdRef.current == null) {
        startWatch();
      }
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [watching, startWatch, stopWatch]);

  if (center == null) return null;

  const distanceM = pos ? haversineMeters(pos, center) : null;

  if (distanceM != null && shouldShowDistance(distanceM)) {
    // «~» is the promise: phone GPS is ±5–10 m, we never claim more.
    return (
      <div data-testid="distance-to-green" style={lineStyle}>
        {t('line', { m: Math.round(distanceM) })}
      </div>
    );
  }

  if (watching) {
    // Waiting for the first fix, or the player is > 1 km away — nothing to say.
    return null;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
      <button
        type="button"
        data-testid="show-distance-button"
        onClick={startWatch}
        style={buttonStyle}
      >
        {t('showButton')}
      </button>
      {deniedHint && <span style={hintStyle}>{t('deniedHint')}</span>}
    </div>
  );
}
