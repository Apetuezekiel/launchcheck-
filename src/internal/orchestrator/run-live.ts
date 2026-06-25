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
import { LAUNCHCHECK_VERSION } from '../version.js';
import { ALL_CHECKERS, validateCheckerRegistration } from './registered-checkers.js';

const NOOP_LOGGER: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/** Options for runLiveChecks. */
export interface RunLiveChecksOptions {
  /** Primary URL under test. Required unless `urls` is provided. */
  url?: string;
  /** Multiple URLs to test; live checkers run once per URL, tagged by URL. */
  urls?: string[];
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
 * Live/combined orchestrator. Runs static checkers once (combined mode only) and
 * live checkers once per URL, tagging each live result with its URL. Builds a
 * ProjectContext once when projectDir is supplied (→ 'combined' mode) and a fresh
 * LiveContext per URL, always disposed before the next URL. n=1 is the previous
 * single-URL behavior.
 *
 * Eligibility:
 *   - static (mode 'static')         → once, not URL-tagged (combined only).
 *   - live   (mode 'live' | 'both')  → once per URL, URL-tagged.
 *
 * Mirrors run-static's error containment: a thrown checker becomes a synthetic
 * 'fail' so one bad checker cannot crash the run.
 */
export async function runLiveChecks(options: RunLiveChecksOptions): Promise<CheckResult[]> {
  const checkers = options.checkers ?? ALL_CHECKERS;
  validateCheckerRegistration(checkers);

  const combined = options.projectDir !== undefined;
  const targets =
    options.urls !== undefined && options.urls.length > 0
      ? options.urls
      : options.url !== undefined
        ? [options.url]
        : [];
  if (targets.length === 0) {
    throw new Error('runLiveChecks requires `url` or a non-empty `urls`.');
  }

  const config: ResolvedConfig =
    options.config ?? defaultLiveConfig(targets[0] as string, options.projectDir);
  const logger: Logger = options.logger ?? NOOP_LOGGER;
  const signal: AbortSignal = options.signal ?? new AbortController().signal;

  let project: ProjectContext | null = null;
  if (options.projectDir !== undefined) {
    project = await buildProjectContext(options.projectDir, { ignore: config.ignore });
  }

  const meta = {
    runId: randomUUID(),
    startedAt: new Date(),
    launchcheckVersion: LAUNCHCHECK_VERSION,
    nodeVersion: process.version,
  };

  const results: CheckResult[] = [];

  // Static checkers run exactly once per run (combined mode only); not URL-tagged.
  if (combined && project !== null) {
    const staticCtx: CheckContext = {
      mode: 'combined',
      project,
      live: null,
      config,
      logger,
      signal,
      meta,
    };
    const staticEligible = checkers.filter(
      (c) => c.mode === 'static' && config.checkers[c.id] !== false,
    );
    const staticArrays = await Promise.all(
      staticEligible.map((checker) => runOne(checker, staticCtx)),
    );
    for (const arr of staticArrays) {
      results.push(...arr);
    }
  }

  // Live checkers run once per URL; every result is tagged with its URL.
  const liveEligible = checkers.filter(
    (c) => (c.mode === 'live' || c.mode === 'both') && config.checkers[c.id] !== false,
  );
  const mode: Mode = combined ? 'combined' : 'live';
  for (const url of targets) {
    const { live, dispose } = buildLiveContext(url, { signal, ...(options.liveDeps ?? {}) });
    const ctx: CheckContext = { mode, project, live, config, logger, signal, meta };
    try {
      const arrays = await Promise.all(liveEligible.map((checker) => runOne(checker, ctx)));
      for (const arr of arrays) {
        for (const r of arr) {
          results.push({ ...r, url });
        }
      }
    } finally {
      await dispose();
    }
  }

  return results;
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
