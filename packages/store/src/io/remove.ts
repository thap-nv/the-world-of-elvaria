// How Elvaria removes a folder it made (a build, a throwaway kingdom). On Windows a child that just ended or was
// killed, an antivirus or the indexer may hold a file a moment longer (EBUSY, EPERM, ENOTEMPTY): rm retries with a
// linear back-off, up to 5.5 s in all (P1-39). The one copy for running code (architecture-health V7, R7); test
// code takes the same numbers from @elvaria/testkit, which may import nothing.
export const RM_RETRY = { recursive: true, force: true, maxRetries: 10, retryDelay: 100 } as const;
