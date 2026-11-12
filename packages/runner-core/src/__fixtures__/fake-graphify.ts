// A fake graphify for the specs of the code graph (PS-21): a node script, written to a temp folder and run as
// `node <script> <command> …`; it reads GRAPHIFY_OUT as graphify does and keeps the env it got for the spec to read.

/** graphify's `update <source>` and `query`, as far as Elvaria sees them: files in, graph.json out, a summary line. */
export const FAKE_GRAPHIFY = `
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const [command, ...rest] = process.argv.slice(2);
const out = process.env.GRAPHIFY_OUT;
if (command === 'update') {
  const source = rest[0];
  if (existsSync(path.join(source, 'fail.txt'))) { console.error('boom: no grammar'); process.exit(1); }
  const files = readdirSync(source).filter((name) => name !== '.git');
  const seeded = existsSync(path.join(out, 'graph.json'));
  writeFileSync(path.join(out, 'graph.json'), JSON.stringify({ files, seeded, args: rest }));
  writeFileSync(path.join(out, 'env.json'), JSON.stringify(process.env));
  console.log('[graphify watch] Rebuilt (no clustering): ' + files.length + ' nodes, ' + files.length * 2 + ' edges');
} else {
  console.log('Graph: ' + path.join(out, 'graph.json') + ' | ' + command + ' ' + rest.join(' '));
}
`;
