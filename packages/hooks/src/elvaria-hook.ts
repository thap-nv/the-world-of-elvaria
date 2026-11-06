// The hook every agent CLI runs on its hook events (implementation-plan §3.6), as
//   node --conditions=elvaria-dist <abs>/packages/hooks/dist/elvaria-hook.js [--policy <run_dir>/policy.json]
// Built to JS and run with that condition so neither this file nor @elvaria/eventlog is type-stripped on
// every call: the < 100 ms budget is measured on the build (hook-process.spec.ts). index.ts builds the line.
import { readFileSync } from 'node:fs';
import process from 'node:process';

import { localTs } from '@elvaria/eventlog';

import { runHook } from './run-hook.ts';
import type { TsFormat } from './write.ts';

/**
 * The payload. A synchronous read of fd 0 is a few ms cheaper than a stream; a parent that left the pipe
 * non-blocking makes it fail with EAGAIN, and then the stream reads it.
 */
async function readStdin(): Promise<string> {
  try {
    return readFileSync(0, 'utf8');
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EAGAIN')) throw error;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  return Buffer.concat(chunks).toString('utf8');
}

/** This process stamps in the kingdom's zone through TZ: Date reads it at once, Intl would cost ~11 ms. */
const processZoneTs: TsFormat = (tz) => {
  if (tz !== undefined) process.env.TZ = tz;
  return localTs;
};

try {
  const outcome = await runHook({
    stdin: await readStdin(),
    env: process.env,
    argv: process.argv.slice(2),
    now: Date.now(),
    tsFormat: processZoneTs,
  });
  if (outcome.stdout !== '') process.stdout.write(outcome.stdout);
  if (outcome.stderr !== '') process.stderr.write(outcome.stderr);
  process.exitCode = 0;
} catch (error) {
  // A bug in the hook: exit 1 is an error the CLI reports (a PreToolUse declared with onFailure: block stops
  // the call), never a silent pass or a made-up decision.
  process.stderr.write(
    `elvaria-hook: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
}
