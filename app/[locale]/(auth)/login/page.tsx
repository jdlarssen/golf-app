import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { BrandHero } from '@/components/ui/BrandHero';
import { SendCodeForm } from './_components/SendCodeForm';
import { VerifyCodeForm } from './_components/VerifyCodeForm';

type SearchParams = Promise<{
  step?: string | string[];
  email?: string | string[];
  error?: string | string[];
  next?: string | string[];
}>;

// The set of valid error codes that map to a catalog key.
// An unrecognised ?error= value falls back to 'unknown'.
const KNOWN_ERROR_CODES = new Set([
  'rate_limited',
  'user_not_found',
  'invite_expired',
  'disposable_email',
  'code_invalid',
  'code_expired',
  'link_expired',
  'unknown',
] as const);

type ErrorCode = typeof KNOWN_ERROR_CODES extends Set<infer T> ? T : never;

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const t = await getTranslations('auth');

  const params = await searchParams;
  const step = first(params.step) === 'verify' ? 'verify' : 'email';
  const email = first(params.email) ?? '';
  const next = first(params.next) ?? '';
  const errorCodeRaw = first(params.error);
  const errorCode: ErrorCode | undefined =
    errorCodeRaw && KNOWN_ERROR_CODES.has(errorCodeRaw as ErrorCode)
      ? (errorCodeRaw as ErrorCode)
      : errorCodeRaw
        ? 'unknown'
        : undefined;
  const errorMessage = errorCode ? t(`errors.${errorCode}`) : undefined;

  const resendQs = new URLSearchParams();
  if (email) resendQs.set('email', email);
  if (next) resendQs.set('next', next);
  const resendHref = `/login${resendQs.toString() ? '?' + resendQs.toString() : ''}`;

  return (
    <AppShell>
      <div className="mt-10">
        <BrandHero className="mb-10" />
        <Card>
          {errorMessage && (
            <div role="alert" className="mb-4">
              <Banner tone="error">{errorMessage}</Banner>
            </div>
          )}

          {step === 'email' ? (
            <SendCodeForm
              defaultEmail={email}
              next={next}
              allowSelfRegistration={
                process.env.NEXT_PUBLIC_ALLOW_SELF_REGISTRATION === 'true'
              }
            />
          ) : (
            <VerifyCodeForm
              email={email}
              next={next}
              resendHref={resendHref}
            />
          )}
        </Card>
      </div>
    </AppShell>
  );
}
