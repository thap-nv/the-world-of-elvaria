// A child process never inherits process.env whole (ADR 0013, CLAUDE.md): it gets what a toolchain needs to start
// and find its own settings. One allowlist for every child, the CLI's own programs and the sessions alike: the
// treasury module of runner-core holds it (implementation-plan §3.9).
export { minimalEnv } from '@elvaria/runner-core';
