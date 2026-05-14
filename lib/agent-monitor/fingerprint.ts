import { createHash } from 'node:crypto';

export type FingerprintInput = {
  source: 'vercel' | 'supabase_pg' | 'supabase_auth' | 'supabase_advisor' | 'resend';
  message: string;
};

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const ISO_DATE_RE = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?\b/g;
const REQ_ID_RE = /\breq_[a-z0-9]+\b/gi;
const LINE_COL_RE = /:(\d+):(\d+)\b/g;

function normalize(message: string): string {
  return message
    .replace(UUID_RE, '<uuid>')
    .replace(ISO_DATE_RE, '<ts>')
    .replace(REQ_ID_RE, '<req>')
    .replace(LINE_COL_RE, ':<l>:<c>')
    .trim();
}

export function fingerprint(input: FingerprintInput): string {
  const normalized = `${input.source}|${normalize(input.message)}`;
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}
