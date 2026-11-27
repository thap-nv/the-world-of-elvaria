import { openEventLog } from '@elvaria/eventlog';
import type { PatchOutcome } from '@elvaria/runner-core';
import { afterEach, describe, expect, it } from 'vitest';

import { bench, questPayload, tickUntil } from '../__fixtures__/kingdom.ts';
import type { Bench } from '../__fixtures__/kingdom.ts';
import { folderPlots } from '../plot/folder-plots.ts';
import type { Steward } from '../types.ts';

let current: Bench;
let running: Steward;
afterEach(async () => {
  await running.stop();
  await current.remove();
});

describe('patch refusal through the event recorder (LL-07)', () => {
  it.each(['git', 'exception'])(
    'records the %s code and masks external text on the usual path',
    async (source) => {
      current = await bench();
      const read = await current.store.territories.read('dc1-se-team' as never);
      if (!read.ok) throw new Error('missing territory');
      await current.store.territories.write({
        ...read.value,
        laws: { ...read.value.laws, patch_paths: ['.husky/**'] },
      });
      const text = 'git said why\npassword=hidden-value';
      const detail = `git apply failed: ${text}`;
      const applyPatch = (): Promise<PatchOutcome> =>
        source === 'exception'
          ? Promise.reject(new Error(text))
          : Promise.resolve({
              status: 'refused',
              reason: { code: 'breaker:patch_apply_failed', params: { file: 'elvaria.patch' } },
              text,
              detail,
            });
      running = current.steward({ plots: { ...folderPlots(current.root), applyPatch } });
      await running.start({ loop: false });
      await current.command('create_quest', questPayload('Refused patch'));
      await tickUntil(
        running,
        current.clock,
        async () => (await current.quest('Refused patch')).status === 'infirmary',
      );
      const { events } = await openEventLog(current.root).read();
      const line = events.findLast(({ type }) => type === 'quest.infirmary');
      expect(line?.data.reason).toEqual({
        code: source === 'exception' ? 'breaker:patch_error' : 'breaker:patch_apply_failed',
        params: { file: 'elvaria.patch' },
      });
      expect(line?.data.detail).toMatchObject({
        message: 'git said why\npassword=[redacted]',
        patch:
          source === 'exception'
            ? 'git said why\npassword=[redacted]'
            : 'git apply failed: git said why\npassword=[redacted]',
      });
    },
  );
});
