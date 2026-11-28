// Threat model "Trước P2-01" measure 3: the Herald runs with a minimal env, never reads the treasury and imports no
// work layer. `boundaries.mjs` already blocks the imports at lint time; this spec pins the same promise where the
// Herald is built, so a dependency or a `process.env` read cannot slip in through a file the lint rule does not see.
// The other five measures are named in the specs that test them (measure 1: stream.spec, server.spec; 2:
// command.spec; 4: stream.spec, command.spec, server.spec, pairing.spec; 5: server.spec, static.spec; 6: stream.spec).
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = path.join(import.meta.dirname, '..', '..');
const SRC = path.join(ROOT, 'src');
const DEPENDENCIES = ['@elvaria/domain', '@elvaria/eventlog', '@elvaria/store', 'ws'];
// What would give the Herald a secret or a hand in the work: the whole env, the treasury, the processes it could
// spawn, and the work-layer packages (ADR 0001, ADR 0013).
const FORBIDDEN = [
  /\bprocess\.env\b/,
  /treasury/i,
  /node:child_process/,
  /@elvaria\/(steward|chancellor|runner-[a-z]+|hooks)\b/,
];

async function sourcesOf(dir: string): Promise<string[]> {
  const names = await readdir(dir, { recursive: true });
  return names
    .map((name) => name.split(path.sep).join('/'))
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.spec.ts') && !name.includes('__fixtures__/'));
}

describe('the Herald runs apart from secrets and the work layer (measure 3)', () => {
  it('depends only on domain, eventlog, store and ws', async () => {
    const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual(DEPENDENCIES);
  });

  it('reads no env, no treasury and spawns nothing in any source file', async () => {
    const files = await sourcesOf(SRC);
    expect(files.length).toBeGreaterThan(10);
    const hits: string[] = [];
    for (const file of files) {
      const text = await readFile(path.join(SRC, file), 'utf8');
      for (const pattern of FORBIDDEN) if (pattern.test(text)) hits.push(`${file}: ${pattern.source}`);
    }
    expect(hits).toEqual([]);
  });
});
