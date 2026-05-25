import { NextResponse, type NextRequest } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { verifyUnsubToken } from '@/lib/productUpdates/unsubscribeToken';

// Unauthenticated unsubscribe-endpoint (issue #202).
//
// GET  → browser visning. Verifiser token, marker bruker som unsubscribed,
//        render enkel HTML-side. Hvis token er ugyldig/utløpt: 400 med
//        norsk feilmelding.
//
// POST → RFC 8058 one-click unsubscribe fra mail-klient. Samme verifisering
//        + DB-skriv, men returner 200 med tom body (mail-klient venter ikke
//        HTML).
//
// Bruker getAdminClient() siden endepunktet er offentlig — RLS gjelder ikke.
// Token-en er HMAC-signert med PRODUCT_UPDATE_UNSUB_SECRET så uautentisert
// kall kan ikke unsubscribe vilkårlige brukere.

export const dynamic = 'force-dynamic';

async function unsubscribe(token: string | null): Promise<{ ok: boolean; userId?: string }> {
  if (!token) return { ok: false };
  const verified = verifyUnsubToken(token);
  if (!verified) return { ok: false };

  const admin = getAdminClient();
  const { error } = await admin
    .from('users')
    .update({ product_updates_unsubscribed_at: new Date().toISOString() })
    .eq('id', verified.userId);

  if (error) {
    console.error('[unsubscribe/product-update] update failed', error);
    return { ok: false };
  }

  return { ok: true, userId: verified.userId };
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  const result = await unsubscribe(token);

  if (!result.ok) {
    return new NextResponse(buildHtml({ success: false }), {
      status: 400,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  return new NextResponse(buildHtml({ success: true }), {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

export async function POST(request: NextRequest) {
  // RFC 8058: mail-klient sender POST med List-Unsubscribe-headeren.
  // Token kan ligge enten i query-param eller form-body — vi sjekker begge.
  const tokenFromQuery = request.nextUrl.searchParams.get('token');
  let token = tokenFromQuery;
  if (!token) {
    try {
      const form = await request.formData();
      const formToken = form.get('token');
      if (typeof formToken === 'string') token = formToken;
    } catch {
      // ignore — vil falle gjennom som invalid
    }
  }

  const result = await unsubscribe(token);
  return new NextResponse('', { status: result.ok ? 200 : 400 });
}

function buildHtml({ success }: { success: boolean }): string {
  const title = success ? 'Du er meldt av månedsbrevet' : 'Lenken er ugyldig';
  const body = success
    ? `<p>Du får ikke flere månedsbrev fra Tørny.</p>
       <p>Vil du melde deg på igjen senere? Du kan styre det fra
       <a href="https://tornygolf.no/profile">profilen din</a>.</p>`
    : `<p>Lenken er ugyldig eller har gått ut på dato.</p>
       <p>Logg inn og meld deg av fra
       <a href="https://tornygolf.no/profile">profilen din</a> istedenfor.</p>`;

  return `<!DOCTYPE html><html lang="nb">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} — Tørny</title>
</head>
<body style="margin:0;padding:0;background:#F8F6F0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1A1813;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#F8F6F0;">
    <tr>
      <td align="center" style="padding:48px 16px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:480px;background:#ffffff;border-radius:12px;padding:32px;">
          <tr><td>
            <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:1.1;margin:0 0 8px;color:#1B4332;letter-spacing:-0.01em;">
              Tørny<span style="color:#C9A961;">.</span>
            </h1>
            <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.2;margin:24px 0 16px;color:#1A1813;">
              ${title}
            </h2>
            <div style="font-size:16px;line-height:1.55;color:#1A1813;">
              ${body}
            </div>
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
