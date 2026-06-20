import { test, expect } from '@playwright/test';
import { adminClient, signInViaOtp } from '../_helpers/games';

/**
 * Full invitation flow e2e — covers issue #30.
 *
 * Phases (rendered as `test.step` blocks for clarity in trace viewer):
 *  1. Admin sender invitasjon til ny e-post via /admin/spillere.
 *  2. Verifiser at en rad havner i `public.invitations` (service-role-fetch).
 *  3. Invitee logger inn via OTP på /login (separat browser-context).
 *  4. Invitee fyller ut /complete-profile.
 *  5. Verifiser at `invitations.accepted_at` og `users.profile_completed_at`
 *     er satt.
 *  6. (Best effort) Invitee navigerer til seeded test-spill og taster én
 *     score — kjøres bare hvis `E2E_TEST_GAME_ID` er satt. Ellers logges
 *     blokkeren og fasen hoppes over.
 *
 * OTP-strategi (verify-only, delt med `_helpers/games.ts`):
 *  Vi driver KUN verify-steget på `/login` — aldri «Send meg kode» (sendCode →
 *  signInWithOtp). Send-steget er rate-limitet to veier (appens per-IP-bøtte
 *  `consumeLoginRateLimit` + Supabase sin OTP-send-throttle); når @gate logger
 *  de samme få e-postene inn fra én CI-IP trippes begge og gir
 *  `?error=rate_limited`. Den delte `signInViaOtp` minter en gyldig OTP via
 *  service-role `admin.generateLink({ type: 'magiclink' })` og navigerer rett
 *  til `?step=verify` — den ekte session-settende stien (verifyOtp → cookie)
 *  kjøres fortsatt, men send-laget berøres aldri.
 *
 * Env-krav:
 *  - `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (begge fra
 *    samme prosjekt som dev-serveren peker på).
 *  - `E2E_ADMIN_EMAIL` — e-post til en eksisterende admin-bruker
 *    (public.users.is_admin = true). Test logger inn som denne for å sende
 *    invitasjonen.
 *  - `E2E_INVITEE_EMAIL` (valgfri) — adressen som blir invitert. Default:
 *    `e2e-invitee+<timestamp>@tornygolf.no`. Bruk `+`-suffix for å unngå
 *    kollisjoner i parallell-kjøring.
 *  - `E2E_TEST_GAME_ID` (valgfri) — UUID for et eksisterende spill med
 *    status='active' og invitee i flight. Kun da kjører "play first round"-
 *    fasen; ellers logges blokkeren.
 *
 * Hvis kritiske env-vars mangler, hoppes hele testen over med en
 * beskrivende `test.skip()` — å markere lokal-utvikler-blokkere som hard-feil
 * ville bryte `npm run e2e` for alle som ikke har service-role-key.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL?.trim().toLowerCase();
const INVITEE_EMAIL =
  process.env.E2E_INVITEE_EMAIL?.trim().toLowerCase() ??
  `e2e-invitee+${Date.now()}@tornygolf.no`;
const TEST_GAME_ID = process.env.E2E_TEST_GAME_ID?.trim();

/**
 * Removes any prior auth.users + public.users + invitations rows for the
 * invitee so the test starts from a clean slate. Idempotent — safe to run
 * even when the user has never existed.
 */
async function resetInviteeState(email: string) {
  const admin = adminClient();

  // Delete prior invitations rows by email (cascade-safe, no FK in this dir).
  await admin.from('invitations').delete().ilike('email', email);

  // Look up the auth user (if any) and delete — cascade handles public.users.
  const { data: list } = await admin.auth.admin.listUsers();
  const existing = list?.users?.find(
    (u) => u.email?.toLowerCase() === email,
  );
  if (existing) {
    await admin.auth.admin.deleteUser(existing.id);
  }
}

