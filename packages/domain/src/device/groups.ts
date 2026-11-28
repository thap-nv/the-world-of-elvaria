// The three groups of commands by consequence (ADR 0031 item 5, threat model B3, wave-1 plan "Phân quyền theo thiết
// bị"): 1 everyday work, 2 heavy consequences, 3 changes of the trusted configuration. A phone needs a passkey for
// groups 2 and 3 (SEC-08), and a limited device never sends group 3. One row per kind: a kind without a row fails tsc.
import type { CommandPayload, InboxCommand, InboxCommandKind } from '../schema/command/inbox-command.ts';

/** Group 1 is everyday work; these two need a phone's passkey (SEC-08), and a limited device never sends the last. */
export const HEAVY_GROUP = 2;
export const TRUSTED_GROUP = 3;
export type CommandGroup = 1 | typeof HEAVY_GROUP | typeof TRUSTED_GROUP;

/** A kind's group, or how its payload picks one (a payload can only raise the group of its kind, never lower it). */
type GroupRule<K extends InboxCommandKind> = CommandGroup | ((payload: CommandPayload<K>) => CommandGroup);

type GroupTable = { readonly [K in InboxCommandKind]: GroupRule<K> };

/**
 * A quest that skips the royal seal is as heavy as a seal (group 2); one that names secrets of the treasury hands a
 * session the owner's keys, as naming a secret in the configuration does (group 3).
 */
const createQuestGroup = (payload: CommandPayload<'create_quest'>): CommandGroup =>
  (payload.secrets_required?.length ?? 0) > 0
    ? TRUSTED_GROUP
    : payload.seal_required === false
      ? HEAVY_GROUP
      : 1;

/**
 * Raising a mana cap is group 2 (B3). Without the quest at hand the payload cannot tell a raise from a cut, so any
 * new token or attempt ceiling counts as one; so does turning the seal off, as for a new quest.
 */
const editQuestGroup = ({ changes }: CommandPayload<'edit_quest'>): CommandGroup =>
  changes.budget?.max_tokens !== undefined ||
  changes.budget?.max_attempts !== undefined ||
  changes.seal_required === false
    ? HEAVY_GROUP
    : 1;

export const COMMAND_GROUPS: GroupTable = {
  confirm: 1,
  seal: 2,
  return: 1,
  retry: 1,
  cancel: 1,
  archive: 1,
  summon: 1,
  wake: 1,
  suspend: 1,
  release: 1,
  reassign: 1,
  send_to_temple: 1,
  declare_campaign: 1,
  close_campaign: 1,
  create_quest: createQuestGroup,
  answer: 1,
  set_rank: 1,
  attach_territory: 3,
  edit_quest: editQuestGroup,
  pin_tag: 1,
  // A level is a rank ceiling: raising it lets a character take, without the seal, work that needed one.
  set_level: 2,
  set_model: 1,
  decide_memo: 1,
  // Written by the Chancellor's office and the temple only; from a device they are as closed as can be.
  escalate_memo: 3,
  decide_amendment: 3,
  deliver: 2,
  hold: 1,
  unhold: 1,
  submit: 1,
  patrol: 1,
  report_escape: 1,
  resume_delegation: 3,
  temple_report: 3,
  // A guest entry of the merge queue is merged by the Steward once green: a delivery.
  enqueue_branch: 2,
  // (SEC-08) Devices and their keys are the trusted configuration itself. A device's own add_passkey is group 3 too:
  // its first passkey needs no signature, its later ones the signature of one before (SELF_KINDS, may.ts).
  pair_device: 3,
  set_device: 3,
  revoke_device: 3,
  add_passkey: 3,
};

/** The group of one command; a kind's payload rule sees exactly that kind's payload. */
function groupOf<K extends InboxCommandKind>(kind: K, payload: CommandPayload<K>): CommandGroup {
  const rule: GroupRule<K> = COMMAND_GROUPS[kind];
  return typeof rule === 'number' ? rule : rule(payload);
}

export const commandGroupOf = (command: Pick<InboxCommand, 'kind' | 'payload'>): CommandGroup =>
  groupOf(command.kind, command.payload);
