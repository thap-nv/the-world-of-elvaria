import { afterEach, describe, expect, it } from 'vitest';
import type { Workspace } from '@elvaria/runner-core';

import { prepare } from './__fixtures__/harness.ts';
import { pingArgv, sessionArgv } from './launch/argv.ts';

const opened: Workspace[] = [];
afterEach(async () => {
  for (const workspace of opened.splice(0)) await workspace.remove();
});

describe('Claude effort slugs', () => {
  it.each(['low', 'medium', 'high', 'xhigh', 'max'])(
    'passes %s separately from the model in sessions and probes',
    async (effort) => {
      const { workspace, request } = await prepare('submit');
      opened.push(workspace);
      const req = { ...request, character: { ...request.character, model: `claude-opus-5-5-${effort}` } };
      const argv = sessionArgv(req, { settings: 'settings.json', system: 'system.txt' }, 'session');
      expect(argv.slice(argv.indexOf('--model'), argv.indexOf('--model') + 4)).toEqual([
        '--model',
        'claude-opus-5-5',
        '--effort',
        effort,
      ]);
      expect(pingArgv(req.character.model)).toContain('--effort');
      expect(pingArgv(req.character.model).slice(5, 9)).toEqual([
        '--model',
        'claude-opus-5-5',
        '--effort',
        effort,
      ]);
    },
  );

  it.each(['claude-opus-5-5', 'claude-haiku-5-5', 'claude-opus-5-5-ultra', '-high'])(
    'preserves %s without an effort flag',
    async (model) => {
      const { workspace, request } = await prepare('submit');
      opened.push(workspace);
      const argv = sessionArgv(
        { ...request, character: { ...request.character, model } },
        { settings: 'settings.json', system: 'system.txt' },
        'session',
      );
      expect(argv[argv.indexOf('--model') + 1]).toBe(model);
      expect(argv).not.toContain('--effort');
      expect(pingArgv(model)).not.toContain('--effort');
    },
  );
});
