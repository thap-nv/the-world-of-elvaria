import { describe, expect, it } from 'vitest';

import { REGISTRY, SABLE, TERRITORY, THORN } from '../__fixtures__/world.ts';
import { NO_COMMIT_RULE, NO_HISTORY_COMMAND, NO_PUSH_COMMAND, WRITE_TOOLS } from './constants.ts';
import { toolOf, toolPolicyOf } from './tool-policy.ts';
import type { CharacterClass } from '@elvaria/domain';

const classOf = (id: string): CharacterClass => REGISTRY.classes.find((entry) => entry.id === id)!;
const knight = classOf('knight');

describe('toolPolicyOf', () => {
  it('gives a verifier no tool that changes files, whatever its class allows (ADR 0008)', () => {
    for (const characterClass of REGISTRY.classes) {
      const policy = toolPolicyOf({ role: 'verifier', characterClass, territory: TERRITORY });
      for (const tool of WRITE_TOOLS) {
        expect(policy.tools).not.toContain(tool);
        expect(policy.allow.map(toolOf)).not.toContain(tool);
        expect(policy.deny).toContain(tool);
      }
    }
  });

  it("turns Agent(apprentice) into the Agent tool and the apprentice's tools, never a rule (§10)", () => {
    const policy = toolPolicyOf({ role: 'assignee', characterClass: knight, territory: TERRITORY });
    expect(policy.tools).toEqual(['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash', 'Agent']);
    expect(policy.allow).not.toContain('Agent(apprentice)');
    expect(policy.apprentice).toEqual({ tools: ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash'] });
    expect(policy.deny).toEqual(
      expect.arrayContaining([
        'Agent(Explore)',
        'Agent(general-purpose)',
        'Agent(Plan)',
        'Agent(statusline-setup)',
      ]),
    );
  });

  it('gives the apprentice only to an assignee', () => {
    for (const role of ['verifier', 'chancellor', 'monk', 'bard'] as const) {
      const policy = toolPolicyOf({ role, characterClass: knight });
      expect(policy.apprentice).toBeNull();
      expect(policy.tools).not.toContain('Agent');
    }
  });

  it("lets a character with a shell run the territory's non-exclusive checks and check commands", () => {
    const { allow } = toolPolicyOf({ role: 'assignee', characterClass: knight, territory: TERRITORY });
    expect(allow).toEqual(
      expect.arrayContaining([
        'Bash(pnpm lint:*)',
        'Bash(pnpm -r test:*)',
        'Bash(pnpm test:*)',
        'Bash(pnpm typecheck:*)',
      ]),
    );
    // e2e is exclusive: only runChecks may start it. setup is not a check.
    expect(allow).not.toContain('Bash(pnpm e2e:*)');
    expect(allow).not.toContain('Bash(pnpm install --prefer-offline:*)');
    expect(new Set(allow).size).toBe(allow.length);
  });

  // P1-45, P1-37 (g): the mage prompt sends a part only to the check commands the mage's own shell lists. Deferring
  // a check to the merge quest leaves its command in every shell; an exclusive one stays out of both.
  it("gives a mage the check commands of a part's knight, deferred or not, and neither an exclusive one", () => {
    const checks = TERRITORY.checks.map((check) => ({ ...check, defer_to_merge: true }));
    for (const id of ['mage', 'knight']) {
      const { allow } = toolPolicyOf({
        role: 'assignee',
        characterClass: classOf(id),
        territory: { ...TERRITORY, checks },
      });
      expect(allow).toEqual(expect.arrayContaining(['Bash(pnpm lint:*)', 'Bash(pnpm -r test:*)']));
      expect(allow).not.toContain('Bash(pnpm e2e:*)');
    }
  });

  it('adds no shell rule to a class without a shell', () => {
    const policy = toolPolicyOf({ role: 'assignee', characterClass: classOf('bard'), territory: TERRITORY });
    expect(policy.tools).not.toContain('Bash');
    expect(policy.allow.some((rule) => rule.startsWith('Bash('))).toBe(false);
  });

  it('fences every session: no push, no secret files, the laws of the territory (§3.9)', () => {
    const policy = toolPolicyOf({ role: 'assignee', characterClass: knight, territory: TERRITORY });
    expect(policy.deny).toEqual(
      expect.arrayContaining([
        'Bash(git push:*)',
        'Read(./.env)',
        'Read(./.env.*)',
        'Edit(./.env)',
        'Read(./infra/secrets/**)',
        'Edit(./infra/secrets/**)',
      ]),
    );
    expect(policy.laws).toEqual({
      forbidden_paths: ['.env', '.env.*', 'infra/secrets/**'],
      read_only_paths: ['apps/api/openapi.json', 'packages/shared/src/api-types.ts'],
      patch_paths: ['.husky/**'],
      forbidden_commands: [String.raw`drizzle-kit\s+(drop|push)`, NO_PUSH_COMMAND],
    });
  });

  it('keeps the patch paths of a git territory only, and opens no rule for them (P1-28)', () => {
    const policy = toolPolicyOf({ role: 'assignee', characterClass: knight, territory: TERRITORY });
    expect([...policy.allow, ...policy.deny].some((rule) => rule.includes('.husky'))).toBe(false);
    const folder = { ...TERRITORY, vcs: { type: 'none' as const } };
    const unpatched = toolPolicyOf({ role: 'assignee', characterClass: knight, territory: folder });
    expect(unpatched.laws.patch_paths).toEqual([]);
    expect(toolPolicyOf({ role: 'chancellor', characterClass: knight }).laws.patch_paths).toEqual([]);
  });

  it('lets every session read a read-only path and none write it (P1-24)', () => {
    for (const role of ['assignee', 'verifier'] as const) {
      const { deny } = toolPolicyOf({ role, characterClass: knight, territory: TERRITORY });
      expect(deny).toEqual(
        expect.arrayContaining(['Edit(./apps/api/openapi.json)', 'Edit(./packages/shared/src/api-types.ts)']),
      );
      expect(deny).not.toContain('Read(./apps/api/openapi.json)');
      expect(deny).not.toContain('Read(./packages/shared/src/api-types.ts)');
    }
  });

  it("lets a character that edits files run the territory's generators, and nobody else (P1-24)", () => {
    const allowOf = (role: 'assignee' | 'verifier', id: string) =>
      toolPolicyOf({ role, characterClass: classOf(id), territory: TERRITORY }).allow;
    expect(allowOf('assignee', 'knight')).toContain('Bash(pnpm api:openapi:*)');
    // A verifier judges what the generator wrote; it never regenerates it (ADR 0008).
    expect(allowOf('verifier', 'knight')).not.toContain('Bash(pnpm api:openapi:*)');
    const shellOnly = { tools: { allow: ['Read', 'Bash(git status:*)'], deny: [] } };
    const reader = toolPolicyOf({
      role: 'assignee',
      characterClass: knight,
      character: shellOnly,
      territory: TERRITORY,
    });
    expect(reader.allow).toContain('Bash(pnpm lint:*)');
    expect(reader.allow).not.toContain('Bash(pnpm api:openapi:*)');
    const noShell = { tools: { allow: ['Read', 'Edit'], deny: [] } };
    const scribe = toolPolicyOf({
      role: 'assignee',
      characterClass: knight,
      character: noShell,
      territory: TERRITORY,
    });
    expect(scribe.allow.some((rule) => rule.startsWith('Bash('))).toBe(false);
  });

  it("denies every role's write tools git's own folder, never its reads nor a forbidden path (P1-49)", () => {
    const roles = ['assignee', 'verifier', 'chancellor', 'monk', 'bard'] as const;
    for (const [role, scratch] of [
      ...roles.map((role) => [role, false] as const),
      ['verifier', true] as const,
    ]) {
      const policy = toolPolicyOf({ role, characterClass: knight, territory: TERRITORY, scratch });
      expect(policy.deny).toContain('Edit(./.git/**)');
      expect(policy.deny).not.toContain('Read(./.git/**)');
      expect(policy.laws.forbidden_paths).not.toContain('.git/**');
    }
  });

  it('keeps the fences without a territory', () => {
    const policy = toolPolicyOf({ role: 'chancellor', characterClass: classOf('chancellor') });
    expect(policy.tools).toEqual([]);
    expect(policy.allow).toEqual([]);
    expect(policy.laws.forbidden_commands).toEqual([NO_PUSH_COMMAND]);
    expect(policy.laws.read_only_paths).toEqual([]);
    expect(policy.deny).toContain('Read(./.env)');
  });

  it("replaces the class's lists with the character's own (character.tools)", () => {
    const character = { tools: { allow: ['Read', 'Bash(node:*)', 'WebFetch'], deny: ['WebFetch'] } };
    const policy = toolPolicyOf({ role: 'assignee', characterClass: knight, character });
    // A bare deny removes the tool even though the override allowed it.
    expect(policy.tools).toEqual(['Read', 'Bash']);
    expect(policy.apprentice).toBeNull();
    expect(policy.deny).toContain('WebFetch');
    expect(
      toolPolicyOf({ role: 'verifier', characterClass: classOf('judge'), character: SABLE }).tools,
    ).toEqual(['Read', 'Glob', 'Grep', 'Bash']);
    expect(toolPolicyOf({ role: 'assignee', characterClass: knight, character: THORN }).tools).toContain(
      'Agent',
    );
  });

  it("matches the review of every default class's tools (§11, P1-01)", async () => {
    const roleOf = (characterClass: CharacterClass) => {
      if (characterClass.is_verifier) return 'verifier';
      if (characterClass.is_monk) return 'monk';
      return characterClass.id === 'chancellor' ? 'chancellor' : 'assignee';
    };
    const policies = REGISTRY.classes.map((characterClass) => {
      const role = roleOf(characterClass);
      const policy = toolPolicyOf({ role, characterClass, territory: TERRITORY });
      return {
        class: characterClass.id,
        role,
        tools: policy.tools,
        allow: policy.allow,
        apprentice: policy.apprentice,
      };
    });
    await expect(`${JSON.stringify(policies, null, 2)}\n`).toMatchFileSnapshot(
      '__snapshots__/class-policies.txt',
    );
  });
});

describe('NO_PUSH_COMMAND', () => {
  const law = new RegExp(NO_PUSH_COMMAND, 'i');

  it.each(['git push', 'git push origin HEAD', 'git -C . push', 'git --no-pager push', 'GIT PUSH --force'])(
    'stops %s',
    (command) => {
      expect(law.test(command)).toBe(true);
    },
  );

  it.each(['git status', 'git log --grep push', 'git commit -m "push later"', 'pnpm test'])(
    'lets %s run',
    (command) => {
      expect(law.test(command)).toBe(false);
    },
  );
});

describe('a judge in its scratch plot (ADR 0022, P1-20)', () => {
  const judge = classOf('judge');
  const scratch = toolPolicyOf({
    role: 'verifier',
    characterClass: judge,
    territory: TERRITORY,
    scratch: true,
  });

  it('gets Edit, Write and git to see and undo its breaks, though its class denies them', () => {
    expect(judge.tools.deny).toEqual(expect.arrayContaining(['Edit', 'Write']));
    expect(scratch.tools).toEqual(expect.arrayContaining(['Edit', 'Write', 'Bash']));
    expect(scratch.allow).toEqual(
      expect.arrayContaining(['Edit', 'Write', 'Bash(git status:*)', 'Bash(git restore:*)']),
    );
    expect(scratch.deny).not.toContain('Edit');
    expect(scratch.deny).not.toContain('Write');
  });

  it('may neither commit nor push, nor run the generators of what it judges', () => {
    expect(scratch.deny).toEqual(expect.arrayContaining([NO_COMMIT_RULE, 'Bash(git push:*)']));
    expect(scratch.laws.forbidden_commands).toEqual(
      expect.arrayContaining([NO_PUSH_COMMAND, NO_HISTORY_COMMAND]),
    );
    expect(scratch.allow.filter((rule) => rule.includes('generate'))).toEqual([]);
    expect(scratch.deny).toEqual(expect.arrayContaining(['Read(./infra/secrets/**)', 'Agent']));
  });

  it("runs the territory's exclusive checks, whose lock the Steward holds for its session (P1-20 (a))", () => {
    expect(scratch.allow).toContain('Bash(pnpm e2e:*)');
  });

  it('is asked of a verifier only: an assignee and a judge elsewhere keep their own tools', () => {
    const plain = toolPolicyOf({ role: 'verifier', characterClass: judge, territory: TERRITORY });
    expect(plain.tools).not.toContain('Edit');
    expect(plain.allow).not.toContain('Bash(pnpm e2e:*)');
    expect(plain.laws.forbidden_commands).not.toContain(NO_HISTORY_COMMAND);
    const knightOwn = toolPolicyOf({ role: 'assignee', characterClass: knight, territory: TERRITORY });
    expect(
      toolPolicyOf({ role: 'assignee', characterClass: knight, territory: TERRITORY, scratch: true }),
    ).toEqual(knightOwn);
  });
});

describe('NO_HISTORY_COMMAND', () => {
  const law = new RegExp(NO_HISTORY_COMMAND, 'i');

  it.each([
    'git commit -am "break"',
    'git -C . commit --allow-empty -m x',
    'GIT COMMIT -m x',
    'git merge quest/q',
    'git reset --hard HEAD~1',
    'git branch -f quest/q HEAD',
    'git update-ref refs/heads/quest/q HEAD',
    'git checkout -B quest/q',
    'git switch -c other',
    'git stash',
    'git --no-pager tag v1',
    'git worktree add ../x',
  ])('stops %s', (command) => {
    expect(law.test(command)).toBe(true);
  });

  it.each(['git status', 'git diff', 'git restore src/sum.ts', 'git log --grep commit', 'pnpm test'])(
    'lets %s run',
    (command) => {
      expect(law.test(command)).toBe(false);
    },
  );
});
