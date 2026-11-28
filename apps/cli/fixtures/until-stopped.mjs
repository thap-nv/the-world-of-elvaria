// A long-running command as `elvaria run` waits for its stop (LL-04): prints `ready` once it listens, then the reason
// the Steward's stop line would carry, and exits 0. A process killed without its handler prints nothing more.
import process from 'node:process';

import { stopReasonOf, untilSignal } from '../src/process/stop-signal.ts';

// Listeners alone do not keep Node running; the command's Steward would.
const alive = setInterval(() => undefined, 60_000);
const stopped = untilSignal(process);
process.stdout.write('ready\n');
const signal = await stopped;
clearInterval(alive);
process.stdout.write(`${stopReasonOf(signal)}\n`);
