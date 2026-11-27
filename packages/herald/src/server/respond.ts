// Every response carries the same security headers (threat model "Trước P2-01" 5) and no CORS header at all: a page
// of another origin may not read anything the Herald answers. Nothing is cached: pages hold codes and device names.
import type { IncomingMessage, ServerResponse } from 'node:http';

import { BODY_BYTES_MAX } from '../limit/limits.ts';
import { refusalPage } from './pages.ts';
import { REFUSAL_STATUS } from './refusal.ts';
import type { HeraldPages } from './pages.ts';
import type { HeraldRefusal } from './refusal.ts';

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};

const HTML = 'text/html; charset=utf-8';

export function send(
  res: ServerResponse,
  status: number,
  body: string | Buffer,
  headers: Readonly<Record<string, string>> = {},
): void {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': HTML, ...headers });
  res.end(body);
}

export const sendRefusal = (res: ServerResponse, pages: HeraldPages, refusal: HeraldRefusal): void => {
  send(res, REFUSAL_STATUS[refusal], refusalPage(pages, refusal));
};

/** The request body as text, or undefined past BODY_BYTES_MAX (the rest is not read). */
export async function readBody(req: IncomingMessage): Promise<string | undefined> {
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > BODY_BYTES_MAX) return undefined;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = chunk as Buffer;
    size += bytes.length;
    if (size > BODY_BYTES_MAX) return undefined;
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString('utf8');
}
