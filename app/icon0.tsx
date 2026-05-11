import { ImageResponse } from 'next/og';

// High-resolution PWA icon (512x512) used during install on Android.
export const size = { width: 512, height: 512 };
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
          fontSize: 340,
          fontWeight: 700,
          letterSpacing: '-0.05em',
        }}
      >
        G
      </div>
    ),
    { ...size },
  );
}
