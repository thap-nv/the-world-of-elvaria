// Files of the client's build folder (P2-07 brings one; threat model "Trước P2-01" 5). A URL path becomes a file
// only when it stays inside the folder (`staysInside` of store) and every segment is a plain name: no hidden file, no
// `:` (a Windows stream or drive), no backslash, no Windows device name such as `CON` or `nul.txt`.
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { staysInside } from '@elvaria/store';

const SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;
const WINDOWS_DEVICE = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
const INDEX = 'index.html';

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const plain = (segment: string): boolean => SEGMENT.test(segment) && !WINDOWS_DEVICE.test(segment);

/** The file under `dir` that URL path `urlPath` (still percent-encoded) names, or undefined when it may name none. */
export function staticPath(dir: string, urlPath: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return undefined;
  }
  const relative = decoded.replace(/^\/+/, '') || INDEX;
  if (!staysInside(relative) || !relative.split('/').every(plain)) return undefined;
  return path.join(dir, ...relative.split('/'));
}

export const contentTypeOf = (file: string): string =>
  CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';

/** The bytes of a regular file, or undefined for a folder or a missing file. */
export async function readStatic(file: string): Promise<Buffer | undefined> {
  try {
    if (!(await stat(file)).isFile()) return undefined;
    return await readFile(file);
  } catch {
    return undefined;
  }
}
