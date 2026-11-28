'use client';

import { useTranslations } from 'next-intl';
import { CONTACT_EMAIL, TERMS_PATH } from '@/lib/legal/terms';

export function AppVersionFooter() {
  const t = useTranslations('legal.privacy');
  const tCommon = useTranslations('common');
  const tTerms = useTranslations('legal.terms');
  const version = process.env.NEXT_PUBLIC_APP_VERSION;
  const sha = process.env.NEXT_PUBLIC_APP_SHA;
  if (!version) return null;
  return (
    <p className="mt-10 text-center text-xs text-muted">
      {/* aria-label on a plain span is ignored; the label goes in as text. */}
      <span className="tabular-nums">
        <span className="sr-only">{tCommon('appVersionLabel')} </span>
        v{version}
        {sha ? ` · ${sha}` : ''}
      </span>
      {' · '}
      {/* Deliberate <a>, not <Link>: /legal/privacy is a public page reachable
          past the auth-gate via its own proxy.ts matcher (see CLAUDE.md). A full
          navigation re-runs that gate; client-side <Link> would not. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a
        href="/legal/privacy"
        className="underline underline-offset-2 hover:text-text transition-colors"
      >
        {t('kicker')}
      </a>
      {/* #3019: the terms and a way to reach Tørny (Apple guideline 1.2). */}
      {' · '}
      <a href={TERMS_PATH} className="underline underline-offset-2 hover:text-text transition-colors">
        {tTerms('footerLink')}
      </a>
      {' · '}
      <a
        href={`mailto:${CONTACT_EMAIL}`}
        className="underline underline-offset-2 hover:text-text transition-colors"
      >
        {tTerms('contactLink')}
      </a>
    </p>
  );
}
