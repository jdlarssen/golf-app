// #2332 PR C: «Last ned dataene dine» i appen (Type A).
//
// Det som bevises: kallet går til rutas sti med GET, hver grunn til at det
// stoppet blir riktig utfall, og en 200 gir en fil i cache-mappa med svaret som
// JSON og et delingsark med den. Modulene mockes; at de finnes i bygget, viser
// PR-en med `Podfile.lock` og autolinking.
//
// Fila skal ikke bli liggende: på iPhone slettes den når arket lukkes, på
// Android (der mottakeren leser fila etter at arket er lukket) ved neste
// eksport. `mockDisk` er cache-mappa: det som står der etter kallet, ligger
// igjen på telefonen.
 
import { Platform } from 'react-native';
import { callWebRoute } from './webApi';
import { EXPORT_TIMEOUT_MS, clearDataExportFiles, dataExportFilename, downloadDataExport } from './dataExport';

jest.mock('./webApi', () => ({ callWebRoute: jest.fn() }));

const mockCreate = jest.fn();
const mockWrite = jest.fn();
const mockShareAsync = jest.fn();
const mockFiles: { name: string; uri: string }[] = [];
/** Navnene i cache-mappa akkurat nå. */
const mockDisk = new Set<string>();
/** Navn som nekter å la seg slette. */
const mockUndeletable = new Set<string>();
/** Det som lå i mappa da delingsarket åpnet. */
let mockDiskAtShare: string[] = [];

jest.mock('expo-file-system', () => ({
  Paths: {
    cache: {
      uri: 'file:///cache/',
      list: () =>
        [...mockDisk].map((name) => ({
          name,
          delete: () => {
            if (mockUndeletable.has(name)) throw new Error('låst');
            mockDisk.delete(name);
          },
        })),
    },
  },
  File: class {
    uri: string;
    name: string;
    constructor(dir: { uri: string }, name: string) {
      this.name = name;
      this.uri = `${dir.uri}${name}`;
      mockFiles.push({ name, uri: this.uri });
    }
    create(options: unknown) {
      mockCreate(options);
      mockDisk.add(this.name);
    }
    write(content: string) {
      mockWrite(content);
    }
  },
}));
jest.mock('expo-sharing', () => ({ shareAsync: (...args: unknown[]) => mockShareAsync(...args) }));

const call = callWebRoute as jest.Mock;
// Telefonens lokale tid (suiten går i UTC, `jest.config.js`).
const NOW = new Date(2026, 10, 20, 0, 30);

