// Preloaded with `node --import <this file>`: writes the URL of every module the process loads, as JSON, to the
// file named by ELVARIA_LOAD_TRACE when it exits. hook-process.spec.ts checks that the built hook loads no
// `.ts` file (no type stripping), no @elvaria/domain and no zod (implementation-plan §3.6).
import { writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import process from 'node:process';

const loaded = [];
registerHooks({
  load(url, context, nextLoad) {
    loaded.push(url);
    return nextLoad(url, context);
  },
});
process.on('exit', () => {
  const file = process.env.ELVARIA_LOAD_TRACE;
  if (file !== undefined) writeFileSync(file, JSON.stringify(loaded));
});
