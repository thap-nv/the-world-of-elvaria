// How a spec removes its temp folder (P1-39, P1-43): on Windows a child that just ended (a fake CLI, a hook) or the
// indexer may hold the folder a moment longer (EBUSY, EPERM, ENOTEMPTY), so rm retries, back-off up to 5.5 s, as
// runner-core's specs and its conformance workspace do.
export const RM_TEMP = { recursive: true, force: true, maxRetries: 10, retryDelay: 100 } as const;
