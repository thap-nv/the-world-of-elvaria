import { describe, expect, it } from 'vitest';

import { argvOf } from './argv.ts';
import type { ProgramResolver } from '../process/program.ts';

/** pnpm as a Windows shim becomes `node <script>` in the composition root; here that is a table. */
const resolver: ProgramResolver = (name) =>
  Promise.resolve(
    name === 'pnpm'
      ? { file: 'C:/Program Files/nodejs/node.exe', args: ['C:/pnpm/bin/pnpm.cjs'] }
      : undefined,
  );

describe('argvOf', () => {
  it("puts the resolved program's launch before the command's own arguments", async () => {
    expect(await argvOf('pnpm -r test', resolver)).toEqual({
      ok: true,
      value: ['C:/Program Files/nodejs/node.exe', 'C:/pnpm/bin/pnpm.cjs', '-r', 'test'],
    });
  });

  it('says why a command cannot run', async () => {
    expect(await argvOf('pnpm lint && pnpm test', resolver)).toEqual({
      ok: false,
      error: { reason: 'shell_syntax', detail: 'pnpm lint && pnpm test' },
    });
    expect(await argvOf('docker compose up', resolver)).toEqual({
      ok: false,
      error: { reason: 'not_found', detail: 'docker' },
    });
  });
});
