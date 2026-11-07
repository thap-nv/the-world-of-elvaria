# @elvaria/chancellor

## Does

- Turns one utterance of the owner into quest drafts (implementation-plan §3.11):
  `draftQuests(context, session)` builds the prompt with runner-core's `buildChancellorPrompt` (territories,
  registry with tags and the script catalog, characters, mana, context budget), runs one session of the
  Chancellor through an `AgentRunner` (role `chancellor`, no tool, `CHANCELLOR_MAX_TURNS` turns, killed
  after `CHANCELLOR_MAX_MINUTES`), and checks the reply with the domain's `QuestDraftFileSchema` (one question at
  most, refs that name other drafts).
- Asks for structured output the way the tribe can give it (§3.14): with the quest-draft JSON Schema as
  `SpawnRequest.structured` (`--json-schema`) when the chosen Chancellor's tribe has `structured_output`,
  less the keywords Claude Code 2.1.319 refuses (it validates the schema as draft-07, strict: `$schema`,
  `contains`, `minContains`, `maxContains`; zod still checks the one-question rule they carry);
  otherwise with the schema in the system prompt, the JSON cut out of the session's last text, and one retry in
  `<run_dir>/retry/` when that text cannot be used. Who speaks is the domain's `selectChancellor` (§10
  question 6); the caller passes its choice in.
- Holds the drafts against the kingdom's files (`screenDrafts`): a draft is dropped, with its reason, when it
  names a kind, territory, script or tag the kingdom does not have (tags are the closed list of
  `registry/tags.json`), a class its kind does not allow, a script not made for its kind, a secret its
  territory does not allow (ADR 0013), or is a party part (only the party lead emits parts, §3.13); so is every
  draft that waits on a dropped one, or on drafts that wait on it. The rest come back with each draft after its
  parent and its dependencies. The Chancellor's question comes back even when its draft is dropped.
- Turns drafts into inbox commands (`draftCommands`): one `create_quest` with `draft: true` and
  `created_by: chancellor` per draft, in that order; `depends_on_refs` and `parent_ref` become the quest
  ids the Steward will give (the caller derives them from each command, `questIdOfCommand` of
  `@elvaria/steward`), so drafts that depend on each other reach the Steward as quests that do.

## Does not

- Write anything in the kingdom: no quest, no inbox file. `apps/cli` (`elvaria say`) writes the commands, the
  Steward writes the quests in status `draft` (ADR 0005), the owner confirms them.
- Pick the Chancellor, build runners or know a CLI: the caller gives the runner, the character and its class
  (ADR 0006, 0021).
- Bundle or split work beyond what the prompt asks, or check script params against `params_schema`: P1-17.

## Depends on

- `@elvaria/domain` (`QuestDraftFileSchema`, `contractOf`, registry and territory types, `Result`),
  `@elvaria/runner-core` (`AgentRunner`, `buildChancellorPrompt`, `toolPolicyOf`, prompt templates). No
  third-party package.

## How to test

```bash
pnpm --filter @elvaria/chancellor test
```

The specs read the Chancellor's replies as a CLI hands them over (`structured_output`, one JSON file each in
`src/__fixtures__/structured-output/`: a script-tier link check, a split into a plan and its children, a party
contract, a vague request with its one question, drafts the kingdom refuses, two questions) and play them
through a scripted runner; the default registry is read from `packages/registry-default/`, which this package
may not import. `src/reply.spec.ts` checks that the schema given to the CLI is
`docs/schemas/quest-draft.schema.json` without its examples and those keywords. `apps/cli/src/say/say.spec.ts`
runs `elvaria say` end to end on a kingdom on disk, then one tick of the Steward that writes the drafts.

A run with the real CLI costs one small session (P1-13: Sonnet, 2 turns, about 0.03 USD): build the hook
(`pnpm --filter @elvaria/hooks build`), then on a scratch kingdom `elvaria doctor`, `territory add`,
`character add aldric --class chancellor --tribe claude` and `elvaria say "<words>"`.
