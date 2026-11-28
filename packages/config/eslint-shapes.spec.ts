import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

import { sharedShapeConfigs } from './eslint-shapes.mjs';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const NO_ENUM = { selector: 'TSEnumDeclaration', message: 'no enum' };

const linter = new Linter({ cwd: REPO });
const configs: Linter.Config[] = [
  { files: ['**/*.ts'], languageOptions: { parser: tseslint.parser } },
  ...sharedShapeConfigs([NO_ENUM]),
];

const lint = (file: string, code: string): string[] =>
  linter.verify(code, configs, join(REPO, file)).map((message) => message.message);

const READ_BY_HAND = "const quest = await readQuest(ctx, input.positionals[0] ?? '');";
const REFUSE_BY_HAND = 'ctx.io.err(ctx.t(key, { id, status: ctx.t(QUEST_STATUS_LABEL[quest.status]) }));';

describe('gathered shapes keep one home (R7, AH-14a)', () => {
  it.each([
    ['apps/cli/src/quest/deliver.ts', READ_BY_HAND, 'namedQuest or namedCharacter'],
    [
      'apps/cli/src/character/level.ts',
      "const c = await readCharacter(ctx, input.positionals[0] ?? '');",
      'namedBy',
    ],
    ['apps/cli/src/quest/hold.ts', REFUSE_BY_HAND, 'questUnless'],
    ['apps/cli/src/quest/lifecycle.ts', READ_BY_HAND, 'namedBy'],
  ])('refuses the hand copy in %s', (file, code, home) => {
    expect(lint(file, code).join('\n')).toContain(home);
  });

  it('lets each home keep its own shape, and the call through it pass', () => {
    expect(lint('apps/cli/src/quest/references.ts', REFUSE_BY_HAND)).toEqual([]);
    expect(lint('apps/cli/src/kingdom-context.ts', READ_BY_HAND)).toEqual([]);
    expect(lint('apps/cli/src/quest/deliver.ts', 'const quest = await namedQuest(input, ctx);')).toEqual([]);
    expect(lint('apps/cli/src/quest/edit.ts', "const all = await readQuest(ctx, 'q_1');")).toEqual([]);
  });

  it('keeps the repo-wide restrictions on every file it covers, homes too', () => {
    for (const file of ['apps/cli/src/quest/deliver.ts', 'apps/cli/src/quest/references.ts'])
      expect(lint(file, 'enum Status { Open }')).toEqual(['no enum']);
  });

  it('leaves specs and other workspaces alone', () => {
    expect(lint('apps/cli/src/quest/deliver.spec.ts', READ_BY_HAND)).toEqual([]);
    expect(lint('packages/steward/src/quest/deliver.ts', READ_BY_HAND)).toEqual([]);
  });
});
