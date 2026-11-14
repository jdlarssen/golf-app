import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { buildUserExport, type ExportRead } from '@/lib/profile/exportCore';

// «Eksporter mine data» on the website. Transport only (#2332): which tables
// the file has, and how each is read, lives in `buildUserExport`, which the
// app's `/api/profile/export` uses too, so both doors give the same file.

// One fixed text for every failed read (#2333): the export either carries
// all of the user's data or nothing, and never leaks error.message.
const EXPORT_FAILED = 'Klarte ikke å hente dataene dine. Prøv igjen om litt.';

function exportFailed(read: ExportRead | 'export', error: unknown) {
  console.error(`[profile/export] ${read} failed`, error);
  return NextResponse.json({ error: EXPORT_FAILED }, { status: 500 });
}

export async function GET() {
  const userId = await getProxyVerifiedUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 });
  }

  try {
    const supabase = await getServerClient();
    const result = await buildUserExport(userId, supabase);
    if (!result.ok) return exportFailed(result.read, result.error);

    const exportDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const filename = `torny-data-${exportDate}.json`;

    return new Response(JSON.stringify(result.payload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return exportFailed('export', error);
  }
}
