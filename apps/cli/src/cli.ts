#!/usr/bin/env node
// The `elvaria` bin: the real process around runCli. apps/cli is the only composition root (implementation-plan
// §1.1), so this is where the machine (clock, randomness, PATH, terminal) meets the packages. A command on a
// kingdom that pins a build runs on that build instead (upgrade/entry.ts, PS-04b).
import process from 'node:process';

import { nodeIo } from './node-io.ts';
import { elvaria } from './upgrade/entry.ts';

// A reader that stops early (`elvaria sandbox replay … | head`) closes the pipe: the command ends there, quietly,
// instead of with a stack trace on stderr.
process.stdout.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code !== 'EPIPE') throw error;
  process.exit(0);
});

process.exitCode = await elvaria(process.argv.slice(2), nodeIo(), process);
