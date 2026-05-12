import { ImageResponse } from 'next/og';

// Main PWA icon (192x192). Serif "T" on deep forest green + a champagne dot
// just past the T, mirroring the brand-mark-icon-only.svg design asset.
// Fraunces is fetched from Google Fonts at build time; if the fetch fails
// (e.g. offline), Satori's default serif still renders the lockup.

export const size = { width: 192, height: 192 };
export const contentType = 'image/png';

async function fetchFraunces(): Promise<ArrayBuffer | null> {
  // Static-italic-axis URL avoids variable-font edge cases in Satori.
  const cssUrl =
    'https://fonts.googleapis.com/css2?family=Fraunces:wght@500&display=swap';
  try {
    const css = await fetch(cssUrl, {
      headers: {
        // Pretend to be a modern browser so we get woff2/ttf URLs we can use.
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      },
    }).then((r) => (r.ok ? r.text() : ''));
    const m = css.match(/url\((https:\/\/[^)]+\.ttf)\)/);
    if (!m) return null;
    const buf = await fetch(m[1]).then((r) =>
      r.ok ? r.arrayBuffer() : null,
    );
    return buf;
  } catch {
    return null;
  }
}

export default async function Icon() {
  const font = await fetchFraunces();
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#1B4332',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          paddingBottom: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span
            style={{
              color: '#F8F6F0',
              fontSize: 132,
              fontWeight: 500,
              fontFamily: font ? 'Fraunces' : 'serif',
              letterSpacing: '-0.02em',
              lineHeight: 1,
            }}
          >
            T
          </span>
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: '#C9A961',
              marginTop: 32,
            }}
          />
        </div>
      </div>
    ),
    {
      ...size,
      fonts: font
        ? [{ name: 'Fraunces', data: font, weight: 500, style: 'normal' }]
        : undefined,
    },
  );
}
