// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GET } from './route';

const UPLOAD_KEY =
  'CC:57:CB:7B:C5:BC:2A:6F:9E:73:42:79:03:DA:A8:99:76:EF:C7:CA:F3:4B:2F:F3:2C:FA:BE:50:2C:7D:6C:0F';
const PLAY_SIGNING_KEY =
  '18:9D:DB:09:F2:47:89:67:D6:D5:69:F8:73:06:CB:17:32:D9:95:44:06:F3:D2:24:60:22:4B:DD:13:59:AE:68';
const FINGERPRINT = /([0-9A-F]{2}:){31}[0-9A-F]{2}/g;

describe('assetlinks.json', () => {
  it('lists the upload key and the Play app signing key for the app package', async () => {
    const body = await GET().json();
    expect(body).toHaveLength(1);
    expect(body[0].relation).toEqual(['delegate_permission/common.handle_all_urls']);
    expect(body[0].target.namespace).toBe('android_app');
    expect(body[0].target.package_name).toBe('no.tornygolf.app');
    expect(body[0].target.sha256_cert_fingerprints).toEqual([UPLOAD_KEY, PLAY_SIGNING_KEY]);
  });

  // store-build-proof-android.sh reads the line after `// Upload key` and fails
  // unless it finds exactly one fingerprint there (AGENTS.md trap 4: one rule,
  // two readers). A second key on the same line, or none, breaks the build proof.
  it('keeps exactly one fingerprint on the line after `// Upload key`', () => {
    const source = readFileSync(resolve(__dirname, 'route.ts'), 'utf8').split('\n');
    const at = source.findIndex((line) => line.includes('// Upload key'));
    expect(at).toBeGreaterThan(-1);
    expect(source[at + 1].match(FINGERPRINT)).toEqual([UPLOAD_KEY]);
  });
});
