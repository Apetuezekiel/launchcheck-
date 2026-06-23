import type { CheckContext, Checker, CorsPolicyOptions } from '../../types/index.js';
import { liveResult, withRootResponse } from '../runtime/live-checker-support.js';

const ID = 'cors-not-wildcard';
const CAT = 'security' as const;
const SEV = 'critical' as const;

// An arbitrary origin the target has no reason to allowlist. If it is echoed
// back in Access-Control-Allow-Origin, the server reflects any origin.
const PROBE_ORIGIN = 'https://launchcheck-cors-probe.example';

function resolveProbePath(ctx: CheckContext): string {
  const raw = ctx.config.checkerOptions['cors-policy'];
  const opts = (typeof raw === 'object' && raw !== null ? raw : {}) as CorsPolicyOptions;
  return typeof opts.probePath === 'string' && opts.probePath.length > 0 ? opts.probePath : '/';
}

export const corsNotWildcardChecker: Checker = {
  id: ID,
  name: 'CORS not wildcard in production',
  category: CAT,
  mode: 'live',
  consumes: ['rootResponse', 'http'],
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
    // Reuse the shared root-reachability preamble so we never judge CORS on a
    // host that is itself down.
    const got = await withRootResponse(ctx, ID, CAT, SEV);
    if (got.kind === 'done') {
      return got.results;
    }
    const target = new URL(resolveProbePath(ctx), live.url).toString();
    let acao: string | null;
    let acac: string | null;
    try {
      const res = await live.http.fetch(target, {
        method: 'OPTIONS',
        headers: { origin: PROBE_ORIGIN, 'access-control-request-method': 'GET' },
      });
      acao = res.headers.get('access-control-allow-origin');
      acac = res.headers.get('access-control-allow-credentials');
    } catch (err) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'warn',
          'cors-probe-failed',
          `CORS preflight to ${target} failed: ${(err as Error).message}`,
          { fix: 'Ensure the endpoint answers OPTIONS requests, then re-check.' },
        ),
      ];
    }
    if (acao === null) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'pass',
          'cors-not-exposed',
          `No Access-Control-Allow-Origin on OPTIONS ${target}; resource is not exposed cross-origin.`,
        ),
      ];
    }
    if (acao === '*') {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'fail',
          'cors-wildcard',
          'Access-Control-Allow-Origin is "*"; any site can read cross-origin responses.',
          {
            fix: 'Restrict Access-Control-Allow-Origin to an explicit allowlist of trusted origins.',
          },
        ),
      ];
    }
    if (acao === PROBE_ORIGIN) {
      if (acac !== null && acac.toLowerCase() === 'true') {
        return [
          liveResult(
            ID,
            CAT,
            SEV,
            'fail',
            'cors-reflects-with-credentials',
            'Server reflects an arbitrary Origin AND sets Access-Control-Allow-Credentials: true; credentialed requests from any site are allowed.',
            {
              fix: 'Reflect only allowlisted origins; never reflect arbitrary origins with credentials enabled.',
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
          'cors-reflects-origin',
          'Server reflects an arbitrary request Origin in Access-Control-Allow-Origin; this is effectively a wildcard.',
          { fix: 'Reflect only origins on an explicit allowlist.' },
        ),
      ];
    }
    return [
      liveResult(
        ID,
        CAT,
        SEV,
        'pass',
        'cors-restricted',
        `Access-Control-Allow-Origin is a fixed origin (${acao}), not a wildcard.`,
      ),
    ];
  },
};
