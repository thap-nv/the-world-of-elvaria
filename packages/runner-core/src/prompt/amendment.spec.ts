// The prompts of an amendment (PS-22b, ADR 0024): its author decides it in a session of its own, with no tool and no
// word from the doer beyond the memo and the letter; the doer's next session reads the decision and why, fresh or
// resumed, as it reads an owner's answer.
import { MemoSchema, QuestSchema } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { DECREE, LETTER, QUEST, REGISTRY, TERRITORY, THORN, classPromptOf } from '../__fixtures__/world.ts';
import { AMENDMENT_TEXT_MAX, buildAmendmentPrompt } from './amendment.ts';
import { buildPrompt } from './build-prompt.ts';
import { resumedPrompt } from './resumed.ts';
import { loadPromptTemplates } from './templates.ts';
import type { AmendmentContext } from './amendment.ts';
import type { BuiltPrompt } from '../runner/types.ts';
import type { BlockedAmendment, Quest } from '@elvaria/domain';

const templates = await loadPromptTemplates();
const show = ({ system, user }: BuiltPrompt) => `=== system ===
${system}

=== user ===
${user}
`;

const BODY =
  'Đề bài: bước 2 sửa `package.json` bằng tay. Đề nghị: chạy `pnpm pkg set scripts.check=…`. Vì: lint của lãnh thổ chặn sửa tay package.json; `pnpm lint` in "package.json is generated".';
const MEMO = MemoSchema.parse({
  version: 1,
  id: 'm_20261106_4k2pqz',
  kind: 'amendment',
  from: 'thorn',
  quest: QUEST.id,
  attempt: 1,
  to: { route: 'author' },
  body: BODY,
  refs: ['package.json'],
  state: 'open',
  filed_at: '2026-11-06T10:00:00+07:00',
});
// Only its id, title and description reach the prompt.
const PLAN: Quest = {
  ...QUEST,
  id: 'q_20261105_4c8n2d' as Quest['id'],
  title: 'Kế hoạch: bộ kiểm của repo',
  kind: 'plan' as Quest['kind'],
  description: '## Brief\n\nGom mọi kiểm tra vào một lệnh.\n\n## Goal\n\nMột lệnh `pnpm check` cho CI.',
  status: 'done',
};

const context: AmendmentContext = {
  locale: 'vi',
  decree: null,
  role: 'chancellor',
  class_prompt: classPromptOf('chancellor'),
  context_budget_tokens: 120000,
  quest: { ...QUEST, status: 'blocked', scope_paths: ['package.json', 'README.md'] },
  memo: MEMO,
  letter: LETTER,
};

describe("an amendment's author", () => {
  it('amendment-chancellor reads the quest, its description, the amendment and the letter, and has no tool', async () => {
    const built = buildAmendmentPrompt(context, templates);
    await expect(show(built)).toMatchFileSnapshot('__snapshots__/amendment-chancellor.txt');
    expect(built.system).toContain('You are the Chancellor of the kingdom of Elvaria');
    expect(built.user).toContain(BODY);
    expect(built.user).not.toContain('# The plan it came from');
  });

  it('amendment-mage reads the plan it came from, under the decree', async () => {
    const mage = { ...context, role: 'mage', decree: DECREE, class_prompt: null, plan: PLAN } as const;
    const built = buildAmendmentPrompt(mage, templates);
    await expect(show(built)).toMatchFileSnapshot('__snapshots__/amendment-mage.txt');
    expect(built.system.startsWith('# Royal decree')).toBe(true);
    expect(built.user).toContain('Gom mọi kiểm tra vào một lệnh.');
  });

  it('cuts a long letter or plan, and says when the letter cannot be read', () => {
    const long = 'x'.repeat(AMENDMENT_TEXT_MAX + 10);
    const { user } = buildAmendmentPrompt(
      { ...context, letter: long, plan: { ...PLAN, description: long } },
      templates,
    );
    expect(user).toContain(`${'x'.repeat(AMENDMENT_TEXT_MAX)}\n…`);
    expect(user).not.toContain('x'.repeat(AMENDMENT_TEXT_MAX + 1));
    const unread = buildAmendmentPrompt(
      { ...context, letter: null, quest: { ...QUEST, scope_paths: undefined } },
      templates,
    );
    expect(unread.user).toContain('The letter cannot be read.');
    expect(unread.user).toContain('scope none');
    const noRefs = buildAmendmentPrompt({ ...context, memo: { ...MEMO, refs: [] } }, templates);
    expect(noRefs.user).toContain('files: none');
  });
});

const decided = (amendment: BlockedAmendment, answer: string) =>
  QuestSchema.parse({
    ...QUEST,
    blocked: { question: BODY, asked_at: QUEST.updated_at, answer, amendment },
  });

const revived = (quest: ReturnType<typeof decided>) =>
  buildPrompt(
    {
      locale: 'vi',
      decree: null,
      role: 'assignee',
      quest,
      territory: TERRITORY,
      character: THORN,
      class_prompt: null,
      registry: REGISTRY,
      scriptures: [],
      gazetteer: null,
      skills: [],
      handover_path: 'handover.md',
      continuation: { reason: 'revive', handover: null, journal: [], git_log: null },
    },
    templates,
  );

describe("the doer's next session", () => {
  const memo = MEMO.id;
  it('assignee-amendment reads that its author accepted it, and why, instead of an answer', async () => {
    const accepted = decided({ memo, by: 'author', decision: 'accepted' }, 'Đúng: lint chặn sửa tay.');
    const { user } = revived(accepted);
    await expect(user).toMatchFileSnapshot('__snapshots__/assignee-amendment.txt');
    expect(user).toContain('## The decision on your amendment');
    expect(user).not.toContain("## The owner's answer");
  });

  it('reads a rejection, or the owner who answered it', () => {
    const rejected = revived(decided({ memo, by: 'author', decision: 'rejected' }, 'Không: lint cho phép.'));
    expect(rejected.user).toContain(templates['amendment-rejected']);
    const owned = revived(decided({ memo, by: 'owner' }, 'Làm theo đề nghị.'));
    expect(owned.user).toContain(templates['amendment-owner']);
  });

  it('resumed, reads the description as accepted, which its cut prompt does not show', () => {
    const built = { system: 'You are Thorn.', user: '# Quest', blocks: [] };
    const amendment = { memo, by: 'author', decision: 'accepted' } as const;
    const answered = { question: BODY, answer: 'Đúng.', amendment, description: '## Goal\n\nMới.' };
    const resumed = resumedPrompt(built, answered, templates);
    expect(resumed.user).toContain("The quest's description now reads:\n\n## Goal\n\nMới.");
    const rejected = resumedPrompt(
      built,
      { ...answered, amendment: { ...amendment, decision: 'rejected' } },
      templates,
    );
    expect(rejected.user).not.toContain("The quest's description now reads");
  });
});
