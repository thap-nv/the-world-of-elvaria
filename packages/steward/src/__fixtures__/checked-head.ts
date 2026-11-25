// A real pre-push hook that records the push's explicit evidence, outside the tracked territory files (RC-02).
import { chmod, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { currentRun, verdictIdOf } from '@elvaria/domain';
import { toPortable } from '@elvaria/store';
import type { Quest } from '@elvaria/domain';
import type { CheckRun } from '@elvaria/runner-core';

import { git } from './git-plots.ts';
import type { ForgeBench } from './forge-bench.ts';

export const GREEN: CheckRun = {
  id: 'unit' as CheckRun['id'],
  pass: true,
  duration_ms: 1,
  log_path: 'unit.log',
  exit_code: 0,
  timed_out: false,
};

export async function recordingHook(bench: ForgeBench, rejectOnce = false): Promise<() => Promise<string>> {
  const script = path.join(bench.kingdom.root, 'push-hook.mjs');
  const output = path.join(bench.kingdom.root, 'push-env.txt');
  await writeFile(
    script,
    [
      "import { appendFileSync, existsSync, writeFileSync } from 'node:fs';",
      "appendFileSync(process.argv[2], (process.env.ELVARIA_CHECKED_HEAD ?? 'absent') + '\\n');",
      "const marker = process.argv[2] + '.rejected';",
      "if (process.argv[3] === 'reject_once' && !existsSync(marker)) {",
      "  writeFileSync(marker, 'rejected'); process.exitCode = 1;",
      '}',
      '',
    ].join('\n'),
  );
  const quoted = [process.execPath, script, output, rejectOnce ? 'reject_once' : 'pass']
    .map((part) => `"${toPortable(part)}"`)
    .join(' ');
  const hook = path.join(bench.repo, '.git', 'hooks', 'pre-push');
  await writeFile(hook, `#!/bin/sh\n${quoted}\n`);
  await chmod(hook, 0o755);
  return () => readFile(output, 'utf8');
}

export async function verdictAtHead(
  bench: ForgeBench,
  quest: Quest,
  mode: 'pass' | 'empty' | 'old',
): Promise<void> {
  const found = await bench.kingdom.store.verdicts.read(verdictIdOf(quest, currentRun(quest)));
  if (!found.ok) throw new Error(`fixture: ${found.error.message}`);
  const created_at =
    mode === 'old' ? '2000-01-01T00:00:00Z' : git(quest.plot.path ?? '', 'log', '-1', '--format=%cI', 'HEAD');
  const saved = await bench.kingdom.store.verdicts.write({
    ...found.value,
    created_at,
    checks: mode === 'empty' ? [] : found.value.checks,
  });
  if (!saved.ok) throw new Error(`fixture: ${saved.error.message}`);
}

export async function moveBase(bench: ForgeBench): Promise<void> {
  await writeFile(path.join(bench.repo, 'base.txt'), 'The base moved.\n');
  git(bench.repo, 'add', 'base.txt');
  git(bench.repo, 'commit', '-q', '-m', 'chore: move base for delivery');
  git(bench.repo, 'push', '-q', 'origin', 'main');
}
