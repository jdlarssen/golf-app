import { ImageResponse } from 'next/og';

// iOS home-screen icon (180x180). Serif "T" + champagne dot on deep forest.

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

async function fetchFraunces(): Promise<ArrayBuffer | null> {
  const cssUrl =
    'https://fonts.googleapis.com/css2?family=Fraunces:wght@500&display=swap';
  try {
    const css = await fetch(cssUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      },
    }).then((r) => (r.ok ? r.text() : ''));
    const m = css.match(/url\((https:\/\/[^)]+\.ttf)\)/);
    if (!m) return null;
    return await fetch(m[1]).then((r) => (r.ok ? r.arrayBuffer() : null));
  } catch {
    return null;
  }
}

export default async function AppleIcon() {
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
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
          <span
            style={{
              color: '#F8F6F0',
              fontSize: 124,
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
              width: 26,
              height: 26,
              borderRadius: '50%',
              background: '#C9A961',
              marginTop: 30,
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
