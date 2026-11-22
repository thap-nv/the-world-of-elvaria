import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { commandRefusal } from '@elvaria/runner-core';
import { KingdomSchema } from '@elvaria/domain';

import { bench, questPayload, tickUntil } from '../__fixtures__/kingdom.ts';
import { statusIs } from '../__fixtures__/review.ts';
import type { Bench } from '../__fixtures__/kingdom.ts';
import type { Steward } from '../types.ts';

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

describe('session secret paths', () => {
  it('fences the treasury and every tribe account for both the worker and judge', async () => {
    current = await bench();
    const root = current.root;
    const read = await current.store.kingdom.read();
    if (!read.ok) throw new Error('fixture: no kingdom');
    const treasury = path.resolve(current.root, '..', 'custom vault', 'values.json').replaceAll('\\', '/');
    const accounts = read.value.tribes.map((tribe) => ({
      ...tribe,
      tool: {
        path: 'C:/fake/cli',
        version: '1.0.0',
        ...tribe.tool,
        config_dir: path.resolve(root, '..', 'custom accounts', tribe.id).replaceAll('\\', '/'),
      },
    }));
    const written = await current.store.kingdom.write(
      KingdomSchema.parse({
        ...read.value,
        paths: { ...read.value.paths, treasury },
        tribes: accounts,
      }),
    );
    expect(written.ok).toBe(true);
    running = current.steward();
    expect(await running.start({ loop: false })).toEqual({ ok: true });
    await current.command('create_quest', questPayload('Fence custom accounts'));
    await tickUntil(running, current.clock, statusIs(current, 'Fence custom accounts', 'done'));
    expect(current.requests.map(({ role }) => role)).toEqual(['assignee', 'verifier']);
    for (const { permissions } of current.requests) {
      expect(commandRefusal(permissions, `git status -- "${treasury}"`)).toContain('values.json');
      for (const { tool } of accounts) {
        expect(
          commandRefusal(permissions, `git status -- "${path.join(tool.config_dir, 'auth.json')}"`),
        ).toContain('custom accounts');
      }
    }
  });
});
