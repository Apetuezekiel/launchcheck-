import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type {
  CheckContext,
  CheckResult,
  Checker,
  Logger,
  ResolvedConfig,
} from '../../types/index.js';
import { buildProjectContext } from '../context/build-project-context.js';
import { LAUNCHCHECK_VERSION } from '../version.js';
import { ALL_CHECKERS, validateCheckerRegistration } from './registered-checkers.js';

/** Default no-op logger when the caller does not supply one. */
const NOOP_LOGGER: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/** Options for runStaticChecks. */
export interface RunStaticChecksOptions {
  /** Absolute or relative path to the project directory. Required. */
  projectDir: string;
  /** Resolved config. Defaults to a permissive static-run config. */
  config?: ResolvedConfig;
  /** Logger for orchestrator + checker diagnostics. Defaults to no-op. */
  logger?: Logger;
  /** AbortSignal for the run. Defaults to a fresh non-aborted signal. */
  signal?: AbortSignal;
  /**
   * Overrides ALL_CHECKERS. Test-only seam; production callers omit it.
   * When provided, the list is still validated against the registry.
   */
  checkers?: ReadonlyArray<Checker>;
}

/**
 * Static-mode orchestrator. Assembles a static-mode ProjectContext, filters
 * registered checkers to mode 'static' / 'both' AND not disabled in config,
 * invokes each run() in parallel, times each call, and returns the
 * aggregated CheckResult array in (checker order, original result order)
 * sequence.
 *
 * This orchestrator does not resolve config from disk (that is the
 * config-layer dispatch). It accepts an already-resolved ResolvedConfig or
 * builds a permissive default. It does not compute exit codes — that is
 * the reporter / CLI's responsibility.
 *
 * A thrown checker error (a spec violation — Checker.run must not throw)
 * is wrapped into a synthetic fail CheckResult so one bad checker cannot
 * crash the run.
 */
export async function runStaticChecks(options: RunStaticChecksOptions): Promise<CheckResult[]> {
  const checkers = options.checkers ?? ALL_CHECKERS;
  validateCheckerRegistration(checkers);

  const projectDir = options.projectDir;
  const config: ResolvedConfig = options.config ?? defaultStaticConfig(projectDir);
  const logger: Logger = options.logger ?? NOOP_LOGGER;
  const signal: AbortSignal = options.signal ?? new AbortController().signal;

  const project = await buildProjectContext(projectDir, { ignore: config.ignore });

  const ctx: CheckContext = {
    mode: 'static',
    project,
    live: null,
    config,
    logger,
    signal,
    meta: {
      runId: randomUUID(),
      startedAt: new Date(),
      launchcheckVersion: LAUNCHCHECK_VERSION,
      nodeVersion: process.version,
    },
  };

  const eligible = checkers.filter(
    (c) => (c.mode === 'static' || c.mode === 'both') && config.checkers[c.id] !== false,
  );

  const arrays = await Promise.all(eligible.map((checker) => runOne(checker, ctx)));
  return arrays.flat();
}

/** Permissive ResolvedConfig used when the caller omits config. */
function defaultStaticConfig(projectDir: string): ResolvedConfig {
  return {
    url: null,
    projectDir,
    checkers: {},
    thresholds: {},
    checkerOptions: {},
    ignore: [],
  };
}

/**
 * Invokes one checker, times the call, populates durationMs on every
 * returned result, and converts a thrown error into a synthetic fail
 * CheckResult so a single misbehaving checker cannot crash the orchestrator.
 *
 * The synthetic error result uses resultId '__error__' and severity
 * 'critical' regardless of the checker's RegistryEntry.maxSeverity — a
 * thrown checker is an infrastructure failure, not a check finding.
 */
async function runOne(checker: Checker, ctx: CheckContext): Promise<CheckResult[]> {
  const start = performance.now();
  try {
    const results = await checker.run(ctx);
    const elapsed = performance.now() - start;
    return results.map((r) => ({ ...r, durationMs: elapsed }));
  } catch (err) {
    const elapsed = performance.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    ctx.logger.error('Checker threw — spec violation; result wrapped as fail', {
      checkerId: checker.id,
      error: message,
    });
    return [
      {
        checkerId: checker.id,
        resultId: '__error__',
        status: 'fail',
        message: `Checker '${checker.id}' threw: ${message}`,
        fix: 'Investigate the checker implementation — Checker.run must not throw per the spec.',
        severity: 'critical',
        category: checker.category,
        durationMs: elapsed,
      },
    ];
  }
}
