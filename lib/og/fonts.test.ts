// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fixComponentMatrices } from './componentMatrices';
import { loadFonts } from './fonts';

// #2625: a stand-in fix that copies and remembers what it handed back.
const { fixedBuffers } = vi.hoisted(() => ({ fixedBuffers: new WeakSet<ArrayBuffer>() }));
vi.mock('./componentMatrices', () => ({
  fixComponentMatrices: vi.fn((font: ArrayBuffer) => {
    const fixed = font.slice(0);
    fixedBuffers.add(fixed);
    return fixed;
  }),
}));

/**
 * A fetch that answers Google's css2 endpoint with one ttf url per request (the
 * url carries the requested axes) and the ttf with a byte. `failUpright` makes
 * the pinned optical-size request, the only one with `opsz`, come back empty.
 */
function stubFetch({ failUpright = false } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.startsWith('https://fonts.googleapis.com')) {
        const empty = failUpright && url.includes('opsz,wght@');
        return {
          ok: true,
          text: async () => (empty ? '' : `src: url(https://fonts.gstatic.com/x/${encodeURIComponent(url)}.ttf)`),
        };
      }
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) };
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

const named = (fonts: Awaited<ReturnType<typeof loadFonts>>['fonts'], name: string) =>
  fonts.filter((f) => f.name === name).map((f) => `${f.weight}${f.style}`);

describe('loadFonts', () => {
  it('without options loads only the four brand cuts', async () => {
    stubFetch();
    const { fonts, hasFrauncesDisplay } = await loadFonts();
    expect(fonts).toHaveLength(4);
    expect(hasFrauncesDisplay).toBe(false);
    expect(fonts.some((f) => f.name === 'FrauncesDisplay')).toBe(false);
  });

  it('headlineDisplay adds the display cut and its italic under FrauncesDisplay', async () => {
    stubFetch();
    const { fonts, hasFrauncesDisplay } = await loadFonts({ headlineDisplay: true });
    expect(hasFrauncesDisplay).toBe(true);
    expect(named(fonts, 'FrauncesDisplay').sort()).toEqual(['500italic', '500normal']);
  });

  it('keeps the italic under Fraunces when the display cut fails to load', async () => {
    stubFetch({ failUpright: true });
    const { fonts, hasFrauncesDisplay } = await loadFonts({ headlineDisplay: true });
    expect(hasFrauncesDisplay).toBe(false);
    expect(fonts.some((f) => f.name === 'FrauncesDisplay')).toBe(false);
    expect(named(fonts, 'Fraunces')).toContain('500italic');
  });

  it('inter600 adds Inter 600', async () => {
    stubFetch();
    const { fonts } = await loadFonts({ inter600: true });
    expect(named(fonts, 'Inter')).toContain('600normal');
  });

  it('hands Satori every font with its component matrices fixed, once per fetched buffer (#2625)', async () => {
    stubFetch();
    vi.mocked(fixComponentMatrices).mockClear();
    const { fonts } = await loadFonts({ headlineDisplay: true, inter600: true });
    expect(fonts).toHaveLength(7);
    expect(fonts.every((f) => fixedBuffers.has(f.data))).toBe(true);
    expect(fixComponentMatrices).toHaveBeenCalledTimes(7);
  });
});
