import { QuestSchema, TerritorySchema, VerdictSchema } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { deliveryNote } from './note.ts';
import type { NoteInput } from './note.ts';

const ID = 'q_20261107_7k3m2a';
const AT = '2026-11-07T10:00:00+07:00';

const quest = (fields: Record<string, unknown> = {}) =>
  QuestSchema.parse({
    version: 1,
    id: ID,
    title: 'Add the orders API',
    description: 'Orders get a REST API.',
    kind: 'build',
    rank: 'C',
    class_required: 'knight',
    tags: ['backend'],
    territory: 'dc1-se-team',
    status: 'done',
    tier: 'session',
    assignee: 'thorn',
    verifier: null,
    budget: { max_minutes: 45, max_tokens: 240000, max_attempts: 3 },
    estimate: { tokens: 120000, minutes: 30 },
    attempts: 1,
    attempt_log: [],
    plot: {
      type: 'worktree',
      path: 'D:/repos/dc1/.elvaria/worktrees/q_20261107_7k3m2a',
      branch: `quest/${ID}`,
    },
    deliverable: { type: 'branch' },
    seal_required: false,
    created_by: 'user',
    created_at: AT,
    updated_at: AT,
    ...fields,
  });

const TERRITORY = TerritorySchema.parse({
  version: 1,
  id: 'dc1-se-team',
  name: 'dc1',
  path: 'D:/repos/dc1',
  kind: 'code',
  vcs: { type: 'git', default_branch: 'main' },
});

const verdict = (fields: Record<string, unknown>) =>
  VerdictSchema.parse({
    version: 1,
    id: `${ID}-1`,
    quest_id: ID,
    attempt: 1,
    verifier_id: 'machine',
    ritual: 'build_review',
    checks: [
      { id: 'lint', pass: true, duration_ms: 10, log_path: `.runs/${ID}-1/checks/lint.log` },
      { id: 'unit', pass: true, duration_ms: 10, log_path: `.runs/${ID}-1/checks/unit.log` },
    ],
    result: 'pass',
    by_human: false,
    created_at: AT,
    ...fields,
  });

const LETTER = [
  '# Handover · q_20261107_7k3m2a',
  '',
  '## Done',
  '',
  'The API, with its tests.',
  '',
  '```sh',
  '# not a heading',
  'pnpm test',
  '```',
].join('\n');

const render = (input: Partial<NoteInput> = {}) =>
  deliveryNote({ quest: quest(), territory: TERRITORY, handover: LETTER, verdicts: [], ...input });

describe('the delivery note', () => {
  it('reads as a pull request: facts, description, verdicts, the letter, how to merge', () => {
    const note = render({ verdicts: [verdict({})] });
    expect(note).toContain(`- Quest: \`${ID}\` (build, rank C) on \`dc1-se-team\``);
    expect(note).toContain(
      'The machine, from the checks (ritual `build_review`). Checks: ✓ `lint`, ✓ `unit`.',
    );
    expect(note).toContain('### Handover · q_20261107_7k3m2a\n\n#### Done');
    expect(note).toContain('```sh\n# not a heading\npnpm test\n```');
    expect(note).toContain(`git -C "D:/repos/dc1" merge --no-ff quest/${ID}`);
    // No remote: nothing to push to.
    expect(note).not.toContain('push origin');
  });

  it('says None where there is nothing, and a seal without a note ends with a full stop', () => {
    const sealed = quest({ seal: { at: AT } });
    const note = render({ quest: sealed, handover: '  ', verdicts: [] });
    expect(note).toContain(`## Verification\n\nSealed by the owner at ${AT}.`);
    expect(note).toContain('## Handover letter\n\nNone.');
    expect(render({ handover: null })).toContain('## Verification\n\nNone.');
    expect(
      render({ verdicts: [verdict({ verifier_id: 'sable', session_id: 'fake-claude-2', checks: [] })] }),
    ).toContain('### `q_20261107_7k3m2a-1`: pass\n\n`sable`, ritual `build_review`.\n');
  });

  it('lists the sub-quests a plan opened, or why none, and asks no merge of a plan', () => {
    const plan = quest({ kind: 'plan', class_required: 'mage', deliverable: { type: 'subquests' } });
    const open = { status: 'open', assignee: null, attempts: 0, plot: { type: 'none' } };
    const child = quest({ ...open, id: 'q_20261107_aaaaaa', title: 'Write the client', kind: 'document' });
    const script = quest({
      ...open,
      id: 'q_20261107_bbbbbb',
      title: 'Check the links',
      tier: 'script',
      script: { id: 'link-check', params: {} },
      class_required: undefined,
    });
    const opened = render({ quest: plan, subquests: { status: 'opened', quests: [child, script] } });
    expect(opened).toContain(
      '## Sub-quests\n\n- `q_20261107_aaaaaa` Write the client (document, rank C, knight)\n' +
        '- `q_20261107_bbbbbb` Check the links (build, rank C)',
    );
    expect(opened).not.toContain('## Merge by hand');
    expect(render({ quest: plan, subquests: { status: 'opened', quests: [] } })).toContain(
      '## Sub-quests\n\nNone.',
    );
    expect(render({ quest: plan, subquests: { status: 'refused', reason: 'no subquests.json' } })).toContain(
      '## Sub-quests\n\nNone opened: no subquests.json.',
    );
  });

  it('names the paths the Steward applied from a patch, after the letter and before the merge (P1-31)', () => {
    const note = render({ patched: ['.husky/pre-commit', '.husky/pre-push'] });
    const section = '## Applied through a patch';
    expect(note).toContain(
      `${section}\n\nThe character's CLI does not write these paths, so it wrote its change as a patch (\`elvaria.patch\`) and the Steward applied it before the commit. Read their diff before you merge:\n\n- \`.husky/pre-commit\`\n- \`.husky/pre-push\`\n`,
    );
    expect(note.indexOf('## Handover letter')).toBeLessThan(note.indexOf(section));
    expect(note.indexOf(section)).toBeLessThan(note.indexOf('## Merge by hand'));
    expect(render({ patched: [] })).not.toContain(section);
    expect(render()).not.toContain(section);
  });

  it('tells a copy into a territory without git, or why nothing was copied', () => {
    const folder = quest({
      plot: { type: 'folder', path: `quests/${ID}/work` },
      deliverable: { type: 'file' },
    });
    expect(render({ quest: folder })).toContain(`- Plot: \`quests/${ID}/work\``);
    expect(render({ quest: folder, copied: { copied: [], replaced: [], missing: false } })).toContain(
      'Nothing: the plot is empty.',
    );
    expect(
      render({ quest: folder, territory: undefined, copied: { copied: [], replaced: [], missing: true } }),
    ).toContain('Nothing: `dc1-se-team` is not there.');
    expect(render({ quest: quest({ plot: { type: 'none' } }) })).toContain('- Plot: none');
  });
});
