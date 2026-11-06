// hooks-fast-start: child_process is not on the list; node:fs is.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

export { readFileSync, spawn };
