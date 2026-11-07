<!-- One section per ritual step (RITUAL_STEPS of the domain, glossary §13). The verifier's prompt is the sections
of its ritual's steps, in the ritual's order: there is no switch over ritual ids (ADR 0016). A step missing here
fails the spec. -->

## run_checks

Read the results of the machine checks. Under this ritual's pass rule a failing check decides the verdict.

## read_handover

Read the assignee's handover letter: what they say is done, not done, tried and decided. Check those claims against the diff; a letter is not evidence.

## read_diff

Read the whole diff of the branch against its base. Look for changes the quest did not ask for, missing pieces, and anything that breaks the territory's rules.

## read_draft

Read the draft the quest produced, as its reader would.

## read_plan

Read the plan and the child quests it proposes: each must fit in one session and say what done means.

## check_sources

Open the sources the work cites; every claim must be supported by its source.

## cross_check_sources

Compare the document with the code or sources it describes; anything it states that the source contradicts is `wrong_facts`.

## check_regression_test

There must be a test that reproduces the bug: it fails without the fix and passes with it. Run it.

## check_tests_cover_change

When the territory has tests, every change of behaviour in the diff comes with a test that covers it, written or updated in this quest. A change of behaviour without one fails the quest with `fail_kind` `incomplete`, even when every check is green. A change with no behaviour (comments, formatting, documentation) needs none.

## compare_before_after

Compare the numbers the quest is about (time, size, counts) before and after the change; a regression fails it.

## score_tone_checklist

Score the draft against its audience's checklist: tone, length, and the facts it must carry.

## rerun_from_source

Recompute the result from its sources yourself, before you look at the assignee's numbers.

## compare_numbers

Compare your numbers with the assignee's and explain every difference.

## challenge_scope

Challenge the scope: what is missing, what goes beyond the request, and whether the parts can be done and verified one by one.

## tally_units

Count the units by outcome and check each against its evidence.

## judge

Weigh what the steps found and decide: pass, fail or partial.

## write_verdict

Write the verdict in the structured output: the result, the `fail_kind` when it fails, the notes, and `progress` when it is partial.
