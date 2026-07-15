import { createClient } from '@supabase/supabase-js';
import { test, expect } from '@playwright/test';
import {
  envReady,
  skipReason,
  adminClient,
  PLAYER_EMAIL,
  SUPABASE_URL,
  fetchOtpForEmail,
  withFreshOtpRetry,
} from '../_helpers/games';

/**
 * Hostile-opplasting mot sponsor-logos-bucketen (#1052, #440-mønsteret).
 *
 * Migrasjon 0143 er authz-laget for appens første Storage-flate. Spec-en
 * angriper bucketen direkte med supabase-js (aldri via UI-et) og beviser at
 * policiene + bucket-grensene holder:
 *
 *   · anon upload            → avvist (ingen INSERT-policy for anon)
 *   · fremmed mappe          → avvist (foldername ≠ auth.uid)
 *   · feil mime (svg)        → avvist (allowed_mime_types er raster-only)
 *   · oversize (>1 MB)       → avvist (file_size_limit)
 *   · egen mappe, liten png  → OK, og public GET leser objektet anon (CDN-sti)
 *
 * Assertions på error-tilstedeværelse/status, aldri på feilmelding-copy.
 * Tagged @lifecycle (OTP-login). Env-gated til staging; rører aldri prod.
 */

const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const BUCKET = 'sponsor-logos';

/** 1×1 transparent PNG — minste gyldige raster-payload. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function anonStorageClient() {
  if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL not set');
  if (!ANON_KEY) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY not set');
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** supabase-js-klient signert inn som `email` (samme mønster som #849-riggen:
 *  mint OTP via admin-API-et, verifyOtp med supersede-race-retry). */
async function signedInClient(email: string) {
  const client = anonStorageClient();
  await withFreshOtpRetry<void>(
    () => fetchOtpForEmail(email),
    async (otp) => {
      const { error } = await client.auth.verifyOtp({
        email,
        token: otp,
        type: 'email',
      });
      if (!error) return { ok: true, value: undefined };
      const msg = error.message?.toLowerCase() ?? '';
      return {
        ok: false,
        retryable: msg.includes('expired') || msg.includes('invalid'),
      };
    },
    { label: `signedInClient(${email})` },
  );
  return client;
}

test.describe('sponsor-logos bucket – hostile upload @lifecycle', () => {
  test.skip(!envReady, `E2E-env mangler: ${skipReason}`);

  test('anon upload avvises (ingen INSERT-policy uten session)', async () => {
    const anon = anonStorageClient();
    const { data, error } = await anon.storage
      .from(BUCKET)
      .upload(`hostile-anon/${crypto.randomUUID()}.png`, TINY_PNG, {
        contentType: 'image/png',
      });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  test('authed upload mot FREMMED mappe avvises (foldername ≠ auth.uid)', async () => {
    const player = await signedInClient(PLAYER_EMAIL!);
    try {
      const { data, error } = await player.storage
        .from(BUCKET)
        .upload(`${crypto.randomUUID()}/hostile.png`, TINY_PNG, {
          contentType: 'image/png',
        });
      expect(data).toBeNull();
      expect(error).not.toBeNull();
    } finally {
      await player.auth.signOut();
    }
  });

  test('svg-mime avvises av allowed_mime_types (lagret SVG skal ikke finnes)', async () => {
    const player = await signedInClient(PLAYER_EMAIL!);
    try {
      const { data: userData } = await player.auth.getUser();
      const uid = userData?.user?.id;
      expect(uid).toBeTruthy();
      const { data, error } = await player.storage
        .from(BUCKET)
        .upload(`${uid}/${crypto.randomUUID()}.svg`, Buffer.from('<svg/>'), {
          contentType: 'image/svg+xml',
        });
      expect(data).toBeNull();
      expect(error).not.toBeNull();
    } finally {
      await player.auth.signOut();
    }
  });

  test('oversize (>1 MB) avvises av file_size_limit', async () => {
    const player = await signedInClient(PLAYER_EMAIL!);
    try {
      const { data: userData } = await player.auth.getUser();
      const uid = userData?.user?.id;
      expect(uid).toBeTruthy();
      const oversize = Buffer.alloc(1_200_000, 1);
      const { data, error } = await player.storage
        .from(BUCKET)
        .upload(`${uid}/${crypto.randomUUID()}.png`, oversize, {
          contentType: 'image/png',
        });
      expect(data).toBeNull();
      expect(error).not.toBeNull();
    } finally {
      await player.auth.signOut();
    }
  });

  test('egen mappe: upload OK, public GET leser objektet anon', async () => {
    const player = await signedInClient(PLAYER_EMAIL!);
    let uploadedPath: string | null = null;
    try {
      const { data: userData } = await player.auth.getUser();
      const uid = userData?.user?.id;
      expect(uid).toBeTruthy();
      const path = `${uid}/${crypto.randomUUID()}.png`;
      const { data, error } = await player.storage
        .from(BUCKET)
        .upload(path, TINY_PNG, { contentType: 'image/png' });
      expect(error).toBeNull();
      expect(data?.path).toBe(path);
      uploadedPath = path;

      // Public-CDN-stien skal svare anon uten Authorization-header.
      const res = await fetch(
        `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`,
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/png');
    } finally {
      await player.auth.signOut();
      if (uploadedPath) {
        // Rydd testobjektet med service-role så spec-en er sporløs.
        await adminClient().storage.from(BUCKET).remove([uploadedPath]);
      }
    }
  });
});
