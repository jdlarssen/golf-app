import { ImageResponse } from 'next/og';

// iOS home-screen icon (180x180). Serif "T" on deep forest green.

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
          color: '#F8F6F0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 124,
          fontWeight: 500,
          fontFamily: font ? 'Fraunces' : 'serif',
          letterSpacing: '-0.02em',
          paddingBottom: 8,
        }}
      >
        T
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
