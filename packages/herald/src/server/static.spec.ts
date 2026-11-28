// Static paths as a pure function (threat model "Trước P2-01" 5). The Windows cases (a drive, a stream after `:`, a
// backslash, a device name) are refused on every system, so the same build folder is safe on Windows and macOS.
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { contentTypeOf, staticPath } from './static.ts';

const DIR = path.join('build dir', 'lite');

describe('staticPath (measure 5)', () => {
  it('maps a plain path under the folder, and / to index.html', () => {
    expect(staticPath(DIR, '/')).toBe(path.join(DIR, 'index.html'));
    expect(staticPath(DIR, '/assets/index-Ab_1.js')).toBe(path.join(DIR, 'assets', 'index-Ab_1.js'));
    expect(staticPath(DIR, '/my%20page.html')).toBeUndefined();
  });

  it('refuses every way out of the folder', () => {
    for (const target of ['/../x', '/a/../../x', '/..%2fx', '/%2e%2e%2fx', '/..%5cx', '/a/./b'])
      expect(staticPath(DIR, target)).toBeUndefined();
  });

  it('refuses hidden files and names Windows reads as something else', () => {
    for (const target of [
      '/.env',
      '/a/.git/config',
      '/C:/x',
      '/index.html:stream',
      '/CON',
      '/nul.txt',
      '/lpt1',
      '/aux.js',
    ])
      expect(staticPath(DIR, target)).toBeUndefined();
    expect(staticPath(DIR, '/console.js')).toBe(path.join(DIR, 'console.js'));
  });

  it('refuses a path that is not valid percent-encoding, or holds a NUL', () => {
    expect(staticPath(DIR, '/%E0%A4%A')).toBeUndefined();
    expect(staticPath(DIR, '/a%00.js')).toBeUndefined();
  });
});

describe('contentTypeOf', () => {
  it('names the type of a known extension, in any case, and octet-stream otherwise', () => {
    expect(contentTypeOf('a/INDEX.HTML')).toBe('text/html; charset=utf-8');
    expect(contentTypeOf('manifest.webmanifest')).toBe('application/manifest+json');
    expect(contentTypeOf('blob.bin')).toBe('application/octet-stream');
  });
});
