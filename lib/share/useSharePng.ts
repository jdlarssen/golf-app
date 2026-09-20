'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Deling av et serverrendret PNG-kort (#2130, epic #1040) — én kopi av logikken.
 *
 * Mønsteret ble skrevet for «Del resultatet» på ferdige leaderboards (#942) og
 * gjelder like godt for Kavalkadens kort. Da K4 trengte den samme knappen et
 * sted til, ble logikken flyttet hit i stedet for kopiert: en regel har ett hjem
 * (felle 4, `docs/bug-prevention.md`).
 *
 * Tre ting hooken tar vare på, som alle er lært av iOS:
 *
 *  1. **Forhåndshenting.** Blob-en hentes ved montering, ikke ved trykket. Web
 *     Share på iOS krever at `navigator.share` kalles inne i gestus-vinduet;
 *     et `await fetch(...)` foran ville lukket det og gitt «NotAllowedError».
 *  2. **Selv-gating.** Ruta som lager bildet svarer 404 når kortet ikke finnes
 *     (aktivt spill, ingen lagret kavalkade, ukjent kort). Da blir `ready`
 *     aldri sann, og kallstedet viser ingen knapp. Ingen status-prop trengs.
 *  3. **Nedlasting som reserve.** Uten Web Share for filer (typisk desktop)
 *     lastes PNG-en ned i stedet. Begge veier er en fullført deling for
 *     kallstedet, og skilles på utfallet.
 *
 * `imageUrl` er `null` til adressen er kjent. Kallsteder som må lese
 * `window.location` setter den i sin egen effekt, så hooken kan gjengis på
 * serveren uten å røre nettleser-API-er.
 */

/** Hvordan delingen endte. Kallstedet logger `shared` og `downloaded`. */
export type SharePngOutcome =
  /** Web Share tok imot filen. */
  | 'shared'
  /** Nedlastingen startet (ingen Web Share for filer). */
  | 'downloaded'
  /** Spilleren lukket delearket. Ikke en feil. */
  | 'dismissed'
  /** Verken deling eller nedlasting kom i gang. */
  | 'failed'
  /** Bildet er ikke hentet ennå, eller en deling er alt i gang. */
  | 'not-ready';

export type UseSharePngOptions = {
  /** Hvor PNG-en hentes fra. `null` ⇒ ikke hent noe ennå. */
  imageUrl: string | null;
  /** Filnavnet mottakeren ser. */
  fileName: string;
  /** Teksten som følger med delingen. Bør nevne tornygolf.no. */
  shareText: string;
  /** Tittel på delearket. Default «Tørny». */
  title?: string;
  /**
   * Kalles når delingen faktisk gikk gjennom, eller nedlastingen startet.
   * Best-effort: en feil her stopper ikke delingen.
   */
  onShared?: (outcome: 'shared' | 'downloaded') => void;
};

export type UseSharePngResult = {
  /** Sann når bildet er hentet og knappen kan vises. */
  ready: boolean;
  /** Sann mens delearket står åpent. */
  busy: boolean;
  /** Del kortet. Må kalles rett fra en trykk-handler (gestus-vinduet). */
  share: () => Promise<SharePngOutcome>;
};

export function useSharePng({
  imageUrl,
  fileName,
  shareText,
  title = 'Tørny',
  onShared,
}: UseSharePngOptions): UseSharePngResult {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const blobRef = useRef<Blob | null>(null);

  // Holdes i en ref så `share` ikke må gjenskapes hver gang kallstedet sender
  // inn en ny pilfunksjon — og så delingen alltid melder fra til den ferskeste.
  const onSharedRef = useRef(onShared);
  useEffect(() => {
    onSharedRef.current = onShared;
  }, [onShared]);

  useEffect(() => {
    if (!imageUrl) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(imageUrl);
        if (cancelled || !res.ok) return; // 404 ⇒ ingen knapp
        const contentType = res.headers.get('content-type') ?? '';
        if (!contentType.includes('image/png')) return;
        const blob = await res.blob();
        if (cancelled) return;
        blobRef.current = blob;
        setReady(true);
      } catch {
        // Nett eller avbrudd: deling er en forbedring, ikke en forutsetning.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  const share = useCallback(async (): Promise<SharePngOutcome> => {
    const blob = blobRef.current;
    if (!blob || busy) return 'not-ready';

    const file = new File([blob], fileName, { type: 'image/png' });

    // Ingen `await` før `navigator.share` — se punkt 1 over.
    const canShareFiles =
      typeof navigator !== 'undefined' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [file] });

    if (canShareFiles && typeof navigator.share === 'function') {
      try {
        setBusy(true);
        await navigator.share({ files: [file], title, text: shareText });
        report('shared', onSharedRef.current);
        return 'shared';
      } catch (err) {
        // Spilleren lukket delearket → ikke en feil, bare stopp.
        if (err instanceof Error && err.name === 'AbortError') return 'dismissed';
        console.error('[useSharePng] share failed, falling back', err);
        // Fall gjennom til nedlasting.
      } finally {
        setBusy(false);
      }
    }

    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      report('downloaded', onSharedRef.current);
      return 'downloaded';
    } catch (err) {
      console.error('[useSharePng] download failed', err);
      return 'failed';
    }
  }, [busy, fileName, shareText, title]);

  return { ready, busy, share };
}

/** Del-loggingen er best-effort: den skal aldri velte selve delingen. */
function report(
  outcome: 'shared' | 'downloaded',
  onShared: ((outcome: 'shared' | 'downloaded') => void) | undefined,
): void {
  if (!onShared) return;
  try {
    onShared(outcome);
  } catch (err) {
    console.error('[useSharePng] share logging failed', err);
  }
}
