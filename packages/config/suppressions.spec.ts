import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { TEST_TIME_RULES } from './eslint-test-time.mjs';
import type { Suppressions } from './suppressions.mjs';
import { SUPPRESSIONS_FILE, strayEntries, suppressionGrowth } from './suppressions.mjs';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const WAIT = 'elvaria/no-real-wait';
const CLOCK = 'elvaria/no-real-clock';
const REASON = 'elvaria/timeout-reason';

/** git in this repo with only what it needs from the environment; '' when git fails. */
function git(args: string[]): string {
  const keys = ['PATH', 'SystemRoot', 'HOME', 'USERPROFILE'];
  const env = Object.fromEntries(keys.flatMap((key) => (process.env[key] ? [[key, process.env[key]]] : [])));
  try {
    return execFileSync('git', args, {
      cwd: REPO,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return '';
  }
}

/**
 * The list where this branch left main; undefined when git cannot tell (a shallow CI checkout has no main) or the
 * list is newer than that point.
 */
function listAtBase(): Suppressions | undefined {
  for (const ref of ['origin/main', 'main']) {
    const base = git(['merge-base', 'HEAD', ref]).trim();
    if (base === '') continue;
    const text = git(['show', `${base}:${SUPPRESSIONS_FILE}`]);
    return text === '' ? undefined : (JSON.parse(text) as Suppressions);
  }
  return undefined;
}

describe('suppressionGrowth', () => {
  const base: Suppressions = {
    'a.spec.ts': { [WAIT]: { count: 2 } },
    'b.spec.ts': { [CLOCK]: { count: 1 } },
  };

  it('accepts a list that shrank or lost a file', () => {
    expect(suppressionGrowth(base, { 'a.spec.ts': { [WAIT]: { count: 1 } } })).toEqual([]);
  });

  it('names a count that rose, and the total it raised', () => {
    const head = { ...base, 'a.spec.ts': { [WAIT]: { count: 3 } } };
    expect(suppressionGrowth(base, head)).toEqual([`a.spec.ts: ${WAIT} 2 → 3`, `${WAIT}: 2 → 3 in all`]);
  });

  it('lets a renamed spec take its entry along', () => {
    const head = { 'c.spec.ts': { [WAIT]: { count: 2 } }, 'b.spec.ts': { [CLOCK]: { count: 1 } } };
    expect(suppressionGrowth(base, head)).toEqual([]);
  });

  it('names a file or a rule new to the list when nothing left it', () => {
    const head = {
      ...base,
      'c.spec.ts': { [WAIT]: { count: 1 } },
      'b.spec.ts': { [CLOCK]: { count: 1 }, [REASON]: { count: 1 } },
    };
    expect(suppressionGrowth(base, head)).toEqual([`${WAIT}: 2 → 3 in all`, `${REASON}: 0 → 1 in all`]);
  });
});

describe('strayEntries', () => {
  it('names another rule, a file that is gone, and a file that is not a spec', () => {
    const list: Suppressions = {
      'a.spec.ts': { [WAIT]: { count: 1 }, 'no-console': { count: 1 } },
      'gone.spec.ts': { [WAIT]: { count: 1 } },
      'a.ts': { [CLOCK]: { count: 1 } },
    };
    expect(strayEntries(list, TEST_TIME_RULES, (file) => file !== 'gone.spec.ts')).toEqual([
      'a.spec.ts: no-console is not a test-time rule',
      'gone.spec.ts: not a spec file on disk',
      'a.ts: not a spec file on disk',
    ]);
  });
});

describe(`the repo's ${SUPPRESSIONS_FILE}`, () => {
  const list = JSON.parse(readFileSync(join(REPO, SUPPRESSIONS_FILE), 'utf8')) as Suppressions;
  const base = listAtBase();

  it('lists only the test-time rules of specs on disk', () => {
    expect(strayEntries(list, TEST_TIME_RULES, (file) => existsSync(join(REPO, file)))).toEqual([]);
  });

  // Fixing a test and running `eslint --prune-suppressions` shrinks the list; nothing else may change it.
  it.skipIf(base === undefined)('has not grown since this branch left main', () => {
    expect(suppressionGrowth(base ?? {}, list)).toEqual([]);
  });
});
