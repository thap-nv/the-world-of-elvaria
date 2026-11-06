# ADR 0011 · One `judge` verifier class per tribe with ritual chosen by quest kind (titles are theme data)

- Status: accepted · 2026-11-06
- Related: [implementation-plan.md](../implementation-plan.md) §2.7, §9.1 item 2; [class.schema.json](../schemas/class.schema.json)
- Amendment proposed: [ADR 0022](0022-tests-in-the-world.md) (a kind may override its ritual by quest tags)

## Context

The product plan (§6) has five verifier classes (Thợ cả, Thủ thư trưởng, Chiêm tinh gia thứ hai, Trọng tài, Hiền giả), and principle 5 gives each character one class. The ten stage-1 quests span at least five kinds; with two tribes that is ten characters just to judge, while the stage-1 milestone of the product plan counts four characters.

## Decision

- One verifier class, `judge` (`is_verifier: true`, `vow_no_production: true`), with at least one judge character per tribe.
- What differs per kind is the ritual, which is already registry data: `ritual = kinds[quest.kind].ritual`.
- The five names become titles in theme data: `themes/fantasy/classes.json` gives `judge` a `title_by_kind` (i18n keys) and an `icon_by_kind`: `class-judge-build` for build, fix, refactor, integrate, batch; `class-judge-document` for document, research, publish, negotiate; `class-astrologer` for analyze; `class-mage` for plan.
- Stage-1 roster: 8 characters: knight (Claude), scribe (Gemini), scout (Gemini), astrologer (Claude), bard (Claude), mage (Claude), judge (Claude), judge (Gemini).

## Alternatives

- Keep five verifier classes: the architecture runs the same, only the roster grows.

## Consequences

- Principle 5 still holds: a judge only judges.
- The world shows the kind-specific title, so the fantasy stays.
