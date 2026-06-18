import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type {
  CheckCategory,
  CheckContext,
  CheckResult,
  Checker,
  CheckerMode,
  ResolvedConfig,
} from '../../../types/index.js';
import { runStaticChecks } from '../run-static.js';

/**
 * Stub Checker factory. The id must correspond to a real RegistryEntry
 * because validateCheckerRegistration runs unconditionally on every
 * orchestrator invocation. See the orchestrator dispatch for the table
 * of stub-friendly real ids:
 *   - 'console-log-scan'     mode static, category code-quality
 *   - 'env-example-exists'   mode static, category deployment
 *   - 'a11y-color-contrast'  mode live,   category accessibility
 */
function stub(args: {
  id: string;
  category: CheckCategory;
  mode: CheckerMode;
  run?: (ctx: CheckContext) => Promise<CheckResult[]>;
}): Checker {
  return {
    id: args.id,
    name: args.id,
    category: args.category,
    mode: args.mode,
    run: args.run ?? (async () => []),
  };
}

/** Single canonical result emitted by a stub, identified by id. */
function makeResult(checkerId: string, resultId = 'ok'): CheckResult {
  return {
    checkerId,
    resultId,
    status: 'pass',
    message: `result from ${checkerId}/${resultId}`,
    severity: 'info',
    category: 'code-quality',
  };
}