const envReady = SUPABASE_URL && SERVICE_ROLE_KEY && ADMIN_EMAIL;
const skipReason = !SUPABASE_URL
  ? 'NEXT_PUBLIC_SUPABASE_URL ikke satt'
  : !SERVICE_ROLE_KEY
    ? 'SUPABASE_SERVICE_ROLE_KEY ikke satt — påkrevet for å hente OTP via auth.admin.generateLink'
    : !ADMIN_EMAIL
      ? 'E2E_ADMIN_EMAIL ikke satt — påkrevet for å signe inn admin som sender invitasjonen'
      : '';

test.describe('Full invitation flow (admin → OTP → profile → first round) @gate', () => {
  test.skip(!envReady, `E2E-env mangler: ${skipReason}`);

  // Disse testene tar tid — Supabase Auth + Resend round-trip kan være 3–5 s.
  // Gi rikelig tid før hver step utløper.
  test.slow();

  test.beforeAll(async () => {
    await resetInviteeState(INVITEE_EMAIL);
  });

  test.afterAll(async () => {
    // Best-effort cleanup. Hvis testen feilet midt-i lar vi raden være — neste
    // run starter clean uansett via beforeAll. Vi rydder kun for å unngå at
    // den faktiske prod-databasen samler på e2e-rader hvis denne testen
    // tilfeldigvis pekes på prod.
    try {
      await resetInviteeState(INVITEE_EMAIL);
    } catch {
      // Swallowed — cleanup-feil skal aldri skygge over selve test-resultatet.
    }
  });

  test('admin inviterer → invitee logger inn → fullfører profil → spiller første hull', async ({
    browser,
  }) => {
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();

    await test.step('Phase 1: Admin logger inn via OTP', async () => {
      await adminPage.goto('/login');
      await signInViaOtp(adminPage, ADMIN_EMAIL!);
    });

    await test.step('Phase 2: Admin navigerer til /admin/spillere og sender invitasjon', async () => {
      await adminPage.goto('/admin/spillere');
      await expect(
        adminPage.getByRole('heading', { name: 'Spillere' }),
      ).toBeVisible();

      // InviteForm er pakket i <details> — må klikkes opp før input dukker opp.
      await adminPage.getByTestId('invite-toggle').click();

      const emailInput = adminPage.getByLabel('E-postadresse');
      await expect(emailInput).toBeVisible();
      await emailInput.fill(INVITEE_EMAIL);
      await adminPage.getByRole('button', { name: 'Send invitasjon' }).click();

      // sendInvitation redirecter til /admin/spillere?status=sent&email=...
      // success-banner bekrefter happy path. Banneret inneholder invitee-eposten
      // (data, ikke copy), så vi asserter den i stedet for den norske teksten.
      await expect(adminPage).toHaveURL(/status=sent/, { timeout: 15_000 });
      await expect(adminPage.getByTestId('success-banner')).toContainText(
        INVITEE_EMAIL,
      );
    });

    await test.step('Phase 3: Verifiser at invitation-rad finnes via service-role', async () => {
      const admin = adminClient();
      const { data, error } = await admin
        .from('invitations')
        .select('email, accepted_at, expires_at')
        .ilike('email', INVITEE_EMAIL)
        .is('accepted_at', null);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(new Date(data![0].expires_at!).getTime()).toBeGreaterThan(
        Date.now(),
      );
    });

    // Bytter kontekst — invitee har ingen relasjon til admin-sesjonen, så
    // ny browser-context simulerer hen i en separat browser/enhet.
    const inviteeContext = await browser.newContext();
    const inviteePage = await inviteeContext.newPage();

    await test.step('Phase 4: Invitee logger inn på /login via OTP', async () => {
      await inviteePage.goto('/login');
      await signInViaOtp(inviteePage, INVITEE_EMAIL);
    });

    await test.step('Phase 5: Invitee redirectes til /complete-profile som ny bruker', async () => {
      // Trigger på auth.users oppretter placeholder-rad med
      // profile_completed_at=NULL, så proxy.ts slipper invitee gjennom
      // til root, og home-page redirecter videre til /complete-profile.
      // I praksis kan vi se enten /complete-profile direkte eller / som
      // bouncer videre. Vente på at URL-en lander der.
      await inviteePage.waitForURL(/\/complete-profile\b/, { timeout: 15_000 });
      await expect(
        inviteePage.getByRole('heading', { name: 'Fullfør profilen din' }),
      ).toBeVisible();
    });

    await test.step('Phase 6: Invitee fyller ut profil-skjema', async () => {
      // exact:true is required: 'Kallenavn' is a substring match for 'Navn'
      // (case-insensitive), so getByLabel('Navn') without exact resolves to 2
      // elements and throws a strict-mode violation. (#698)
      await inviteePage.getByLabel('Navn', { exact: true }).fill('E2E Test Spiller');
      // Kallenavn er valgfritt — droppes for å verifisere at NULL-pathen
      // i completeProfile-actionen håndteres riktig.
      await inviteePage.getByLabel('Handicap-index', { exact: true }).fill('18.5');
      // Gender is a required radio (complete-profile/page.tsx) — completeProfile
      // returns fail('gender_required') and stays on /complete-profile without it.
      // 'Herre' = onboarding.genderMale. (#698)
      await inviteePage.getByRole('radio', { name: 'Herre' }).check();

      // Norwegian submit button is 'Sett i gang' (onboarding.submitButton in no.json).
      await inviteePage
        .getByRole('button', { name: 'Sett i gang' })
        .click();

      // completeProfile redirecter til '/' ved suksess.
      await expect(inviteePage).toHaveURL(/^\/?(\?.*)?$/, {
        timeout: 15_000,
      });
    });

    await test.step('Phase 7: Verifiser at invitation er marked accepted og profil er complete', async () => {
      const admin = adminClient();

      const { data: invs } = await admin
        .from('invitations')
        .select('accepted_at')
        .ilike('email', INVITEE_EMAIL);
      expect(invs?.[0]?.accepted_at).toBeTruthy();

      const { data: list } = await admin.auth.admin.listUsers();
      const authUser = list?.users?.find(
        (u) => u.email?.toLowerCase() === INVITEE_EMAIL,
      );
      expect(authUser).toBeDefined();

      const { data: profile } = await admin
        .from('users')
        .select('name, hcp_index, profile_completed_at')
        .eq('id', authUser!.id)
        .single();

      expect(profile?.name).toBe('E2E Test Spiller');
      expect(Number(profile?.hcp_index)).toBeCloseTo(18.5);
      expect(profile?.profile_completed_at).toBeTruthy();
    });

    await test.step('Phase 8: Invitee taster første score (best effort — krever seeded test-spill)', async () => {
      if (!TEST_GAME_ID) {
        // Dokumenter blokkeren tydelig i trace-viewer i stedet for å feile.
        // Issue #30 ber om hele happy-pathen, men et komplett spill med 8
        // registrerte spillere + bane + tee_box krever en seed-fixture
        // som ikke finnes i e2e-suiten ennå.
        test.info().annotations.push({
          type: 'skip-reason',
          description:
            'E2E_TEST_GAME_ID ikke satt — score-entry-fasen krever et seeded aktivt spill med invitee i flight.',
        });
        return;
      }

      await inviteePage.goto(`/games/${TEST_GAME_ID}`);
      // Klikker "Start runden →" som tar invitee til hull 1.
      await inviteePage
        .getByRole('link', { name: /Start runden|Fortsett runden/ })
        .click();

      await inviteePage.waitForURL(
        new RegExp(`/games/${TEST_GAME_ID}/holes/\\d+`),
      );

      // Bruk +1-knappen for å registrere én score (par+1 etter første tap).
      // Skjer på den første ScoreCard på siden (invitee sin egen).
      const myPlusButton = inviteePage
        .getByRole('button', { name: '+1' })
        .first();
      await myPlusButton.click();

      // Verifiser at score-tallet ble registrert (sync-bekreftelse skjer
      // optimistisk via writeScore → Dexie → cache).
      await expect(
        inviteePage.locator('[data-testid="score-number"]').first(),
      ).not.toHaveText('—');
    });

    await adminContext.close();
    await inviteeContext.close();
  });
});
