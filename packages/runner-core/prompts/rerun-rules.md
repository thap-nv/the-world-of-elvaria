<!-- What a judge reruns (ADR 0008, 0032): one section is filled into law 3 of verifier.md as {{rerun_rule}}. `full`
is every judge's before CM-01 and of a run in full; `narrow` the judge of a run in its territory's narrow check mode
(check_policy, CM-01), whose shell holds only that run's commands: a whole-tree suite there costs what the narrow run
saved, for every quest waiting on the machine. `deferred` the judge of a narrow run in a `deferred` territory (CM-08,
ADR 0032 amending ADR 0008), whose shell holds no test suite either: the train runs it after the verdict. -->

## full

Rerun only the check you need to inspect, as narrowly as possible: one package or one spec file. Do not rerun the full suite whose results are already in this prompt.

## narrow

The machine checked this quest narrowly: each check ran its narrow command on what the branch changed since it forked, and the base branch's own full run vouches for the rest of the tree. Rerun only the check you need to inspect, as narrowly as possible: one package or one spec file, or the narrow command the machine ran. Never run the full suite or a check over the whole tree: it is not this quest's run, and your shell holds only this run's commands.

## deferred

The machine checked this quest narrowly: each check ran its narrow command on what the branch changed since it forked. The territory's test suite and its heavy checks have not run on it: they run after your verdict, on the delivery train that merges this quest with others into the base branch. Rerun only the check you need to inspect, as narrowly as possible: one spec file, or the narrow command the machine ran. Your shell holds neither the test suite nor a check over the whole tree; judge the diff on what this run and your reading show.
