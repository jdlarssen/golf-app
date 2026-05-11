import { ImageResponse } from 'next/og';

// Main PWA icon (192x192).
export const size = { width: 192, height: 192 };
export const contentType = 'image/png';

export default function Icon() {
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
          fontSize: 128,
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
