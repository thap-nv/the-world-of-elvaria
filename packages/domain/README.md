# @elvaria/domain

## Does

- Holds the zod schemas that are the source of the data contracts (ADR 0003): `kingdom`, `territory` and the
  registry files (`kinds`, `classes`, `rituals`, `scripts`, `tags`), with their TypeScript types.
- Checks a registry across its five files (`parseRegistry`, `checkRegistry`): unknown ritual, class, kind or
  step, duplicate ids, a verifier allowed to take work, a class and a kind that disagree.
- Runs the quest state machine (`src/quest/`): the table of moves is data (`QUEST_TRANSITIONS`), and
  `transition(quest, event, actor)` is the only way a quest changes status. It keeps `attempts`, the attempt log
  and who holds the quest, refuses what the table does not allow, and validates the result against the schema.
  `partyIssues` checks the invariants of a party across its quests; `renderQuestTransitionTable` renders the
  table of implementation-plan §2.5.
- Runs the character state machine (`src/character/`, `transitionCharacter`) and derives what is never stored:
  `reputationOf`, `affinityOf`, `titleOf`.
- Maps the domain onto the design system (implementation-plan §2.7): `statusToneOf`, `characterToneOf`, and
  `bannerOf` (`src/world/`), the one band the HUD shows.
- Gives the core types every package builds on: `Result`, branded ids (`QuestId`, `TribeId`, ...), `Clock` and
  `Instant`, `zonedTime` (local day and ISO offset in `kingdom.tz`), `IdSource` (ULIDs and dated ids).
- Names every number it decides with in `src/constants.ts` and the `constants.ts` of each folder.

## Does not

- Do IO of any kind: no Node built-ins, no `process`, no `Date.now`, `Math.random` or timers (ADR 0002). Time
  and randomness come in through `Clock` and `RandomSource`; events carry their own time. Lint, TypeScript
  (`types: []`) and dependency-cruiser each enforce this.
- Throw: failures are `Result` values.
- Know the CLIs or the renderer.
- Check what needs other files in a single quest's transition: dependencies being done, the registry, a party.
  The Steward checks those before it applies an event (`partyIssues` for parties).

## Depends on

- `zod` only. No other workspace.

## How to test

```bash
pnpm --filter @elvaria/domain test   # vitest with a 100 % coverage gate
```

The schema specs parse the `examples` of the v1 contracts in `docs/schemas/`, so a zod change that drifts
from the reviewed contract fails here first. The state-machine specs explore every quest the machine reaches
from a draft in ten events and take long seeded random walks (`src/quest/__fixtures__/quests.ts`): no move
outside the table, every row reachable, guards never overlap.

Specs cannot read files: the domain's program has no Node types. The one file a spec needs, the design
system's `elvaria.css` (whose `data-status` values must be the tones of `statusToneOf`), is read by
`vitest.config.mjs` and handed to the spec through vitest's `provide` / `inject`.
