// Observe each launched command, including gitGuard's config query: the push evidence must not escape its command.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { tempDir } from '@elvaria/testkit';
import { expect, it } from 'vitest';

import { childEnv } from '../__fixtures__/git-plots.ts';
import { runDeliveryGit } from './git.ts';

it('adds command env to the push alone and keeps delivery git noninteractive', async () => {
  const temp = await tempDir('delivery command env');
  try {
    const script = path.join(temp.root, 'git.mjs');
    const output = path.join(temp.root, 'commands.txt');
    await writeFile(
      script,
      [
        "import { appendFileSync } from 'node:fs';",
        "const command = process.argv.includes('config') ? 'config' : process.argv.includes('push') ? 'push' : 'status';",
        "const stamp = process.env.ELVARIA_CHECKED_HEAD ?? 'absent';",
        "appendFileSync(process.argv[2], [command, stamp, process.env.GIT_TERMINAL_PROMPT, process.env.GCM_INTERACTIVE].join(' ') + '\\n');",
        '',
      ].join('\n'),
    );
    const git = { launch: { file: process.execPath, args: [script, output] }, env: childEnv() };
    const limits = { signal: new AbortController().signal, timeout_ms: 30_000 };
    const head = 'a'.repeat(40);
    const pushed = await runDeliveryGit(git, temp.root, ['push', 'origin', 'quest/example'], {
      ...limits,
      env: { ELVARIA_CHECKED_HEAD: head, GIT_TERMINAL_PROMPT: '1', GCM_INTERACTIVE: 'always' },
    });
    expect(pushed.code).toBe(0);
    expect((await runDeliveryGit(git, temp.root, ['status', '--porcelain'], limits)).code).toBe(0);
    expect(await readFile(output, 'utf8')).toBe(
      `config absent 0 never\npush ${head} 0 never\nconfig absent 0 never\nstatus absent 0 never\n`,
    );
  } finally {
    await temp.remove();
  }
});
