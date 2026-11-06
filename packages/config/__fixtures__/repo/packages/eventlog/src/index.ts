// not-in-package-json (vitest), dev-only-workspace-at-runtime (config).
import { it } from 'vitest';

import { WORKSPACES } from '../../config/boundaries.mjs';

export const log = [it, WORKSPACES];
