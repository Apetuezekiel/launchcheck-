/**
 * Replaced at build time by tsup's `define` option. Falls back to 'dev'
 * for unbuilt runs (direct test invocation via vitest).
 */
export const LAUNCHCHECK_VERSION = process.env.LAUNCHCHECK_VERSION ?? 'dev';