beforeEach(() => {
  jest.clearAllMocks();
  mockFiles.length = 0;
  mockDisk.clear();
  mockUndeletable.clear();
  mockDiskAtShare = [];
  mockShareAsync.mockImplementation(async () => {
    mockDiskAtShare = [...mockDisk];
  });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('downloadDataExport', () => {
  it('henter fila med GET, skriver svaret som JSON i cache-mappa og deler den', async () => {
    const body = { exported_at: '2026-11-20T00:30:00.000Z', user: { id: 'meg' }, notifications: [] };
    call.mockResolvedValue({ ok: true, status: 200, body });

    expect(await downloadDataExport(NOW)).toEqual({ ok: true });

    // Eget tak: hele eksporten kan ta lenger tid enn appens vanlige 15 s.
    expect(call).toHaveBeenCalledWith('/api/profile/export', 'GET', undefined, { timeoutMs: EXPORT_TIMEOUT_MS });
    expect(EXPORT_TIMEOUT_MS).toBe(60_000);
    expect(mockFiles).toEqual([{ name: 'torny-data-2026-11-20.json', uri: 'file:///cache/torny-data-2026-11-20.json' }]);
    expect(mockCreate).toHaveBeenCalledWith({ overwrite: true });
    expect(JSON.parse(mockWrite.mock.calls[0][0] as string)).toEqual(body);
    expect(mockShareAsync).toHaveBeenCalledWith('file:///cache/torny-data-2026-11-20.json', {
      mimeType: 'application/json',
      UTI: 'public.json',
    });
  });

  it.each(['offline', 'no-web-base-url', 'unauthorized', 'network'] as const)(
    'stopper med «%s» når kallet ikke kom fram, uten å skrive noe',
    async (reason) => {
      call.mockResolvedValue({ ok: false, reason });

      expect(await downloadDataExport(NOW)).toEqual({ ok: false, reason });
      expect(mockWrite).not.toHaveBeenCalled();
      expect(mockShareAsync).not.toHaveBeenCalled();
    },
  );

  it.each([
    [401, 'unauthorized'],
    [500, 'failed'],
    [404, 'failed'],
  ] as const)('svar %i gir «%s» og ingen fil', async (status, reason) => {
    call.mockResolvedValue({ ok: true, status, body: {} });

    expect(await downloadDataExport(NOW)).toEqual({ ok: false, reason });
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('gir «failed» når fila ikke kan skrives eller arket ikke åpnes', async () => {
    call.mockResolvedValue({ ok: true, status: 200, body: {} });
    mockShareAsync.mockRejectedValueOnce(new Error('ingen app å dele med'));

    expect(await downloadDataExport(NOW)).toEqual({ ok: false, reason: 'failed' });
  });
});

describe('eksportfila blir ikke liggende', () => {
  const body = { exported_at: '2026-11-20T00:30:00.000Z', user: { id: 'meg' } };

  it('iPhone: fila finnes mens arket er åpent, og er slettet når det lukkes', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    call.mockResolvedValue({ ok: true, status: 200, body });

    expect(await downloadDataExport(NOW)).toEqual({ ok: true });

    expect(mockDiskAtShare).toEqual(['torny-data-2026-11-20.json']);
    expect([...mockDisk]).toEqual([]);
  });

  it('iPhone: fila slettes også når delingen kaster', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    call.mockResolvedValue({ ok: true, status: 200, body });
    mockShareAsync.mockRejectedValueOnce(new Error('ingen app å dele med'));

    expect(await downloadDataExport(NOW)).toEqual({ ok: false, reason: 'failed' });
    expect([...mockDisk]).toEqual([]);
  });

  it('Android: fila står til mottakeren har lest den, og forrige eksport ryddes før den nye skrives', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    mockDisk.add('torny-data-2026-11-01.json');
    call.mockResolvedValue({ ok: true, status: 200, body });

    expect(await downloadDataExport(NOW)).toEqual({ ok: true });

    expect(mockDiskAtShare).toEqual(['torny-data-2026-11-20.json']);
    expect([...mockDisk]).toEqual(['torny-data-2026-11-20.json']);
  });

  it('et svar som ikke er 200 rører ikke mappa', async () => {
    mockDisk.add('torny-data-2026-11-01.json');
    call.mockResolvedValue({ ok: true, status: 500, body: {} });

    await downloadDataExport(NOW);

    expect([...mockDisk]).toEqual(['torny-data-2026-11-01.json']);
  });
});

describe('clearDataExportFiles', () => {
  it('sletter eksportfilene og lar alt annet i cache-mappa ligge', () => {
    for (const name of ['torny-data-2026-11-01.json', 'torny-data-2026-11-20.json', 'delt-bilde.png', 'torny-data.json']) {
      mockDisk.add(name);
    }

    clearDataExportFiles();

    expect([...mockDisk].sort()).toEqual(['delt-bilde.png', 'torny-data.json']);
  });

  it('en fil som ikke lar seg slette, stopper ikke de andre, og ingenting kastes', () => {
    mockDisk.add('torny-data-2026-11-01.json');
    mockDisk.add('torny-data-2026-11-20.json');
    mockUndeletable.add('torny-data-2026-11-01.json');

    expect(() => clearDataExportFiles()).not.toThrow();

    expect([...mockDisk]).toEqual(['torny-data-2026-11-01.json']);
  });
});

describe('dataExportFilename', () => {
  it('bruker telefonens egen dato, med to sifre i måned og dag', () => {
    expect(dataExportFilename(new Date(2027, 0, 5, 23, 59))).toBe('torny-data-2027-01-05.json');
  });
});
