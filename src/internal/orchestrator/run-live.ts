import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type {
  CheckContext,
  CheckResult,
  Checker,
  Logger,
  Mode,
  ProjectContext,
  ResolvedConfig,
} from '../../types/index.js';
import { type BuildLiveContextDeps, buildLiveContext } from '../context/build-live-context.js';
import { buildProjectContext } from '../context/build-project-context.js';
import { ALL_CHECKERS, validateCheckerRegistration } from './registered-checkers.js';

const LAUNCHCHECK_VERSION = '0.0.0';

const NOOP_LOGGER: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/** Options for runLiveChecks. */
export interface RunLiveChecksOptions {
  /** Primary URL under test. Required. */
  url: string;
  /** When provided, the run is 'combined' (static + live); otherwise 'live'. */
  projectDir?: string;
  config?: ResolvedConfig;
  logger?: Logger;
  signal?: AbortSignal;
  /** Test-only override of ALL_CHECKERS; still validated against the registry. */
  checkers?: ReadonlyArray<Checker>;
  /** Test seam: inject a fake HttpClient into the live context. */
  liveDeps?: BuildLiveContextDeps;
}

/**
 * Live/combined orchestrator. Builds a LiveContext (and a ProjectContext when a
 * projectDir is supplied → 'combined' mode), filters registered checkers, runs
 * each run() in parallel, and returns the aggregated CheckResult array. Always
 * disposes live resources before returning.
 *
 * Eligibility:
 *   - 'live'     → checkers with mode 'live' or 'both', not disabled.
 *   - 'combined' → every checker not disabled (static checkers read the
 *     populated project; live checkers read the populated live context).
 *
 * Mirrors run-static's error containment: a thrown checker becomes a synthetic
 * 'fail' so one bad checker cannot crash the run.
 */
export async function runLiveChecks(options: RunLiveChecksOptions): Promise<CheckResult[]> {
  const checkers = options.checkers ?? ALL_CHECKERS;
  validateCheckerRegistration(checkers);

  const combined = options.projectDir !== undefined;
  const config: ResolvedConfig =
    options.config ?? defaultLiveConfig(options.url, options.projectDir);
  const logger: Logger = options.logger ?? NOOP_LOGGER;
  const signal: AbortSignal = options.signal ?? new AbortController().signal;

  const { live, dispose } = buildLiveContext(options.url, options.liveDeps ?? {});

  let project: ProjectContext | null = null;
  if (options.projectDir !== undefined) {
    project = await buildProjectContext(options.projectDir, { ignore: config.ignore });
  }

  const mode: Mode = combined ? 'combined' : 'live';
  const ctx: CheckContext = {
    mode,
    project,
    live,
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

  const eligible = checkers.filter((c) => {
    if (config.checkers[c.id] === false) {
      return false;
    }
    if (combined) {
      return true;
    }
    return c.mode === 'live' || c.mode === 'both';
  });

  try {
    const arrays = await Promise.all(eligible.map((checker) => runOne(checker, ctx)));
    return arrays.flat();
  } finally {
    await dispose();
  }
}

function defaultLiveConfig(url: string, projectDir: string | undefined): ResolvedConfig {
  return {
    url,
    projectDir: projectDir ?? null,
    checkers: {},
    thresholds: {},
    checkerOptions: {},
    ignore: [],
  };
}

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
