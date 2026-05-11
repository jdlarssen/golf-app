import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = await getServerClient();
  await supabase.auth.signOut();

  // Use the request URL as the base so this works in any environment
  // (preview, prod, localhost) without hard-coding an origin.
  return NextResponse.redirect(new URL('/login', request.url), {
    status: 303, // POST -> GET on redirect
  });
}
