# ADR 0025 · Persona is display-only; mood and bonds are derived, never inputs

- Status: accepted · 2026-11-10
- Related: [implementation-plan.md](../implementation-plan.md) §3.16.11, §9.1 item 33; [product plan 0.8](../ke-hoach-dung-elvaria-0.8.md) principle 16, §14; [ADR 0008](0008-separation-of-duties.md), [ADR 0014](0014-english-identifiers-glossary-bilingual-ui.md)

## Context

The owner wants characters with a voice of their own (gruff, sweet, stern, calm, hot-tempered, terse, funny, cold), given at birth or formed over time, and characters that like or dislike each other. Studies of persona prompts find no gain in accuracy and sometimes a loss; what a persona changes is tone. A judge that "dislikes" a knight must not fail the knight more often.

## Decision

- `character.persona` is optional data: how the character addresses the owner, tone, verbosity, a few quirks. It is set at summon or drawn from the theme's persona table.
- The work prompt carries no persona. Persona reaches two places only: a short block "when you speak to the owner", attached only when the session can speak to the owner (a question, the summon chat), and display lines a cheap model writes from a fact sheet, the path the bard uses.
- Mood and bonds are pure functions of history in `domain` (`moodOf`, `bondOf`), like `titleOf`. Nothing is stored. A bond is a reading of the verdict graph: a judge that often fails one knight shows as a rival, a party that joined cleanly as comrades.
- Bonds, mood and persona are never an input to verifier selection, to dispatch or to the judge's prompt. The judge is not told its bond with the doer.
- Persona shows in the summon chat, questions to the owner, the chronicle, the bell and the character panel. It never shows in code, commits, delivered documents, verdict findings or the journal.
- Whatever the voice, a character reports bad news as it is.

## Alternatives

- Persona in the work prompt: costs tokens in every session, competes with the quest for the model's attention, and leaks a voice into deliverables.
- Stored relationship scores that characters update: a second source of truth that drifts from the verdicts, and a way for theatre to reach judgement.

## Consequences

- Turning persona on or off cannot change a verdict: prompt snapshots for the doer and the judge stay byte-identical, and a test holds that.
- The fantasy stays in display strings, as ADR 0014 wants; themes can ship their own persona tables.
