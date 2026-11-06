// The hook imports this package on every tool call and has < 100 ms to finish (implementation-plan §3.6),
// so loading the entry must not load @elvaria/domain or zod (schema.ts explains the deferred import).
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import { testScript } from '../test/temp.ts';

const ENTRY = fileURLToPath(new URL('index.ts', import.meta.url));

describe('package entry', () => {
  it('loads without @elvaria/domain or zod', () => {
    const output = execFileSync(process.execPath, [testScript('load-probe.ts'), ENTRY], { encoding: 'utf8' });
    const { loaded } = JSON.parse(output) as { loaded: string[]; ms: number };
    expect(loaded.some((url) => url.endsWith('/eventlog/src/append.ts'))).toBe(true);
    expect(loaded.filter((url) => /\/zod\/|\/packages\/domain\//.test(url))).toEqual([]);
  });
});
