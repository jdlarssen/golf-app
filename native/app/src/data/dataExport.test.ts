// #2332 PR C: «Last ned dataene dine» i appen (Type A).
//
// Det som bevises: kallet går til rutas sti med GET, hver grunn til at det
// stoppet blir riktig utfall, og en 200 gir en fil i cache-mappa med svaret som
// JSON og et delingsark med den. Modulene mockes; at de finnes i bygget, viser
// PR-en med `Podfile.lock` og autolinking.
 
import { callWebRoute } from './webApi';
import { dataExportFilename, downloadDataExport } from './dataExport';

jest.mock('./webApi', () => ({ callWebRoute: jest.fn() }));

const mockCreate = jest.fn();
const mockWrite = jest.fn();
const mockShareAsync = jest.fn();
const mockFiles: { name: string; uri: string }[] = [];

jest.mock('expo-file-system', () => ({
  Paths: { cache: { uri: 'file:///cache/' } },
  File: class {
    uri: string;
    constructor(dir: { uri: string }, name: string) {
      this.uri = `${dir.uri}${name}`;
      mockFiles.push({ name, uri: this.uri });
    }
    create(options: unknown) {
      mockCreate(options);
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
  mockShareAsync.mockResolvedValue(undefined);
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

    expect(call).toHaveBeenCalledWith('/api/profile/export', 'GET');
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

describe('dataExportFilename', () => {
  it('bruker telefonens egen dato, med to sifre i måned og dag', () => {
    expect(dataExportFilename(new Date(2027, 0, 5, 23, 59))).toBe('torny-data-2027-01-05.json');
  });
});
