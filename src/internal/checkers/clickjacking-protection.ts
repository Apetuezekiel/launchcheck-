import type { Checker } from '../../types/index.js';
import { liveResult, withRootResponse } from '../runtime/live-checker-support.js';

const ID = 'clickjacking-protection';
const CAT = 'security' as const;
const SEV = 'major' as const;

export const clickjackingProtectionChecker: Checker = {
  id: ID,
  name: 'X-Frame-Options or CSP frame-ancestors',
  category: CAT,
  mode: 'live',
  consumes: ['rootResponse'],
  async run(ctx) {
    const got = await withRootResponse(ctx, ID, CAT, SEV);
    if (got.kind === 'done') {
      return got.results;
    }
    const headers = got.response.headers;
    const xfo = headers.get('x-frame-options');
    const csp = headers.get('content-security-policy');
    const hasFrameAncestors = csp !== null && /frame-ancestors/i.test(csp);
    if ((xfo !== null && xfo.trim().length > 0) || hasFrameAncestors) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'pass',
          'clickjacking-protected',
          'Clickjacking protection present (X-Frame-Options or CSP frame-ancestors).',
        ),
      ];
    }
    return [
      liveResult(
        ID,
        CAT,
        SEV,
        'fail',
        'clickjacking-unprotected',
        'No X-Frame-Options header and no CSP frame-ancestors directive.',
        {
          fix: 'Set `X-Frame-Options: DENY` or a CSP `frame-ancestors` directive.',
        },
      ),
    ];
  },
};
