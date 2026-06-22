import type { CheckContext, Checker, HealthEndpointOptions } from '../../types/index.js';
import { liveResult } from '../runtime/live-checker-support.js';

const ID = 'health-endpoint-responds';
const CAT = 'deployment' as const;
const SEV = 'major' as const;
const DEFAULT_PATHS = ['/health', '/healthz', '/api/health'];

function resolvePaths(ctx: CheckContext): string[] {
  const raw = ctx.config.checkerOptions['health-endpoint'];
  const opts = (typeof raw === 'object' && raw !== null ? raw : {}) as HealthEndpointOptions;
  const paths = opts.paths;
  if (Array.isArray(paths) && paths.length > 0 && paths.every((p) => typeof p === 'string')) {
    return paths;
  }
  return DEFAULT_PATHS;
}

interface Probe {
  path: string;
  status: number | null;
}

export const healthEndpointRespondsChecker: Checker = {
  id: ID,
  name: 'Health endpoint returns 2xx',
  category: CAT,
  mode: 'live',
  consumes: ['http'],
  async run(ctx) {
    if (ctx.live === null) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'skip',
          'no-live-context',
          'Skipped: no live context (run with --url).',
        ),
      ];
    }
    const live = ctx.live;
    const paths = resolvePaths(ctx);
    const probes: Probe[] = await Promise.all(
      paths.map(async (path): Promise<Probe> => {
        const target = new URL(path, live.url).toString();
        try {
          const res = await live.http.fetch(target);
          return { path, status: res.status };
        } catch {
          return { path, status: null };
        }
      }),
    );
    const summary = probes.map((p) => `${p.path} -> ${p.status ?? 'unreachable'}`).join(', ');
    const ok = probes.find((p) => p.status !== null && p.status >= 200 && p.status < 300);
    if (ok) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'pass',
          'health-ok',
          `Health endpoint ${ok.path} returned ${ok.status}.`,
          { detail: summary },
        ),
      ];
    }
    const hasServerErrorOrUnreachable = probes.some((p) => p.status === null || p.status >= 500);
    if (hasServerErrorOrUnreachable) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'fail',
          'health-unhealthy',
          'No health endpoint returned 2xx; at least one returned a 5xx or was unreachable.',
          {
            detail: summary,
            fix: 'Expose a health endpoint that returns 2xx when the service is up.',
          },
        ),
      ];
    }
    return [
      liveResult(
        ID,
        CAT,
        SEV,
        'warn',
        'health-not-found',
        'No health endpoint found among the probed paths (all returned 4xx).',
        {
          detail: summary,
          fix: 'Add a health endpoint (e.g. /health) or set the `health-endpoint` paths option.',
        },
      ),
    ];
  },
};