/** Permissive ResolvedConfig template. */
function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    url: null,
    projectDir: null,
    checkers: {},
    thresholds: {},
    checkerOptions: {},
    ignore: [],
    ...overrides,
  };
}

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'launchcheck-orch-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('runStaticChecks', () => {
  test('returns aggregated results from a single registered checker', async () => {
    const checker = stub({
      id: 'console-log-scan',
      category: 'code-quality',
      mode: 'static',
      run: async () => [makeResult('console-log-scan')],
    });
    const results = await runStaticChecks({ projectDir: root, checkers: [checker] });
    expect(results).toHaveLength(1);
    expect(results[0]?.checkerId).toBe('console-log-scan');
  });

  test('returns results from multiple checkers in checker-order', async () => {
    const a = stub({
      id: 'console-log-scan',
      category: 'code-quality',
      mode: 'static',
      run: async () => [makeResult('console-log-scan')],
    });
    const b = stub({
      id: 'env-example-exists',
      category: 'deployment',
      mode: 'static',
      run: async () => [makeResult('env-example-exists')],
    });
    const results = await runStaticChecks({ projectDir: root, checkers: [a, b] });
    expect(results.map((r) => r.checkerId)).toEqual(['console-log-scan', 'env-example-exists']);
  });

  test('filters out checkers with mode "live" (uses real registry id "a11y-color-contrast")', async () => {
    let liveRan = false;
    const staticOne = stub({
      id: 'console-log-scan',
      category: 'code-quality',
      mode: 'static',
      run: async () => [makeResult('console-log-scan')],
    });
    const liveOne = stub({
      id: 'a11y-color-contrast',
      category: 'accessibility',
      mode: 'live',
      run: async () => {
        liveRan = true;
        return [makeResult('a11y-color-contrast')];
      },
    });
    const results = await runStaticChecks({ projectDir: root, checkers: [staticOne, liveOne] });
    expect(liveRan).toBe(false);
    expect(results.map((r) => r.checkerId)).toEqual(['console-log-scan']);
  });

  test('skips checkers where config.checkers[id] === false', async () => {
    let ran = false;
    const checker = stub({
      id: 'console-log-scan',
      category: 'code-quality',
      mode: 'static',
      run: async () => {
        ran = true;
        return [makeResult('console-log-scan')];
      },
    });
    const config = makeConfig({ checkers: { 'console-log-scan': false } });
    const results = await runStaticChecks({ projectDir: root, config, checkers: [checker] });
    expect(ran).toBe(false);
    expect(results).toHaveLength(0);
  });

  test('runs checkers where config.checkers[id] === true', async () => {
    const checker = stub({
      id: 'console-log-scan',
      category: 'code-quality',
      mode: 'static',
      run: async () => [makeResult('console-log-scan')],
    });
    const config = makeConfig({ checkers: { 'console-log-scan': true } });
    const results = await runStaticChecks({ projectDir: root, config, checkers: [checker] });
    expect(results).toHaveLength(1);
  });

  test('runs checkers when config.checkers[id] is absent (default enabled)', async () => {
    const checker = stub({
      id: 'console-log-scan',
      category: 'code-quality',
      mode: 'static',
      run: async () => [makeResult('console-log-scan')],
    });
    const config = makeConfig({ checkers: {} });
    const results = await runStaticChecks({ projectDir: root, config, checkers: [checker] });
    expect(results).toHaveLength(1);
  });

  test('sets durationMs (>= 0) on every emitted result', async () => {
    const checker = stub({
      id: 'console-log-scan',
      category: 'code-quality',
      mode: 'static',
      run: async () => [makeResult('console-log-scan', 'a'), makeResult('console-log-scan', 'b')],
    });
    const results = await runStaticChecks({ projectDir: root, checkers: [checker] });
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.durationMs).toBeDefined();
      expect(r.durationMs).toBeGreaterThanOrEqual(0);
    }
    // Same checker call -> same duration for every result it emitted.
    expect(results[0]?.durationMs).toBe(results[1]?.durationMs);
  });

  test('ctx passed to checkers has mode "static", live null, project non-null', async () => {
    let captured: CheckContext | null = null;
    const checker = stub({
      id: 'console-log-scan',
      category: 'code-quality',
      mode: 'static',
      run: async (c) => {
        captured = c;
        return [];
      },
    });
    await runStaticChecks({ projectDir: root, checkers: [checker] });
    expect(captured).not.toBeNull();
    const ctx = captured as unknown as CheckContext;
    expect(ctx.mode).toBe('static');
    expect(ctx.live).toBeNull();
    expect(ctx.project).not.toBeNull();
    expect(ctx.project?.projectDir).toBe(path.resolve(root));
  });

  test('ctx.meta has a UUID runId, Date startedAt, launchcheckVersion "0.0.0", nodeVersion === process.version', async () => {
    let captured: CheckContext | null = null;
    const checker = stub({
      id: 'console-log-scan',
      category: 'code-quality',
      mode: 'static',
      run: async (c) => {
        captured = c;
        return [];
      },
    });
    await runStaticChecks({ projectDir: root, checkers: [checker] });
    const ctx = captured as unknown as CheckContext;
    expect(ctx.meta.runId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(ctx.meta.startedAt).toBeInstanceOf(Date);
    expect(ctx.meta.launchcheckVersion).toBe('0.0.0');
    expect(ctx.meta.nodeVersion).toBe(process.version);
  });

  test('passes options.config.ignore through to buildProjectContext', async () => {
    await fs.writeFile(path.join(root, 'keep.ts'), 'export const k = 1;\n');
    await fs.writeFile(path.join(root, 'skip.ts'), 'export const s = 1;\n');
    let captured: CheckContext | null = null;
    const checker = stub({
      id: 'console-log-scan',
      category: 'code-quality',
      mode: 'static',
      run: async (c) => {
        captured = c;
        return [];
      },
    });
    const config = makeConfig({ ignore: ['skip.ts'] });
    await runStaticChecks({ projectDir: root, config, checkers: [checker] });
    const ctx = captured as unknown as CheckContext;
    const files = await ctx.project?.fs.glob('**/*.ts');
    expect(files?.some((f) => f.endsWith('keep.ts'))).toBe(true);
    expect(files?.some((f) => f.endsWith('skip.ts'))).toBe(false);
  });

  test('uses the supplied AbortSignal (ctx.signal === options.signal)', async () => {
    const controller = new AbortController();
    let captured: CheckContext | null = null;
    const checker = stub({
      id: 'console-log-scan',
      category: 'code-quality',
      mode: 'static',
      run: async (c) => {
        captured = c;
        return [];
      },
    });
    await runStaticChecks({ projectDir: root, signal: controller.signal, checkers: [checker] });
    const ctx = captured as unknown as CheckContext;
    expect(ctx.signal).toBe(controller.signal);
  });

  test('uses default config when none is supplied', async () => {
    let captured: CheckContext | null = null;
    const checker = stub({
      id: 'console-log-scan',
      category: 'code-quality',
      mode: 'static',
      run: async (c) => {
        captured = c;
        return [];
      },
    });
    await runStaticChecks({ projectDir: root, checkers: [checker] });
    const ctx = captured as unknown as CheckContext;
    expect(ctx.config.url).toBeNull();
    expect(ctx.config.projectDir).toBe(root);
    expect(ctx.config.checkers).toEqual({});
    expect(ctx.config.thresholds).toEqual({});
    expect(ctx.config.checkerOptions).toEqual({});
    expect(ctx.config.ignore).toEqual([]);
  });

  test('runs eligible checkers in parallel (peak concurrent invocations >= 2)', async () => {
    // Counter-based assertion: a shared in-flight counter is incremented on
    // run() entry and decremented on exit, tracking the peak. Parallel
    // execution drives peak >= 2 (both checkers in-flight together); serial
    // would cap peak at 1. Independent of wall-clock timing, so the
    // assertion does not flake under CPU contention or filesystem jitter —
    // unlike the prior `elapsed < 350ms` form which tripped on Windows when
    // buildProjectContext setup ate the budget.
    let inflight = 0;
    let peak = 0;
    const slowRun = async (): Promise<CheckResult[]> => {
      inflight += 1;
      peak = Math.max(peak, inflight);
      try {
        await new Promise<void>((r) => setTimeout(r, 20));
      } finally {
        inflight -= 1;
      }
      return [];
    };
    const a = stub({
      id: 'console-log-scan',
      category: 'code-quality',
      mode: 'static',
      run: slowRun,
    });
    const b = stub({
      id: 'env-example-exists',
      category: 'deployment',
      mode: 'static',
      run: slowRun,
    });
    await runStaticChecks({ projectDir: root, checkers: [a, b] });
    expect(peak).toBeGreaterThanOrEqual(2);
  });

  test('wraps a thrown checker error: status fail, resultId "__error__", severity critical, category from checker, fix present, durationMs set', async () => {
    const checker = stub({
      id: 'console-log-scan',
      category: 'code-quality',
      mode: 'static',
      run: async () => {
        throw new Error('boom');
      },
    });
    const results = await runStaticChecks({ projectDir: root, checkers: [checker] });
    expect(results).toHaveLength(1);
    const r = results[0];
    expect(r?.status).toBe('fail');
    expect(r?.resultId).toBe('__error__');
    expect(r?.severity).toBe('critical');
    expect(r?.category).toBe('code-quality');
    expect(r?.checkerId).toBe('console-log-scan');
    expect(r?.message).toContain('boom');
    expect(r?.fix).toBeTruthy();
    expect(r?.durationMs).toBeDefined();
    expect(r?.durationMs).toBeGreaterThanOrEqual(0);
  });

  test('logs a thrown checker error via the supplied logger.error', async () => {
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const checker = stub({
      id: 'console-log-scan',
      category: 'code-quality',
      mode: 'static',
      run: async () => {
        throw new Error('boom');
      },
    });
    await runStaticChecks({ projectDir: root, logger, checkers: [checker] });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      'Checker threw — spec violation; result wrapped as fail',
      { checkerId: 'console-log-scan', error: 'boom' },
    );
  });

  test('durationMs set by the checker is overwritten by the orchestrator', async () => {
    // Per CheckResult.durationMs documentation, the orchestrator owns
    // wall-clock timing — a checker that sets durationMs itself must
    // not influence what the orchestrator reports. Lock the contract:
    // a fast stub claiming 999_999ms must come back with the
    // orchestrator's actual measurement (orders of magnitude smaller).
    const checker = stub({
      id: 'console-log-scan',
      category: 'code-quality',
      mode: 'static',
      run: async () => [{ ...makeResult('console-log-scan'), durationMs: 999_999 }],
    });
    const results = await runStaticChecks({ projectDir: root, checkers: [checker] });
    expect(results).toHaveLength(1);
    expect(results[0]?.durationMs).not.toBe(999_999);
    expect(results[0]?.durationMs).toBeLessThan(60_000);
  });

  test('every registered checker emits unique resultIds within its own output', async () => {
    // The spec requires (checkerId, resultId) uniqueness within a single
    // checker invocation. Runs the real registered checkers against the
    // (empty) tmp project and asserts the contract end-to-end so a
    // regression in any one checker's multi-emit logic surfaces here.
    const results = await runStaticChecks({ projectDir: root });
    const byChecker = new Map<string, string[]>();
    for (const r of results) {
      const arr = byChecker.get(r.checkerId);
      if (arr !== undefined) {
        arr.push(r.resultId);
      } else {
        byChecker.set(r.checkerId, [r.resultId]);
      }
    }
    for (const [, resultIds] of byChecker) {
      expect(new Set(resultIds).size).toBe(resultIds.length);
    }
  });

  test('a thrown checker does not abort the run — other checkers still complete', async () => {
    const thrower = stub({
      id: 'console-log-scan',
      category: 'code-quality',
      mode: 'static',
      run: async () => {
        throw new Error('boom');
      },
    });
    const ok = stub({
      id: 'env-example-exists',
      category: 'deployment',
      mode: 'static',
      run: async () => [makeResult('env-example-exists')],
    });
    const results = await runStaticChecks({ projectDir: root, checkers: [thrower, ok] });
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.checkerId).sort()).toEqual([
      'console-log-scan',
      'env-example-exists',
    ]);
    const errResult = results.find((r) => r.checkerId === 'console-log-scan');
    const okResult = results.find((r) => r.checkerId === 'env-example-exists');
    expect(errResult?.status).toBe('fail');
    expect(errResult?.resultId).toBe('__error__');
    expect(okResult?.status).toBe('pass');
  });
});
