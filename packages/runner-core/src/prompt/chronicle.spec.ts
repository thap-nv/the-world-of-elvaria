import { describe, expect, it } from 'vitest';

import { DECREE } from '../__fixtures__/world.ts';
import { buildChroniclePrompt } from './chronicle.ts';
import { loadPromptTemplates } from './templates.ts';
import type { ChronicleContext } from './chronicle.ts';
import type { ChronicleLedger } from '@elvaria/domain';

const templates = await loadPromptTemplates();

const LYRA = { id: 'lyra', name: 'Lyra' };
const BROM = { id: 'brom', name: 'Brom' };

const ledger = {
  version: 1,
  day: '2026-11-06',
  tz: 'Asia/Ho_Chi_Minh',
  entries: [
    {
      at: '2026-11-06T10:00:00+07:00',
      kind: 'quest_done',
      quest: 'q_20261106_7k3m2a',
      title: 'Add the login page',
      territory: 'dc1-se-team',
      character: BROM,
    },
    {
      at: '2026-11-06T11:00:00+07:00',
      kind: 'verdict_pass',
      quest: 'q_20261106_7k3m2a',
      title: 'Add the login page',
      territory: 'dc1-se-team',
      character: BROM,
      by: LYRA,
    },
  ],
  counts: { quest_done: 1, verdict_pass: 1, quest_returned: 0 },
  quests: 1,
  characters: [BROM, LYRA],
} as unknown as ChronicleLedger;

const context: ChronicleContext = {
  locale: 'vi',
  decree: null,
  kingdom: 'Elvaria',
  ledger,
  issues: [],
};

describe('buildChroniclePrompt (P2-06b)', () => {
  it('snapshot', async () => {
    const { system, user } = buildChroniclePrompt(context, templates);
    await expect(`=== system ===\n${system}\n\n=== user ===\n${user}\n`).toMatchFileSnapshot(
      './__snapshots__/chronicle.txt',
    );
  });

  it("asks for the prose in the owner's language, under its bounds, naming only the day's characters", () => {
    const { system, user } = buildChroniclePrompt(context, templates);
    expect(system).toContain('The prose only, in Vietnamese');
    expect(system).toContain('under 600 words and 6000 characters');
    expect(user).toContain('The only characters you may name: Brom, Lyra.');
    expect(user).toContain('2 entries, 1 quests: quest_done 1, verdict_pass 1.');
    expect(user).not.toContain('Your first try was refused');
  });

  it('opens with the royal decree when there is one', () => {
    const decreed = buildChroniclePrompt({ ...context, decree: DECREE }, templates);
    const plain = buildChroniclePrompt(context, templates);
    expect(plain.system).not.toContain('Never add author or attribution lines');
    expect(decreed.system).toContain('Never add author or attribution lines');
    expect(decreed.system.endsWith(plain.system)).toBe(true);
  });

  it('tells the second try what was wrong with the first', () => {
    const issues = ['names quest q_20261106_zzzzzz, which the ledger does not hold'];
    const { user } = buildChroniclePrompt({ ...context, issues }, templates);
    expect(user).toContain(
      '# Your first try was refused\n\nWrite the tale again without these errors:\n\n- names quest q_20261106_zzzzzz, which the ledger does not hold',
    );
  });

  it('cuts the ledger at 12 000 characters and says how many entries were left out', () => {
    const entry = { ...ledger.entries[0], title: 'x'.repeat(150) };
    const many = { ...ledger, entries: Array.from({ length: 100 }, () => entry), characters: [] };
    const { user } = buildChroniclePrompt({ ...context, ledger: many as ChronicleLedger }, templates);
    const lines = user.split('\n').filter((line) => line.startsWith('{"at"'));
    expect(lines.length).toBeLessThan(100);
    expect(lines.join('\n').length).toBeLessThanOrEqual(12_000);
    expect(user).toContain(`${String(100 - lines.length)} more entries were left out for room`);
    expect(user).toContain('The only characters you may name: none.');
  });
});
