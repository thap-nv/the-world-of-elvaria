import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { EVENT_VERSION, EventSchema, questViewOf } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, printed, run, tempDir, testIo } from '../__fixtures__/cli.ts';
import { readDisruptions } from './read-disruptions.ts';
import { questFixture } from '../__fixtures__/quest.ts';

describe('disruption registry reading and metrics output', () => {
  let temp: Awaited<ReturnType<typeof tempDir>>;
  beforeEach(async () => {
    temp = await tempDir();
  });
  afterEach(() => temp.remove());

  it('returns missing, malformed JSON and invalid registry files as values', async () => {
    const missing = await readDisruptions(temp.root, []);
    expect(missing).toMatchObject({
      ok: false,
      file: 'registry/disruptions.json',
      issues: [{ code: 'read' }],
    });
    await mkdir(path.join(temp.root, 'registry'));
    const file = path.join(temp.root, 'registry/disruptions.json');
    await writeFile(file, '{', 'utf8');
    expect(await readDisruptions(temp.root, [])).toEqual({
      ok: false,
      file: 'registry/disruptions.json',
      issues: [{ code: 'json', path: [], message: '' }],
    });
    await writeFile(file, '{}', 'utf8');
    const invalid = await readDisruptions(temp.root, []);
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.issues.map(({ code }) => code)).toContain('invalid');
  });

  it('prints a broken registry in its section while retaining the ledger and JSON issues', async () => {
    const kingdom = await foundKingdom(temp.root);
    await writeFile(path.join(kingdom, 'registry/disruptions.json'), '{', 'utf8');
    const io = testIo();
    expect(await run(io, 'metrics', '--kingdom', kingdom, '--locale', 'en')).toBe(0);
    expect(printed(io)).toContain('Operational disruptions\nregistry/disruptions.json (): Invalid JSON:');
    expect(printed(io)).toContain('Sealed quests: 0');
    const json = testIo();
    expect(await run(json, 'metrics', '--kingdom', kingdom, '--json')).toBe(0);
    expect(JSON.parse(json.printed.out.join('\n'))).toMatchObject({
      disruption_issues: {
        file: 'registry/disruptions.json',
        issues: [{ code: 'json', path: [], message: '' }],
      },
    });
    expect(JSON.parse(json.printed.out.join('\n'))).not.toHaveProperty('disruptions');
  });

  it('includes full disruptions and applies the metrics date window to the same event log', async () => {
    const kingdom = await foundKingdom(temp.root);
    const event = EventSchema.parse({
      v: EVENT_VERSION,
      id: '01JC0000000000000000000001',
      ts: '2026-11-25T21:41:00+07:00',
      type: 'quest.unclaimable',
      actor: { kind: 'steward' },
      data: { reason: 'no_class', rank: 'E', class: 'knight' },
    });
    await openEventLog(kingdom).append([event]);
    const io = testIo();
    expect(await run(io, 'metrics', '--kingdom', kingdom, '--json', '--until', '2026-11-25')).toBe(0);
    expect(JSON.parse(io.printed.out.join('\n'))).toMatchObject({
      disruptions: [{ kind: 'unclaimable', from: event.ts, to: event.ts, evidence: [event.id] }],
    });
    const excluded = testIo();
    expect(await run(excluded, 'metrics', '--kingdom', kingdom, '--json', '--since', '2026-11-26')).toBe(0);
    expect(JSON.parse(excluded.printed.out.join('\n'))).toMatchObject({ disruptions: [] });
  });

  it('prints two kinds from the log, including a max_turns cut submitted seven minutes later', async () => {
    const kingdom = await foundKingdom(temp.root);
    const envelope = {
      v: EVENT_VERSION,
      actor: { kind: 'steward' },
      quest: 'q_20261125_c4mcjt',
      session: 'cut-session',
    };
    await openEventLog(kingdom).append([
      EventSchema.parse({
        ...envelope,
        id: '01JC0000000000000000000001',
        ts: '2026-11-25T21:40:00+07:00',
        type: 'quest.unclaimable',
        data: { reason: 'no_class', rank: 'E', class: 'knight' },
      }),
      EventSchema.parse({
        ...envelope,
        id: '01JC0000000000000000000002',
        ts: '2026-11-25T21:41:00+07:00',
        type: 'agent.session.end',
        data: { outcome: 'max_turns' },
      }),
      EventSchema.parse({
        ...envelope,
        id: '01JC0000000000000000000003',
        ts: '2026-11-25T21:48:00+07:00',
        type: 'quest.submitted',
        data: { quest: questViewOf(questFixture('review', undefined, { assignee: 'thorn', attempts: 1 })) },
      }),
    ]);
    const io = testIo();
    expect(await run(io, 'metrics', '--kingdom', kingdom, '--locale', 'en')).toBe(0);
    expect(printed(io)).toMatch(/unclaimable\s+1\s+0\s+01JC0000000000000000000001/);
    expect(printed(io)).toMatch(/session_cut_then_submitted\s+1\s+7\s+01JC0000000000000000000002/);
    const json = testIo();
    expect(await run(json, 'metrics', '--kingdom', kingdom, '--json')).toBe(0);
    expect(JSON.parse(json.printed.out.join('\n'))).toMatchObject({
      disruptions: [
        { kind: 'unclaimable', evidence: ['01JC0000000000000000000001'] },
        {
          kind: 'session_cut_then_submitted',
          quest: 'q_20261125_c4mcjt',
          from: '2026-11-25T21:41:00+07:00',
          to: '2026-11-25T21:48:00+07:00',
          cause: 'max_turns',
          evidence: ['01JC0000000000000000000002', '01JC0000000000000000000003'],
        },
      ],
    });
  });
});
