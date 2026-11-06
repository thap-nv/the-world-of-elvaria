#!/usr/bin/env node
// The `elvaria` bin: the real process around runCli. apps/cli is the only composition root (implementation-plan
// §1.1), so this is where the machine (clock, randomness, PATH, terminal) meets the packages.
import process from 'node:process';

import { nodeIo } from './node-io.ts';
import { runCli } from './run-cli.ts';

process.exitCode = await runCli(process.argv.slice(2), nodeIo());
