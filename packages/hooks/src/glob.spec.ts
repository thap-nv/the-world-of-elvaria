import { describe, expect, it } from 'vitest';

import { globToRegExp } from './glob.ts';

const matches = (glob: string, path: string): boolean => globToRegExp(glob).test(path);

describe('globToRegExp', () => {
  it.each([
    ['.env', '.env', true],
    ['.env', 'a/.env', false],
    ['.env.*', '.env.local', true],
    ['.env.*', '.env', false],
    ['*.pem', 'key.pem', true],
    ['*.pem', 'certs/key.pem', false],
    ['infra/secrets/**', 'infra/secrets/db/key.txt', true],
    ['infra/secrets/**', 'infra/secrets', true],
    ['infra/secrets/**', 'infra/secretsx', false],
    ['infra/secrets/**', 'infra/other/key.txt', false],
    ['**/id_rsa', 'id_rsa', true],
    ['**/id_rsa', 'home/me/.ssh/id_rsa', true],
    ['a/**/b', 'a/b', true],
    ['a/**/b', 'a/x/y/b', true],
    ['a**b', 'axyb', true],
    ['a**b', 'ax/yb', false],
    ['file?.txt', 'file1.txt', true],
    ['file?.txt', 'file10.txt', false],
    ['*.{pem,key}', 'tls.key', true],
    ['*.{pem,key}', 'tls.crt', false],
    ['secret[0-9].txt', 'secret7.txt', true],
    ['secret[!0-9].txt', 'secret7.txt', false],
    ['secret[!0-9].txt', 'secretx.txt', true],
    ['a[b', 'a[b', true],
    ['{a,b', 'a', true],
    ['a,b}', 'a,b}', true],
    ['./.env', '.env', true],
    ['/infra\\secrets/**', 'infra/secrets/x', true],
    ['.ENV', '.env', true],
    ['price$(1).txt', 'price$(1).txt', true],
  ])('%s against %s: %s', (glob, path, expected) => {
    expect(matches(glob, path)).toBe(expected);
  });
});
