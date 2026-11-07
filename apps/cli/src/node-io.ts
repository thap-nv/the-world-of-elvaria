// The real machine behind CliIo. Kept apart from cli.ts so the one rule worth a test (where relative paths start)
// is a pure function.
import { randomBytes } from 'node:crypto';
import os from 'node:os';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

import { InstantSchema } from '@elvaria/domain';

import type { CliIo, Env } from './io.ts';

/**
 * `pnpm elvaria …` runs the root script with the repo root as its working folder; pnpm keeps the folder the owner
 * typed the command in as INIT_CWD. Only that script uses it: INIT_CWD inherited from some other npm script is
 * not where the owner is.
 */
export function invocationDir(env: Env, processCwd: string): string {
  const fromRootScript = env.npm_lifecycle_event === 'elvaria' ? env.INIT_CWD : undefined;
  return fromRootScript ?? processCwd;
}

export function nodeIo(): CliIo {
  return {
    out: (line) => {
      process.stdout.write(`${line}\n`);
    },
    err: (line) => {
      process.stderr.write(`${line}\n`);
    },
    env: process.env,
    cwd: invocationDir(process.env, process.cwd()),
    home: os.homedir(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    platform: process.platform,
    nodePath: process.execPath,
    clock: { now: () => InstantSchema.parse(Date.now()) },
    sleep: async (ms) => {
      await delay(ms);
    },
    untilStopped: () =>
      new Promise((resolve) => {
        const stop = (): void => {
          process.off('SIGINT', stop);
          process.off('SIGTERM', stop);
          resolve();
        };
        process.once('SIGINT', stop);
        process.once('SIGTERM', stop);
      }),
    random: { bytes: (count) => new Uint8Array(randomBytes(count)) },
  };
}
