// What an adapter can do, declared per adapter and CLI version (implementation-plan §3.14, ADR 0021). The core
// never asks which CLI a tribe runs: it reads these flags, and tribeLimitsOf narrows a tribe that lacks one.

/**
 * headless and context_file are required (context falls back to the prompt); events, tool_gate, usage and
 * structured_output should be there; resume, compact and a bounded subagent are optional.
 */
export const ADAPTER_CAPABILITIES = [
  'headless',
  'context_file',
  'events',
  'tool_gate',
  'usage',
  'structured_output',
  'resume',
  'compact',
  'subagent',
] as const;

export type AdapterCapability = (typeof ADAPTER_CAPABILITIES)[number];

/** `AgentRunner.capabilities`: static per adapter and CLI version; `elvaria doctor` prints it. */
export type AdapterCapabilities = Readonly<Record<AdapterCapability, boolean>>;
