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
  otherwise through runner-core's `spawnParsed` (P1-33, the road the judge's verdict takes too): the schema in
  the system prompt, the JSON cut out of the session's last text, and one retry in a fresh session in
  `<run_dir>/retry/` when `checkReply` finds that text unusable; `session_ids` names both sessions and `tokens`
  counts both. Who speaks is the domain's `selectChancellor` (§10 question 6); the caller passes its choice in.
- Holds the drafts against the kingdom's files (`screenDrafts`): a draft is dropped, with its reason, when it
  names a kind, territory, script or tag the kingdom does not have (tags are the closed list of
  `registry/tags.json`), a class its kind does not allow, a script not made for its kind or with params outside
  its `params_schema` (§3.12), a secret its territory does not allow (ADR 0013), a party part (only the party lead
  emits parts, §3.13), or an estimate above `context_budget_tokens` that nobody split (one quest, one context, ADR
  0017: a draft whose kind delivers sub-quests, or that other drafts name as parent, is the split itself); so is every
  draft that waits on a dropped one, or on drafts that wait on it. The rest come back with each draft after its
  parent and its dependencies. The Chancellor's question comes back even when its draft is dropped.
- Turns drafts into inbox commands (`draftCommands`): one `create_quest` with `draft: true` and
  `created_by: chancellor` per draft, in that order; `depends_on_refs` and `parent_ref` become the quest
  ids the Steward will give (the caller derives them from each command, `questIdOfCommand` of
  `@elvaria/steward`), so drafts that depend on each other reach the Steward as quests that do. Given memos (PS-03b,
  `say --memo`), every command carries them: the first draft the owner confirms closes them.
- Triages memos (PS-03b, implementation-plan §3.16.3): `triageMemos(context, session, signal)` runs one session for
  the whole batch (`buildTriagePrompt` of runner-core; the memo-triage contract, `MEMO_TRIAGE_JSON_SCHEMA`), checks
  that each memo of the batch is decided once and no other named (`triageCheckOf`), and screens the drafts of its new
  quests; the signal kills the session (failure `stopped`). `triageCommands` groups the decisions by the work they
  share, holds each group against `kingdom.delegation` (the domain's `delegationHolds`) and gives inbox commands:
  within it an `edit_quest` that merges, a `create_quest` made open, a `decide_memo` that sets a memo aside; beyond it
  an `escalate_memo` per memo, a new quest waiting as a draft. One session's plumbing (`src/session.ts`) serves both.

## Does not

- Write anything in the kingdom: no quest, no inbox file. `apps/cli` (`elvaria say`) writes the commands, the
  Steward writes the quests in status `draft` (ADR 0005), the owner confirms them.
- Pick the Chancellor, build runners or know a CLI: the caller gives the runner, the character and its class
  (ADR 0006, 0021).
- Bundle or split work itself: the prompt asks the Chancellor to (`tier`, a batch for tiny jobs, a plan and its
  children for long ones); the screen only drops a long job left whole.

## Depends on

- `@elvaria/domain` (`QuestDraftFileSchema`, `contractOf`, registry and territory types, `Result`),
  `@elvaria/runner-core` (`AgentRunner`, `buildChancellorPrompt`, `toolPolicyOf`, prompt templates, `spawnParsed`
  and the text-reply helpers of `src/structured/`). No third-party package.

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
