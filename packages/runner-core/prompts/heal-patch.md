<!-- User part of a verifier, inside the review (review.md, {{heal_patch}}), when a healer mended the run's work after
the territory's hooks refused its commit (ADR 0034, plans/healer.md 4.4): heal.patch, the healer's change as the
Steward measured it before committing it through the hooks, at most 60 lines (HEAL_PATCH_MAX_LINES). Empty otherwise,
and the review reads as before. -->

# The healer's change

The territory's hooks refused the commit of {{assignee}}'s finished work. {{healer}}, a healer, mended it, and the Steward committed the mended work through the same hooks. What {{healer}} changed, against the work as {{assignee}} left it:

{{patch}}

The diff below holds this change with the rest of the work: judge the work as it stands, the heal part of it. In your notes, say whether the heal changed what the work does beyond what the hooks named. A heal that weakens a guard (a lint rule turned off, a suppression added, a test skipped) fails the quest as `unsafe`.
