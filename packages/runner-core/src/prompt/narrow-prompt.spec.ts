// The judge of a narrow run (CM-01, ADR 0032): law 3 says what the machine ran and what not to rerun, and its shell
// lists the run's narrow commands; a judge of a run in full reads the prompt it read before CM-01 (verifier.txt).
import { describe, expect, it } from 'vitest';

import {
  CHECKS,
  DIFF,
  LETTER,
  QUEST,
  REGISTRY,
  SABLE,
  TERRITORY,
  classPromptOf,
} from '../__fixtures__/world.ts';
import { buildPrompt } from './build-prompt.ts';
import { loadPromptTemplates } from './templates.ts';
import type { VerifierPromptInput } from './build-prompt.ts';
import type { BuiltPrompt } from '../runner/types.ts';

const templates = await loadPromptTemplates();
const show = ({ system, user }: BuiltPrompt) => `=== system ===\n${system}\n\n=== user ===\n${user}\n`;

const [lint, unit] = TERRITORY.checks;
const narrowUnit = { ...unit!, narrow: 'pnpm test:changed' };

const verifier: VerifierPromptInput = {
  role: 'verifier',
  locale: 'vi',
  decree: null,
  quest: QUEST,
  character: SABLE,
  territory: {
    ...TERRITORY,
    check_policy: { mode: 'narrow', full_when: [], train: { max_quests: 5, max_wait_minutes: 30 } },
  },
  registry: REGISTRY,
  scriptures: [],
  gazetteer: null,
  class_prompt: classPromptOf('judge'),
  handover: LETTER,
  diff: DIFF,
  partial: null,
  checks: CHECKS,
};

const narrow: VerifierPromptInput = { ...verifier, narrow_checks: [lint!, narrowUnit] };

describe('the verifier prompt of a narrow run', () => {
  it('verifier-narrow reads what the machine ran narrowly', async () => {
    await expect(show(buildPrompt(narrow, templates))).toMatchFileSnapshot(
      '__snapshots__/verifier-narrow.txt',
    );
  });

  it('says the run was narrow and lists its narrow commands, never the check run they stand for', () => {
    const { system } = buildPrompt(narrow, templates);
    expect(system).toContain('The machine checked this quest narrowly');
    expect(system).toContain('your shell holds only this run');
    expect(system).toContain('- `pnpm test:changed`');
    expect(system).not.toContain('- `pnpm -r test`');
    expect(system).not.toContain('Do not rerun the full suite whose results are already in this prompt.');
  });

  it('reads as before CM-01 without a narrow run, whatever the policy says', () => {
    const { system } = buildPrompt(verifier, templates);
    expect(system).toContain(
      "3. Judge from the diff, the handover letter and the territory itself, never from the assignee's claims alone. Rerun only the check you need to inspect, as narrowly as possible: one package or one spec file. Do not rerun the full suite whose results are already in this prompt.",
    );
    expect(system).toContain('- `pnpm -r test`');
    expect(system).not.toContain('narrowly:');
  });
});
