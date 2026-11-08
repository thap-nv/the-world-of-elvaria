import { describe, expect, it } from 'vitest';

import { REGISTRY, SABLE, TERRITORY, THORN } from '../__fixtures__/world.ts';
import { NO_PUSH_COMMAND, WRITE_TOOLS } from './constants.ts';
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
      forbidden_commands: [String.raw`drizzle-kit\s+(drop|push)`, NO_PUSH_COMMAND],
    });
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
