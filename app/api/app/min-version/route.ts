import { NextResponse } from 'next/server';
import { LATEST_APP_BUILD } from '@/lib/app/latestBuild';
import { MIN_APP_VERSION } from '@/lib/app/minVersion';

/**
 * Oldest native build the server still supports (#2619), and the newest one
 * testers can install (#2975). Public on purpose: the app asks before login, and
 * the numbers are build counters, not secrets. The five minutes of `max-age` is
 * how long a changed number can take to reach a phone that just asked.
 *
 * The latest fields were added beside the minimum ones: builds that only know
 * `minBuild` / `minVersionCode` read those and ignore the rest.
 */
export function GET() {
  return NextResponse.json(
    {
      ios: { ...MIN_APP_VERSION.ios, ...LATEST_APP_BUILD.ios },
      android: { ...MIN_APP_VERSION.android, ...LATEST_APP_BUILD.android },
    },
    { headers: { 'cache-control': 'public, max-age=300' } },
  );
}
