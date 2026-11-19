// The v1 event type catalogue (implementation-plan §2.3, glossary §12). It documents the log and names what
// renderers draw; it never restricts `type`, because readers keep unknown types (forward compatible, ADR 0003).

export const EVENT_TYPES = [
  'quest.drafted',
  'quest.created',
  'quest.claimed',
  'quest.released',
  'quest.started',
  'quest.submitted',
  'quest.returned',
  'quest.verdict',
  'quest.done',
  'quest.sealed',
  'quest.archived',
  'quest.blocked',
  'quest.unblocked',
  'quest.paused',
  'quest.resumed',
  'quest.infirmary',
  'quest.delivered',
  'quest.edited',
  'quest.unclaimable',
  'agent.session.start',
  'agent.session.end',
  'agent.session.wrap_up',
  // PS-28: a notch of a running session's stamina bar, written by the Steward for both roles.
  'agent.session.usage',
  'agent.tool',
  'agent.tool.blocked',
  'agent.subagent.start',
  'agent.subagent.end',
  'agent.subagent.overrun',
  'agent.compact',
  'agent.notification',
  'check.start',
  'check.end',
  'verdict.pass',
  'verdict.fail',
  'verdict.partial',
  'mana.level',
  'mana.warning',
  'mana.exhausted',
  'mana.restored',
  'mana.probe',
  'mana.signal',
  'character.created',
  'character.sleep',
  'character.wake',
  'character.meditate',
  'character.suspend',
  'character.release',
  'character.swamp',
  'character.level_up',
  'character.level_down',
  'character.model_changed',
  'command.received',
  'command.applied',
  'command.rejected',
  'delivery.sent',
  // PS-08 (ADR 0023): the Steward delivers a done quest's branch to its forge; PS-08c and PS-08d write them.
  'delivery.pushed',
  'delivery.merged',
  'delivery.failed',
  // PS-08g: the owner's report of a defect that escaped, and the breaker of the seal delegation (ADR 0023).
  'quest.escaped',
  'delegation.suspended',
  'delegation.resumed',
  'plot.patched',
  'plot.merged',
  'plot.restored',
  'chronicle.written',
  // PS-03: the Steward's scheduled jobs; the digest is the first.
  'schedule.ran',
  'digest.written',
  'territory.attached',
  'territory.surveyed',
  'territory.health',
  // PS-26: the Steward's daily patrol of a territory's default branch.
  'patrol.ran',
  // PS-21 (ADR 0029): a territory's code graph, built by the Steward outside every plot.
  'graph.built',
  'graph.failed',
  // PS-02 (ADR 0024): memos the Steward files from handover letters, routes, and closes on the owner's decision.
  'memo.filed',
  'memo.routed',
  'memo.closed',
  // PS-03b: the Chancellor's triage sends a memo to the owner, kingdom.delegation not letting the world decide it.
  'memo.escalated',
  // PS-09c: an advisory the Steward wrote read by a quest it went to, in its next assignee session.
  'memo.delivered',
  // PS-12c (ADR 0027): the Steward applied an operation of the Monk's temple report on one line of scripture, or refused it.
  'lesson.added',
  'lesson.retired',
  'lesson.refused',
  'sandbox.replay.start',
  'sandbox.replay.end',
  'upgrade.started',
  'upgrade.switched',
  'upgrade.rolled_back',
  'upgrade.failed',
  // Run (221) (b): `elvaria tribe check` against the real CLI says what its sessions spent, for the mana estimate.
  'tribe.checked',
  // fix/run-221-followups: a session of the Chancellor's office says what it spent, for the mana estimate.
  'chancellor.answered',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

const KNOWN: ReadonlySet<string> = new Set(EVENT_TYPES);

/** True for a type of the v1 catalogue; renderers skip every other type instead of failing on it. */
export const isKnownEventType = (type: string): type is EventType => KNOWN.has(type);
