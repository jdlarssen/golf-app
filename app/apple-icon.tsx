import { ImageResponse } from 'next/og';

// iOS home-screen icon (180x180).
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#16a34a',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 120,
          fontWeight: 700,
          letterSpacing: '-0.05em',
        }}
      >
        T
      </div>
    ),
    { ...size },
  );
}
