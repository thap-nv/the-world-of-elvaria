import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { InboxCommandSchema } from '@elvaria/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fixture, plant, tempKingdom } from '../test/kingdom.ts';
import { openKingdom } from './kingdom-store.ts';
import type { TempKingdom } from '../test/kingdom.ts';
import type { InboxStore } from './inbox.ts';
import type { InboxCommandInput } from '@elvaria/domain';

const SEAL = InboxCommandSchema.parse(fixture('inbox-command'));
const EARLIER: InboxCommandInput = {
  version: 1,
  id: '01JCF0000000000000000000AA',
  ts: '2026-11-06T08:00:00+07:00',
  kind: 'retry',
  source: 'cli',
  payload: { quest: 'q_20261106_7k3m2a' },
};

let kingdom: TempKingdom;
let inbox: InboxStore;
beforeEach(async () => {
  kingdom = await tempKingdom();
  inbox = openKingdom(kingdom.root).inbox;
});
afterEach(() => kingdom.remove());

describe('the inbox (ADR 0005)', () => {
  it('takes a command as inbox/<id>.json and gives commands back oldest first', async () => {
    expect(await inbox.write(SEAL)).toEqual({ ok: true, value: SEAL });
    expect((await inbox.write(EARLIER)).ok).toBe(true);
    const items = await inbox.read();
    expect(items.map((item) => item.name)).toEqual([EARLIER.id, SEAL.id]);
    expect(items[1]).toEqual({ name: SEAL.id, command: { ok: true, value: SEAL } });
    const text = await readFile(path.join(kingdom.root, 'inbox', `${SEAL.id}.json`), 'utf8');
    expect(JSON.parse(text)).toEqual(SEAL);
  });

  it('refuses a command the schema rejects, and writes nothing', async () => {
    const bad = { ...EARLIER, kind: 'approve' } as unknown as InboxCommandInput;
    expect(await inbox.write(bad)).toMatchObject({ ok: false, error: { code: 'invalid', file: 'inbox' } });
    expect(await inbox.read()).toEqual([]);
  });

  it('lists a file it cannot use, so the Steward can reject it, and skips temp files and done/', async () => {
    await inbox.write(SEAL);
    await plant(kingdom.root, 'inbox/garbage.json', 'not json');
    await plant(kingdom.root, 'inbox/01JCF0000000000000000000ZZ.json', SEAL);
    await plant(kingdom.root, `inbox/.${SEAL.id}.json.99.beef.tmp`, '{');
    await plant(kingdom.root, `inbox/done/${EARLIER.id}.json`, EARLIER);
    const items = await inbox.read();
    expect(items.map((item) => [item.name, item.command.ok || item.command.error.code])).toEqual([
      ['01JCF0000000000000000000ZZ', 'id_mismatch'],
      [SEAL.id, true],
      ['garbage', 'invalid_json'],
    ]);
  });

  it('moves a handled command to inbox/done/, and acks twice without complaint', async () => {
    await inbox.write(SEAL);
    expect(await inbox.ack(SEAL.id)).toEqual({ ok: true, value: undefined });
    expect(await inbox.ack(SEAL.id)).toEqual({ ok: true, value: undefined });
    expect(await inbox.read()).toEqual([]);
    expect(await readdir(path.join(kingdom.root, 'inbox', 'done'))).toEqual([`${SEAL.id}.json`]);
  });

  it('acks an unusable file by its name', async () => {
    await plant(kingdom.root, 'inbox/garbage.json', 'not json');
    expect((await inbox.ack('garbage')).ok).toBe(true);
    expect(await inbox.read()).toEqual([]);
  });

  it('reports a command that is not there, and a name that is not a plain file name', async () => {
    expect(await inbox.ack(SEAL.id)).toMatchObject({ ok: false, error: { code: 'not_found' } });
    for (const name of ['../kingdom', 'done/x', '.hidden', '', 'a\\b']) {
      expect(await inbox.ack(name)).toMatchObject({ ok: false, error: { code: 'invalid_id' } });
    }
  });
});
