// The tokens a session spends against quest.budget.max_tokens (implementation-plan §3.4, P1-23). A CLI reports what
// it sent and got; reads of the prompt cache count at a tenth, as their price does, so a long session that reads its
// cached context again on every call is not cut while a runaway one still is. One rule for every adapter: the
// runner counts with it, and attempt_log, `agent.session.end` and the breaker all hold the same number.
import { CACHE_READS_PER_TOKEN } from '../constants.ts';

/** What a CLI reported, split where the price differs. */
export interface SessionTokens {
  /** Input, output and cache writes, which count in full. */
  readonly tokens: number;
  /** Reads of the prompt cache. */
  readonly cache_read: number;
}

/** The session's tokens as the breaker counts them: a whole number that never goes down as both parts grow. */
export const countedTokens = (usage: SessionTokens): number =>
  usage.tokens + Math.ceil(usage.cache_read / CACHE_READS_PER_TOKEN);
