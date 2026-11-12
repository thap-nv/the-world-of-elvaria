// The repo the running CLI belongs to (PS-04b): `apps/cli/src/upgrade/` (`apps/cli/dist/upgrade/` in the built
// bin) is four folders below its root. A command compares it with the build its kingdom pins, `elvaria upgrade`
// makes builds from it, and `elvaria run` and `doctor` name it.
import path from 'node:path';

export const SELF_ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '..');
