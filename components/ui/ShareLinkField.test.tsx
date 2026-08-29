import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ShareLinkField } from './ShareLinkField';

/**
 * Type C render-test (én per komponent, #1803): feltet viser URL-en, og
 * kopier-knappen skriver til utklippstavla og bytter til bekreftelses-label.
 * Adapterne (CupShareLink m.fl.) er rene prop-mappinger og testes ikke hver
 * for seg.
 */

const writeTextMock = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
  vi.clearAllMocks();
  writeTextMock.mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: writeTextMock },
    configurable: true,
  });
});

describe('ShareLinkField', () => {
  it('viser URL-en og bekrefter kopiering', async () => {
    render(
      <ShareLinkField
        url="https://tornygolf.no/signup/abc12345"
        ariaLabel="Påmeldingslenke"
        copyLabel="Kopier lenke"
        copiedLabel="Kopiert!"
        errorText="Kopiering feilet"
        testId="share-link"
      />,
    );

    expect(screen.getByTestId('share-link')).toHaveValue(
      'https://tornygolf.no/signup/abc12345',
    );

    fireEvent.click(screen.getByTestId('share-link-copy'));

    await waitFor(() => {
      expect(screen.getByText('Kopiert!')).toBeInTheDocument();
    });
    expect(writeTextMock).toHaveBeenCalledWith(
      'https://tornygolf.no/signup/abc12345',
    );
  });
});
