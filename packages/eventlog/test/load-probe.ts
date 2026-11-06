// Prints, as JSON, the URL of every module Node loads while importing the file given as argument:
//   node test/load-probe.ts <file>
// light-entry.spec.ts checks that the package entry does not pull in @elvaria/domain or zod.
import { registerHooks } from 'node:module';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const [entry] = process.argv.slice(2);
if (entry === undefined) throw new Error('usage: load-probe.ts <file>');

const loaded: string[] = [];
registerHooks({
  load(url, context, nextLoad) {
    loaded.push(url);
    return nextLoad(url, context);
  },
});
const started = performance.now();
await import(pathToFileURL(entry).href);
process.stdout.write(JSON.stringify({ loaded, ms: Math.round(performance.now() - started) }));
