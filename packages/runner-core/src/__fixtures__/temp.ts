// How a spec removes its temp folder (P1-39). On Windows a child that just ended or was killed (git, a check, a
// process tree) or the indexer may hold the folder a moment longer (EBUSY, EPERM, ENOTEMPTY): rm retries, back-off
// up to 5.5 s, as the conformance workspace does (PR #32). Seen under the load of the pre-push hook: patch.spec.ts
// left git running at its timeout, and its afterAll failed with EBUSY.
export const RM_TEMP = { recursive: true, force: true, maxRetries: 10, retryDelay: 100 } as const;
