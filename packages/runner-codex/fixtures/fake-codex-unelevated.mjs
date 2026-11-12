// fake-codex.mjs with the sandbox P1-12d gave Codex, `windows.sandbox="unelevated"`, in place of the one runner-codex
// gives now (P1-12e): the conformance spec shows `spawn_child` red with it, as the real CLI was.
import process from 'node:process';

process.argv = process.argv.map((arg) =>
  arg.startsWith('windows.sandbox=') ? 'windows.sandbox="unelevated"' : arg,
);
await import('./fake-codex.mjs');
