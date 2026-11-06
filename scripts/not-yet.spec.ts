import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { findPlanItemTitle, notYetMessage, run } from './not-yet.mjs';

const SCRIPT = fileURLToPath(new URL('not-yet.mjs', import.meta.url));
const PLAN = readFileSync(new URL('../docs/implementation-plan.md', import.meta.url), 'utf8');

describe('findPlanItemTitle', () => {
  it('reads the task cell of a §8 row as plain text', () => {
    expect(findPlanItemTitle(PLAN, 'P0-03')).toMatch(/^Schema quest/);
  });

  it('drops markdown links and code ticks, and shortens long titles', () => {
    const plan = `| P9-99 | Read [the plan](x.md) and run \`pnpm check\` | files | done | todo |`;
    expect(findPlanItemTitle(plan, 'P9-99')).toBe('Read the plan and run pnpm check');
    const long = `| P9-98 | ${'a'.repeat(300)} | f | d | s |`;
    expect(findPlanItemTitle(long, 'P9-98')).toHaveLength(160);
  });

  it('returns undefined for a task the plan does not have', () => {
    expect(findPlanItemTitle(PLAN, 'P9-99')).toBeUndefined();
  });
});

describe('run', () => {
  it('names the script and the task that will build it, and exits 0', () => {
    const { code, text } = run(['P0-07'], 'docs:check');
    expect(code).toBe(0);
    expect(text).toContain('NOT YET: pnpm docs:check');
    expect(text).toContain('P0-07 builds it');
  });

  it('fails for a missing or unknown task id, so a stale placeholder cannot hide', () => {
    expect(run([], 'schemas').code).toBe(1);
    expect(run(['P9-99'], 'schemas')).toEqual({
      code: 1,
      text: 'not-yet: no task P9-99 in docs/implementation-plan.md §8',
    });
  });

  it('reads extra arguments without failing (pnpm schemas --check)', () => {
    expect(run(['P0-03', '--check'], 'schemas').code).toBe(0);
  });
});

describe('notYetMessage', () => {
  it('falls back to a neutral name outside pnpm', () => {
    expect(notYetMessage(undefined, 'P0-08', 'CLI')).toMatch(/^NOT YET: This script/);
  });
});

describe('the script as a process', () => {
  // Only what the script reads goes to the child, never process.env wholesale (CLAUDE.md).
  const env = { npm_lifecycle_event: 'schemas', SystemRoot: process.env.SystemRoot ?? '' };

  it('prints to stdout and exits 0 for a known task', () => {
    const out = execFileSync(process.execPath, [SCRIPT, 'P0-03', '--check'], { env, encoding: 'utf8' });
    expect(out).toContain('NOT YET: pnpm schemas');
  });

  it('exits 1 with the reason on stderr for an unknown task', () => {
    const result = spawnSync(process.execPath, [SCRIPT, 'P9-99'], { env, encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('no task P9-99');
  });
});
