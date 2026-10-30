'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { Button, buttonClasses } from '@/components/ui/Button';
import {
  clearWizardDraft,
  listWizardDrafts,
  type ListedWizardDraft,
} from '@/app/[locale]/admin/games/new/wizardStatePersistence';

/**
 * The client half of «Slett utkastet» (#2459). `listWizardDrafts(userId)` only
 * returns this user's own, valid drafts, so a key that is somebody else's,
 * expired or made up finds nothing: the page says the draft is gone and deletes
 * nothing.
 */
export function ConfirmDeleteDraft({
  userId,
  draftKey,
}: {
  userId: string;
  draftKey: string;
}) {
  const t = useTranslations('resumeDraft.deletePage');
  const tCard = useTranslations('resumeDraft');
  const router = useRouter();
  // `undefined` = not read yet (storage only exists after mount).
  const [draft, setDraft] = useState<ListedWizardDraft | null | undefined>(undefined);

  useEffect(() => {
    const found = listWizardDrafts(userId).find((d) => d.key === draftKey) ?? null;
    // Browser storage cannot be read during render without a hydration mismatch.
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setDraft(found);
  }, [userId, draftKey]);

  if (draft === undefined) return null;

  if (draft === null) {
    return (
      <div className="px-1" data-testid="delete-draft-missing">
        <h1 className="mb-3 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          {t('missing')}
        </h1>
        <Link href="/" className={`${buttonClasses('primary', 'medium')} mt-4 w-full`}>
          {t('backHome')}
        </Link>
      </div>
    );
  }

  const { summary } = draft.resume;
  const meta = [summary.formatLabel, summary.courseName].filter(Boolean).join(' · ');

  return (
    <>
      <div className="px-1">
        <h1 className="mb-3 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          {t('heading')}
        </h1>
        {meta && <p className="font-sans text-[13px] leading-relaxed text-muted">{meta}</p>}
      </div>

      <div
        className="mt-5 rounded-xl border bg-surface px-4 py-3.5"
        style={{ borderColor: 'rgba(180, 60, 60, 0.18)' }}
      >
        <p className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          {t('permanentLabel')}
        </p>
        <ul className="space-y-1 font-sans text-[13px] text-text">
          <li>{summary.title ?? tCard('untitled')}</li>
          <li>{t('onThisDevice')}</li>
        </ul>
        <p className="mt-3 font-sans text-[12px] leading-relaxed text-muted">{t('cannotUndo')}</p>
      </div>

      <div className="mt-6 flex flex-col gap-2.5">
        <Button
          type="button"
          size="medium"
          data-testid="delete-draft-confirm"
          className="w-full"
          style={{ background: 'var(--danger-deep)', borderColor: 'var(--danger-deep)' }}
          onClick={() => {
            clearWizardDraft(draft.key);
            router.push('/');
          }}
        >
          {t('deleteButton')}
        </Button>
        <Link
          href="/"
          data-testid="delete-draft-cancel"
          className="flex min-h-12 items-center justify-center rounded-full border border-border bg-surface px-3 py-3 text-center font-sans text-[13px] font-medium text-text"
        >
          {t('cancelButton')}
        </Link>
      </div>
    </>
  );
}
