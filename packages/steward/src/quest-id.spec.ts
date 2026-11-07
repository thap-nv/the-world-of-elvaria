import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { QuestIdSchema } from '@elvaria/domain';
import { afterEach, describe, expect, it } from 'vitest';

import { bench, questPayload } from './__fixtures__/kingdom.ts';
import { questIdOfCommand } from './inbox/quest-commands.ts';
import type { Bench } from './__fixtures__/kingdom.ts';

const COMMAND = { id: '01JCFB7Q2R8S4T6V9W3X5Y1Z0A', ts: '2026-11-06T23:59:00+07:00' };
const TZ = 'Asia/Ho_Chi_Minh';

let current: Bench | undefined;
afterEach(async () => {
  await current?.remove();
  current = undefined;
});

describe('questIdOfCommand (P1-13)', () => {
  it('derives one quest id from the command id, on the local day of the command', () => {
    const id = questIdOfCommand(COMMAND, TZ);
    expect(QuestIdSchema.safeParse(id).success).toBe(true);
    expect(id).toMatch(/^q_20261106_/);
    expect(questIdOfCommand(COMMAND, TZ)).toBe(id);
    expect(questIdOfCommand({ ...COMMAND, id: '01JCFB7Q2R8S4T6V9W3X5Y1Z0B' }, TZ)).not.toBe(id);
    // 01:00 in Saigon on the 7th is still the 6th in UTC.
    expect(questIdOfCommand({ ...COMMAND, ts: '2026-11-07T01:00:00+07:00' }, 'UTC')).toMatch(/^q_20261106_/);
  });

  it('has no id for a zone or a time the schemas would refuse', () => {
    expect(questIdOfCommand(COMMAND, 'Mars/Olympus_Mons')).toBeUndefined();
    expect(questIdOfCommand({ ...COMMAND, ts: 'yesterday' }, TZ)).toBeUndefined();
  });

  it('is the id the Steward gives the quest', async () => {
    current = await bench();
    const steward = current.steward();
    await steward.start({ loop: false });
    const id = await current.command('create_quest', questPayload('Add the orders API'));
    await steward.tick();
    await steward.stop();
    const file = path.join(current.root, 'inbox', 'done', `${id}.json`);
    const command = JSON.parse(await readFile(file, 'utf8')) as { id: string; ts: string };
    const [quest] = await current.quests();
    expect(quest?.id).toBe(questIdOfCommand(command, 'Asia/Ho_Chi_Minh'));
  });
});
