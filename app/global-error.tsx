'use client';

import { useEffect } from 'react';

/**
 * Siste skanse (#680): erstatter HELE rot-dokumentet når selve rot-layouten
 * (`app/[locale]/layout.tsx`) kaster. Da finnes verken NextIntlClientProvider,
 * fonter eller garantert lastet `globals.css` — derfor hardkodet norsk
 * (default-locale «no») og inline-stiler som tåler at CSS mangler. Fanger
 * ekstremt sjelden; de to rute-grensene (`error.tsx`) dekker alt under
 * rot-layouten. `global-error` må definere egne `<html>`/`<body>`.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error('[global-error-boundary]', error);
  }, [error]);

  return (
    <html lang="no">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#F8F6F0',
          color: '#1B4332',
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          padding: 24,
        }}
      >
        <main style={{ maxWidth: 320, textAlign: 'center' }}>
          <h1 style={{ fontSize: 28, fontWeight: 600, margin: '0 0 12px' }}>
            Noe gikk galt
          </h1>
          <p
            style={{
              fontSize: 15,
              lineHeight: 1.6,
              margin: '0 0 28px',
              color: '#5b6b62',
            }}
          >
            Vi fikk ikke lastet appen akkurat nå. Som regel er det bare en kort
            hikke på nettet. Prøv igjen om et øyeblikk.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button
              type="button"
              onClick={() => unstable_retry()}
              style={{
                minHeight: 44,
                borderRadius: 9999,
                border: 'none',
                backgroundColor: '#1B4332',
                color: '#ffffff',
                fontSize: 15,
                fontWeight: 500,
                cursor: 'pointer',
                padding: '0 18px',
              }}
            >
              Prøv igjen
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- global-error erstatter router-skallet; et rått <a> tvinger full reload tilbake til en fungerende app (next/link ville prøvd klient-nav på en død router). */}
            <a
              href="/"
              style={{
                minHeight: 44,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 9999,
                border: '1px solid rgba(27,67,50,0.25)',
                color: '#1B4332',
                fontSize: 15,
                fontWeight: 500,
                textDecoration: 'none',
                padding: '0 18px',
              }}
            >
              Til Hjem
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
