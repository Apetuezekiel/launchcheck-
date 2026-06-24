/**
 * Package version, replaced at build time by tsup's `define` (from package.json).
 * Falls back to 'dev' for unbuilt runs (e.g. vitest). Shared by the CLI and the
 * orchestrator so report metadata (CheckContext.meta.launchcheckVersion) matches
 * the published version instead of a hardcoded placeholder.
 */
export const LAUNCHCHECK_VERSION = process.env.LAUNCHCHECK_VERSION ?? 'dev';
