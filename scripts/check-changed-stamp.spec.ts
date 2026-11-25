// The narrow stamp of `pnpm check:changed` (RC-01, scripts/check-stamp.mjs), in a real git repo in a temp folder
// whose name has a space; git runs without the caller's GIT_* variables (implementation-plan §6). The checks
// themselves are replaced: what is under test is when a run stamps HEAD, not what pnpm runs.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { tempDir } from '@elvaria/testkit';
import type { TempDir } from '@elvaria/testkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_BASE, main } from './check-changed.mjs';
import { toolEnv } from './check-changed-run.mjs';

let dir: string;
let temp: TempDir;
const git = (...args: string[]): string =>
  execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: toolEnv() }).trim();
const put = async (file: string, text = 'x'): Promise<void> => {
  await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
  await writeFile(path.join(dir, file), text);
};

beforeEach(async () => {
  temp = await tempDir('check changed stamp');
  dir = temp.root;
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.com');
  git('config', 'commit.gpgsign', 'false');
  await put('docs/old.md');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  git('checkout', '-q', '-b', 'work');
});

afterEach(() => temp.remove());

describe('the narrow stamp for the pre-push hook (RC-01)', () => {
  interface Deps {
    env?: Record<string, string>;
    checks?: () => number;
  }
  const stampFile = (): string => path.join(dir, '.git', 'elvaria-check-ok');
  const stampText = (): string | undefined =>
    existsSync(stampFile()) ? readFileSync(stampFile(), 'utf8') : undefined;
  /** main() in this process, with the checks replaced by `checks`; ELVARIA_CHECK_BASE only from `env`. */
  function check(argv: string[], { env = {}, checks = () => 0 }: Deps = {}) {
    const lines: string[] = [];
    const ran: string[][][] = [];
    const run = (commands: string[][]): number => {
      ran.push(commands);
      return checks();
    };
    const code = main(argv, dir, (line) => lines.push(line), { env, run });
    return { code, out: lines.join('\n'), ran };
  }

  beforeEach(async () => {
    await put('docs/new.md');
    await put('scripts/a.mjs');
    git('add', '-A');
    git('commit', '-q', '-m', 'work');
    git('update-ref', 'refs/remotes/origin/main', 'main');
  });

  it('stamps changed <head> after a green default run on a clean tree with a rule for every path', () => {
    const result = check([]);
    expect(result.code).toBe(0);
    expect(result.ran).toHaveLength(1);
    expect(stampText()).toBe(`changed ${git('rev-parse', 'HEAD')}\n`);
    expect(check(['--base', DEFAULT_BASE]).code).toBe(0);
    expect(stampText()).toBe(`changed ${git('rev-parse', 'HEAD')}\n`);
  });

  it("reads ELVARIA_CHECK_BASE from the env it is given, not from this process's", () => {
    vi.stubEnv('ELVARIA_CHECK_BASE', 'f'.repeat(40));
    try {
      expect(check([]).code).toBe(0);
    } finally {
      vi.unstubAllEnvs();
    }
    expect(stampText()).toBe(`changed ${git('rev-parse', 'HEAD')}\n`);
  });

  it('stamps nothing for --only, --dry-run, another --base or ELVARIA_CHECK_BASE', () => {
    const base = git('rev-parse', 'main');
    expect(check(['--only', 'docs']).code).toBe(0);
    expect(check(['--dry-run']).code).toBe(0);
    expect(check(['--base', 'main']).code).toBe(0);
    expect(check([], { env: { ELVARIA_CHECK_BASE: base } }).code).toBe(0);
    expect(stampText()).toBeUndefined();
  });

  it('stamps nothing when a check fails or a path has no rule', async () => {
    expect(check([], { checks: () => 1 }).code).toBe(1);
    expect(stampText()).toBeUndefined();
    await put('eslint.config.mjs');
    git('add', '-A');
    git('commit', '-q', '-m', 'config');
    const uncovered = check([]);
    expect(uncovered.code).toBe(0);
    expect(uncovered.out).toContain('a path no rule covers, no stamp');
    expect(stampText()).toBeUndefined();
  });

  it('stamps nothing when the tree has changes at the start, or gets them or a commit during the run', async () => {
    await put('docs/new.md', 'edited');
    expect(check([]).out).toContain('no stamp');
    git('checkout', '--', 'docs/new.md');
    const dirtied = () => {
      writeFileSync(path.join(dir, 'docs', 'late.md'), 'x');
      return 0;
    };
    expect(check([], { checks: dirtied }).out).toContain('no stamp');
    git('clean', '-fdq');
    const committed = () => {
      git('commit', '-q', '--allow-empty', '-m', 'during');
      return 0;
    };
    expect(check([], { checks: committed }).out).toContain('HEAD moved');
    expect(stampText()).toBeUndefined();
  });

  it('keeps the full stamp of pnpm check for the same HEAD', () => {
    const full = `${git('rev-parse', 'HEAD')}\n`;
    writeFileSync(stampFile(), full);
    expect(check([]).out).toContain('its stamp stays');
    expect(stampText()).toBe(full);
  });
});
