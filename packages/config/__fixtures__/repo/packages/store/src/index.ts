// store may use domain, but by package name; and vitest is a devDependency.
import { describe } from 'vitest';

import { read } from '../../domain/src/quest.ts';

export const store = [read, describe];
