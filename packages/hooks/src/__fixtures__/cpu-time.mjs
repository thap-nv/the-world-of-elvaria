// Preloaded with `node --import <this file>` by the start-up gate (hook-process.spec.ts): writes the CPU time the
// process used, user + system in ms, to fd 3 when it exits. A busy machine stretches the wall time of a start, not
// the work it does (fix/timing-flakes). fd 3 leaves the hook's stdout and stderr as they are; a process started
// without it writes nothing.
import { writeSync } from 'node:fs';
import process from 'node:process';

process.on('exit', () => {
  const { user, system } = process.cpuUsage();
  try {
    writeSync(3, String((user + system) / 1000));
  } catch {
    // No fd 3: nobody asked.
  }
});
