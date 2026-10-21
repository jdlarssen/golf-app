import { NextResponse } from 'next/server';
import { MIN_APP_VERSION } from '@/lib/app/minVersion';

/**
 * Oldest native build the server still supports (#2619). Public on purpose: the
 * app asks before login, and the numbers are build counters, not secrets. The
 * five minutes of `max-age` is how long a raised minimum can take to reach a
 * phone that just asked.
 */
export function GET() {
  return NextResponse.json(MIN_APP_VERSION, {
    headers: { 'cache-control': 'public, max-age=300' },
  });
}
