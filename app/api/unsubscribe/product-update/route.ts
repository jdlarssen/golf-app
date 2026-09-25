import { NextResponse, type NextRequest } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { verifyUnsubToken } from '@/lib/productUpdates/unsubscribeToken';
import { expectOne, NoRowsAffectedError } from '@/lib/supabase/affectedRows';
import { mailWordmarkHtml } from '@/lib/mail/wordmark';

// Unauthenticated unsubscribe-endpoint (issue #202).
//
// GET  → browser visning. Verifiser token, marker bruker som unsubscribed,
//        render enkel HTML-side. Hvis token er ugyldig/utløpt: 400 med
//        norsk feilmelding. Gyldig token uten brukerrad (slettet konto): 404.
//
// POST → RFC 8058 one-click unsubscribe fra mail-klient. Samme verifisering
//        + DB-skriv, men returner 200 med tom body (mail-klient venter ikke
//        HTML).
//
// Bruker getAdminClient() siden endepunktet er offentlig — RLS gjelder ikke.
// Token-en er HMAC-signert med PRODUCT_UPDATE_UNSUB_SECRET så uautentisert
// kall kan ikke unsubscribe vilkårlige brukere.


// `not_found` (#2054): the token is valid but the write matched 0 rows — the
// account was hard-deleted after the mail went out. Never answer «meldt av».
type UnsubscribeResult = 'ok' | 'invalid' | 'not_found';

async function unsubscribe(token: string | null): Promise<UnsubscribeResult> {
  if (!token) return 'invalid';
  const verified = verifyUnsubToken(token);
  if (!verified) return 'invalid';

  const admin = getAdminClient();
  try {
    expectOne(
      await admin
        .from('users')
        .update({ product_updates_unsubscribed_at: new Date().toISOString() })
        .eq('id', verified.userId)
        .select('id'),
      'unsubscribe/product-update',
    );
  } catch (err) {
    if (err instanceof NoRowsAffectedError) {
      console.warn('[unsubscribe/product-update] no user row for token', verified.userId);
      return 'not_found';
    }
    console.error('[unsubscribe/product-update] update failed', err);
    return 'invalid';
  }

  return 'ok';
}

const STATUS: Record<UnsubscribeResult, number> = { ok: 200, invalid: 400, not_found: 404 };

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  const result = await unsubscribe(token);

  return new NextResponse(buildHtml(result), {
    status: STATUS[result],
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
  return new NextResponse('', { status: STATUS[result] });
}

function buildHtml(result: UnsubscribeResult): string {
  const title =
    result === 'ok'
      ? 'Du er meldt av månedsbrevet'
      : result === 'not_found'
        ? 'Vi finner ikke kontoen din'
        : 'Lenken er ugyldig';
  const body =
    result === 'ok'
      ? `<p>Du får ikke flere månedsbrev fra Tørny.</p>
       <p>Vil du melde deg på igjen senere? Du kan styre det fra
       <a href="https://tornygolf.no/profile">profilen din</a>.</p>`
      : result === 'not_found'
        ? `<p>Du får ingen månedsbrev fra oss.</p>`
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
              ${mailWordmarkHtml()}
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
