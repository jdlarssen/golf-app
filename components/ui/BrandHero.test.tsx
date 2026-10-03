import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createTranslator } from 'next-intl';
import en from '@/messages/en.json';
import { BrandHero } from './BrandHero';

// The global stub in vitest.setup.ts renders Norwegian, which matches the old
// hard-coded tagline — so this file renders English to prove the tagline
// follows the page language (#2351).
vi.mock('next-intl', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next-intl')>()),
  useTranslations: (namespace: string) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createTranslator<any, any>({ locale: 'en', messages: en, namespace }),
}));

describe('BrandHero', () => {
  it('#2351: the tagline follows the page language, with the gold word in gold', () => {
    const tagline = en.common.brandTagline;
    const fullText = tagline.replace(/<\/?par>/g, '');
    const goldWord = tagline.match(/<par>(.*)<\/par>/)?.[1];

    render(<BrandHero />);

    const paragraph = screen.getByText((_, el) => el?.tagName === 'P');
    expect(paragraph).toHaveTextContent(fullText);
    expect(paragraph.querySelector('.text-accent')).toHaveTextContent(goldWord!);
  });
});
