import { afterEach, describe, expect, it, vi } from 'vitest';

import { foundKingdom, printed, run, tempDir, testIo } from '../__fixtures__/cli.ts';
import * as registration from '../bell/registration.ts';
import * as bells from '../bell/run-bell.ts';

describe('Windows bell startup', () => {
  afterEach(() => vi.restoreAllMocks());

  it('probes the Windows name once before wiring the running bell', async () => {
    const dir = await tempDir();
    try {
      const kingdom = await foundKingdom(dir.root);
      const probe = vi.spyOn(registration, 'bellRegistered').mockResolvedValue(true);
      const wired = vi.spyOn(bells, 'runBell');
      const io = testIo({ platform: 'win32', interactive: false });
      expect(await run(io, 'run', '--kingdom', kingdom, '--locale', 'en')).toBe(0);
      expect(probe).toHaveBeenCalledTimes(1);
      expect(wired.mock.calls[0]?.slice(2)).toEqual([false, true]);
      expect(printed(io)).toContain(`The Steward is running in ${kingdom}, one tick every 5 s.`);
      expect(io.printed.out.at(-1)).toBe('The Steward stopped.');
    } finally {
      await dir.remove();
    }
  });
});
