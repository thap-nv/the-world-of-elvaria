# ADR 0035 · Checks run once per tree: green runs are carried, and the base branch goes in before the checks

- Status: accepted · 2026-11-26 (RC-05; the owner settled K1–K11 of the plan on 2026-11-25)
- Amends: [ADR 0023](0023-steward-delivers-push-pr-merge.md) (the order of a delivery; what a push tells the territory's hook), [ADR 0032](0032-check-modes-of-a-territory.md) (the patrol after each move of the base branch; the queue's rerun)
- Related: [plans/recheck.md](../plans/recheck.md); [ADR 0008](0008-separation-of-duties.md), [ADR 0033](0033-late-machine-verdict.md); owner's (546), (555), (556) in implementation-plan §11 (2026-11-25)

## Context

On 2026-11-25 the Elvaria territory (`narrow`, `pr_merge`) spent about 530 machine minutes on checks for 16 merged changes. A quest that touched `full_when` ran the whole test suite four times on the same content: after its session, in the merge queue after the base branch was merged in, in the territory's pre-push hook, and in the patrol of the merge commit. The merge commit has the very git tree the queue checked. The run after a session checks a tree that never reaches the base branch: the queue merges the base branch afterwards and checks again, and a red run there (one that day, from load) opens a merge quest. A red queue run is blamed without a second run, and a push refused by the hook's timeout fails a delivery whose checks were green.

## Decision

- A green run of a check is a fact about a git tree: the tree id of the commit it ran on, the command lines it ran, and for a narrow command the commit its diff counted from. `check.end` and `patrol.ran` (later `train.ran`) carry them, and the Steward's check ledger is a pure function of the log.
- Before a check runs, the Steward carries it instead when the ledger holds the same command green on the same tree, at most `CARRY_MAX_AGE_HOURS` (12) old, under unchanged check commands and `commands.setup`. This holds for the queue's run, a guest's try, a train, and a patrol by any trigger but the owner's. A carried check is written as carried, takes no time and is no new fact. A red check, one set aside for its environment and a run on uncommitted changes are never facts. An upgrade of the pinned build expires nothing.
- A patrol whose checks are all carried makes no plot and still writes `patrol.ran`, so the base branch's health, the probe's green head and the delegation breaker read it as before.
- A red run of the queue runs its red checks once more on the same tree before it asks the base branch or the quest's own head; green then is `flaky` (`check.attributed`, source `queue`) and the delivery goes on.
- In a territory whose queue updates branches (`pr`, `pr_merge`), the base branch is merged into a quest's branch before the checks after its session, by the queue's own update (never a rebase, the rules of `shared_paths`, the generators), unless the territory is red, the merge conflicts beyond the rules, or the quest is a party's contract or part. The judge reads that run and that branch; the queue then finds the base branch held and runs nothing, or merges only what moved since.
- A quest branch keeps that merge only when the checks on it are green. Red, the Steward takes its own unpushed merge back and runs the red checks on the head as submitted: red there is the quest's fail, as today; green there, the rest runs on that head and the quest goes on as today, the queue meeting the merge later.
- A push still runs the territory's hooks. The Steward names the commit its checks passed on in the push's explicit env, `ELVARIA_CHECKED_HEAD`, when that run had a check and set none aside; what a hook does with it is the territory's.
- (Amended 2026-11-26, RC-05) No early merge either where the judge checks in a scratch plot, where a generator fails after the merge (the merge is taken back), or once a run of the same session was taken back. A run stopped, unable to run or set aside for its environment leaves the merge pending for the next run of the same session; a pending merge of another run is the branch's history. A taken-back run is the judge's no more, but its green checks stay facts of its tree.
- Amendments, written into them when this was accepted (2026-11-26). ADR 0023: "(Amended, RC-02/RC-05: the base branch is merged before the checks after a session where the queue would merge it; the queue's update merges only what moved since. A push names the commit the Steward's checks passed on in `ELVARIA_CHECKED_HEAD`; the hooks still run.)" ADR 0032: "(Amended, RC-04: a check green on the same tree with the same command is carried, in the queue, a guest's try, a train and every patrol but the owner's; the queue runs red checks once more before it blames.)"

## Alternatives

- Key the facts by commit, or by base and head: the forge's merge commit is a new commit with the tree already checked, and nothing would be carried.
- A stamp file in the plot's git dir, or a territory command run after green checks: a file outlives the push it speaks for; a command is a new field, a spawn and a failure mode, and the hook still cannot tell who stamped.
- Keep the merge when its run is red and blame the doer: simpler, but a fail caused by the combination would count against someone (ADR 0033 counts it against nobody).
- Expire the ledger at every restart or upgrade: this kingdom upgrades right after its merges, which would lose most of the patrol's gain.

## Consequences

- Not decided here: carrying a check across trees that differ only outside its `when` (K7 of the plan).
- Event additions are optional fields: `v` stays 2, no migration. A wrong carry would hide a red tree for at most 12 hours; the owner's `territory patrol --now` always runs everything.
- A judge reads a branch that holds the base branch; the diff since the plot's base is still the quest's own.
