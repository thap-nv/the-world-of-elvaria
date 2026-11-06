// Allowed: tests may read files.
import { readFileSync } from 'node:fs';

export const read = readFileSync;
