# ADR 0037 · Paired devices carry a role and a list of territories

- Status: accepted · 2026-11-26 (decided by the owner 2026-11-21, W2–W8 of the wave-1 plan)
- Related: [plans/phase-2-wave-1.md](../plans/phase-2-wave-1.md) "Phân quyền theo thiết bị"; [ADR 0031](0031-herald-pairing-and-session-cookie.md), [ADR 0005](0005-single-writer-steward-inbox.md), [ADR 0003](0003-zod-schema-source-generated-json-schema.md); [threat model](../plans/phase-2-threat-model.md) B3, N10

## Context

ADR 0031 lets one owner pair phones and browsers with the Herald, every device worth the owner. The owner wants to hand a device to someone who works on one repository, or who only asks questions about it (383a–383c), without that device seeing or touching the rest of the kingdom.

## Decision

1. **Roles.** A device is `full` (everything the owner may do), `scoped` (every command whose scope is one of its territories, in the same groups as `full`, never group 3) or `inquiry` (on its territories: a quest whose kind delivers a `report`, and `answer` and `cancel` of its own read-only quests, P2-01d). `scoped` and `inquiry` carry at least one territory; `full` carries none.
2. **One file per device**, `devices/<id>.json` (contract `device` v1, id `dev_<day>_<6>`), written only by the owner's own commands (`elvaria herald pair|device|revoke`, P2-01b; from a `full` device with a passkey, SEC-08). `revoked_at` ends it. The Herald's session file keeps only session hashes naming a device.
3. **The rules are data and pure functions** in `domain/src/device`: `COMMAND_GROUPS` (the three groups of ADR 0031, a payload may raise its kind's group) and `COMMAND_SCOPES` (the territories a payload's territory, quests and memos reach, or `kingdom`), one row per inbox kind so a new kind without a row fails `tsc`; `deviceMay` answers with a refusal code (`unknown_device`, `device_revoked`, `role_forbids`, `outside_territories`, `passkey_required`). A phone's group 2 or 3 needs the passkey (until SEC-08: refused).
4. **Checked twice.** The Herald writes `source` and `device` on each command it puts in `inbox/`; the Steward reads the device file again and calls `deviceMay` for every command of source `herald` or `lite`, refusing with the code and the device on `command.rejected`. Commands of other sources are unchanged.
5. **A limited device sees its territories only**: `scopeState` keeps its territories, their quests and those quests' memos, every character with a quest outside cleared, and the kingdom's pools, tribes and thresholds; `scopeEvents` sends the lines of an allow list (closed when unsure) and says when a line it holds back changed what the device sees, so the Herald sends a fresh snapshot.

## Consequences

- A kingdom with no device behaves as before; `kingdom.herald` (port 7411, extra origins) is optional.
- A local program can still write a command as `cli`: the second check catches a Herald's mistake, not the OS user (threat model R2, (365)).
- A quest line elsewhere that moves a character makes a limited device resync: more snapshots, no extra event type.
- Every new inbox kind needs a row in both tables; P2-09 and P2-10 add theirs to the inquiry kinds.
